import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import type { RegisteredFlowToken } from './flowEndpointRepository.js';
import { decryptStoredFlowData, encryptStoredFlowData } from './storageCrypto.js';

export async function saveFlowSessionSafely(params: {
  token: RegisteredFlowToken;
  screen: string | null;
  data: Record<string, unknown>;
  storageMaterial: string;
  complete?: boolean;
}): Promise<Record<string, unknown>> {
  const existing = await pool.query<{
    encrypted_data: string | null;
    data_iv: string | null;
    data_tag: string | null;
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

  if (existing.rows[0]) {
    await pool.query(
      `UPDATE whatsapp_flow_sessions SET
         current_screen = $2,
         encrypted_data = $3,
         data_iv = $4,
         data_tag = $5,
         completed = CASE
           WHEN completed = TRUE OR $6::boolean = TRUE THEN TRUE
           ELSE FALSE
         END,
         updated_at = NOW()
       WHERE token_id = $1`,
      [
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

  try {
    await pool.query(
      `INSERT INTO whatsapp_flow_sessions (
         id, token_id, current_screen, encrypted_data, data_iv, data_tag, completed
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
  } catch (error) {
    if ((error as { code?: string }).code !== '23505') throw error;
    await pool.query(
      `UPDATE whatsapp_flow_sessions SET
         current_screen = $2,
         encrypted_data = $3,
         data_iv = $4,
         data_tag = $5,
         completed = CASE
           WHEN completed = TRUE OR $6::boolean = TRUE THEN TRUE
           ELSE FALSE
         END,
         updated_at = NOW()
       WHERE token_id = $1`,
      [
        params.token.id,
        params.screen,
        encrypted.encryptedData,
        encrypted.iv,
        encrypted.tag,
        params.complete ?? false
      ]
    );
  }
  return merged;
}
