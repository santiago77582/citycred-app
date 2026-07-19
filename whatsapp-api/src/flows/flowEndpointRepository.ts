import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { AppError } from '../errors/AppError.js';
import { decryptStoredFlowData, encryptStoredFlowData } from './storageCrypto.js';

export type RegisteredFlowToken = {
  id: string;
  flowId: string;
  waId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
};

type TokenRow = {
  id: string;
  flow_id: string;
  wa_id: string;
  status: RegisteredFlowToken['status'];
  expires_at: string;
};

function mapToken(row: TokenRow): RegisteredFlowToken {
  return {
    id: row.id,
    flowId: row.flow_id,
    waId: row.wa_id,
    status: row.status,
    expiresAt: row.expires_at
  };
}

export function flowTokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function registerFlowToken(params: {
  token: string;
  flowId: string;
  waId: string;
  expiresAt?: Date;
}): Promise<RegisteredFlowToken> {
  const hash = flowTokenHash(params.token);
  const expiresAt = params.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const inserted = await pool.query<TokenRow>(
    `INSERT INTO whatsapp_flow_tokens (
       id, token_hash, flow_id, wa_id, expires_at
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (token_hash) DO NOTHING
     RETURNING id, flow_id, wa_id, status, expires_at`,
    [randomUUID(), hash, params.flowId, params.waId, expiresAt]
  );
  if (inserted.rows[0]) return mapToken(inserted.rows[0]);

  const existing = await pool.query<TokenRow>(
    `SELECT id, flow_id, wa_id, status, expires_at
     FROM whatsapp_flow_tokens WHERE token_hash = $1`,
    [hash]
  );
  const row = existing.rows[0];
  if (!row) throw new AppError('No se pudo registrar el token del Flow.', 500);
  if (row.flow_id !== params.flowId || row.wa_id !== params.waId) {
    throw new AppError('El token del Flow ya está asociado a otro envío.', 409);
  }
  return mapToken(row);
}

export async function findUsableFlowToken(token: string): Promise<RegisteredFlowToken | null> {
  const result = await pool.query<TokenRow>(
    `SELECT id, flow_id, wa_id, status, expires_at
     FROM whatsapp_flow_tokens
     WHERE token_hash = $1`,
    [flowTokenHash(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.status !== 'ACTIVE') return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await pool.query(
      `UPDATE whatsapp_flow_tokens
       SET status = 'EXPIRED', updated_at = NOW()
       WHERE id = $1 AND status = 'ACTIVE'`,
      [row.id]
    );
    return null;
  }
  return mapToken(row);
}

export async function saveFlowSession(params: {
  token: RegisteredFlowToken;
  screen: string | null;
  data: Record<string, unknown>;
  storageMaterial: string;
  complete?: boolean;
}): Promise<Record<string, unknown>> {
  const existing = await pool.query<{
    encrypted_data: Buffer | null;
    data_iv: Buffer | null;
    data_tag: Buffer | null;
  }>(
    `SELECT encrypted_data, data_iv, data_tag
     FROM whatsapp_flow_sessions WHERE token_id = $1`,
    [params.token.id]
  );
  const previous = existing.rows[0]
    ? decryptStoredFlowData({
        encryptedData: existing.rows[0].encrypted_data,
        iv: existing.rows[0].data_iv,
        tag: existing.rows[0].data_tag,
        material: params.storageMaterial
      })
    : {};
  const merged = { ...previous, ...params.data };
  const encrypted = encryptStoredFlowData(merged, params.storageMaterial);
  await pool.query(
    `INSERT INTO whatsapp_flow_sessions (
       id, token_id, current_screen, encrypted_data, data_iv, data_tag, completed
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (token_id) DO UPDATE SET
       current_screen = EXCLUDED.current_screen,
       encrypted_data = EXCLUDED.encrypted_data,
       data_iv = EXCLUDED.data_iv,
       data_tag = EXCLUDED.data_tag,
       completed = whatsapp_flow_sessions.completed OR EXCLUDED.completed,
       updated_at = NOW()`,
    [
      randomUUID(),
      params.token.id,
      params.screen,
      encrypted.encryptedData,
      encrypted.iv,
      encrypted.tag,
      params.complete ?? false
    ]
  );
  return merged;
}

export async function completeFlowToken(token: RegisteredFlowToken): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_flow_tokens
     SET status = 'COMPLETED', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
     WHERE id = $1 AND status = 'ACTIVE'`,
    [token.id]
  );
}

export async function applyCompletedFlowToContact(params: {
  token: RegisteredFlowToken;
  data: Record<string, unknown>;
}): Promise<void> {
  const stringValue = (key: string, max: number) => {
    const value = params.data[key];
    return typeof value === 'string' && value.trim()
      ? value.trim().slice(0, max)
      : null;
  };
  const quotaRaw = params.data.available_quota ?? params.data.cupo ?? params.data.quota;
  const quota = typeof quotaRaw === 'number'
    ? quotaRaw
    : typeof quotaRaw === 'string'
      ? Number(quotaRaw.replace(/[^0-9]/g, ''))
      : Number.NaN;
  const botContext = {
    flowCompletedAt: new Date().toISOString(),
    flowId: params.token.flowId
  };
  await pool.query(
    `UPDATE contacts SET
       profile_name = COALESCE($2, profile_name),
       entity = COALESCE($3, entity),
       document_number = COALESCE($4, document_number),
       seniority_range = COALESCE($5, seniority_range),
       available_quota = CASE WHEN $6::boolean THEN $7 ELSE available_quota END,
       commercial_status = CASE
         WHEN commercial_status = 'DO_NOT_CONTACT' THEN commercial_status
         ELSE 'UNDER_REVIEW'
       END,
       bot_context = bot_context || $8::jsonb,
       updated_at = NOW()
     WHERE wa_id = $1 AND archived_at IS NULL`,
    [
      params.token.waId,
      stringValue('profile_name', 150) ?? stringValue('name', 150),
      stringValue('entity', 100),
      stringValue('document_number', 30) ?? stringValue('dni', 30),
      stringValue('seniority_range', 50) ?? stringValue('seniority', 50),
      Number.isFinite(quota) && quota >= 0 && quota <= 1_000_000_000,
      Number.isFinite(quota) ? quota : null,
      JSON.stringify(botContext)
    ]
  );
}

export async function findFlowEventResponse(
  requestFingerprint: string
): Promise<Record<string, unknown> | null> {
  const result = await pool.query<{ response_payload: Record<string, unknown> | null }>(
    `SELECT response_payload
     FROM whatsapp_flow_endpoint_events
     WHERE request_fingerprint = $1`,
    [requestFingerprint]
  );
  return result.rows[0]?.response_payload ?? null;
}

export async function recordFlowEndpointEvent(params: {
  requestFingerprint: string;
  tokenId?: string | null;
  action: string;
  screen?: string | null;
  outcome: 'PROCESSED' | 'ACKNOWLEDGED' | 'REJECTED' | 'FAILED';
  response: Record<string, unknown>;
  errorCode?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO whatsapp_flow_endpoint_events (
       id, request_fingerprint, token_id, action, screen,
       outcome, response_payload, error_code
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (request_fingerprint) DO NOTHING`,
    [
      randomUUID(),
      params.requestFingerprint,
      params.tokenId ?? null,
      params.action,
      params.screen ?? null,
      params.outcome,
      JSON.stringify(params.response),
      params.errorCode ?? null
    ]
  );
}
