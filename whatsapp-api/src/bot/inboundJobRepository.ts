import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';

export type BotInboundJob = {
  id: string;
  inboundMessageId: string;
  waId: string;
  payload: Record<string, unknown>;
  attemptCount: number;
};

export async function enqueueBotInboundJob(params: {
  inboundMessageId: string;
  waId: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO bot_inbound_jobs (
       id, inbound_message_id, wa_id, payload
     ) VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (inbound_message_id) DO NOTHING
     RETURNING id`,
    [randomUUID(), params.inboundMessageId, params.waId, JSON.stringify(params.payload)]
  );
  return result.rowCount === 1;
}

export async function recoverStaleBotJobs(): Promise<void> {
  await pool.query(
    `UPDATE bot_inbound_jobs
     SET status = CASE WHEN attempt_count >= 3 THEN 'FAILED' ELSE 'PENDING' END,
         available_at = CASE WHEN attempt_count >= 3 THEN available_at ELSE NOW() END,
         error_message = CASE
           WHEN attempt_count >= 3 THEN COALESCE(error_message, 'El trabajo superó el máximo de intentos.')
           ELSE error_message
         END,
         locked_at = NULL,
         updated_at = NOW()
     WHERE status = 'PROCESSING'
       AND locked_at < NOW() - INTERVAL '5 minutes'`
  );
}

export async function claimBotInboundJobs(limit: number): Promise<BotInboundJob[]> {
  const candidates = await pool.query<{
    id: string;
    inbound_message_id: string;
    wa_id: string;
    payload: Record<string, unknown>;
    attempt_count: number;
  }>(
    `SELECT id, inbound_message_id, wa_id, payload, attempt_count
     FROM bot_inbound_jobs
     WHERE status = 'PENDING' AND available_at <= NOW()
     ORDER BY available_at ASC, id ASC
     LIMIT $1`,
    [limit]
  );

  const claimed: BotInboundJob[] = [];
  for (const row of candidates.rows) {
    const updated = await pool.query(
      `UPDATE bot_inbound_jobs
       SET status = 'PROCESSING', attempt_count = attempt_count + 1,
           locked_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'PENDING'
       RETURNING id`,
      [row.id]
    );
    if (updated.rowCount !== 1) continue;
    claimed.push({
      id: row.id,
      inboundMessageId: row.inbound_message_id,
      waId: row.wa_id,
      payload: row.payload ?? {},
      attemptCount: row.attempt_count + 1
    });
  }
  return claimed;
}

export async function finishBotInboundJob(params: {
  id: string;
  status: 'DONE' | 'SKIPPED' | 'FAILED' | 'PENDING';
  error?: string | null;
  retryAt?: Date | null;
}): Promise<void> {
  await pool.query(
    `UPDATE bot_inbound_jobs
     SET status = $2,
         error_message = $3,
         available_at = COALESCE($4, available_at),
         locked_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [params.id, params.status, params.error ?? null, params.retryAt ?? null]
  );
}

export async function listBotInboundJobs(limit: number) {
  const result = await pool.query(
    `SELECT id, inbound_message_id, wa_id, status, attempt_count,
            available_at, locked_at, error_message, created_at, updated_at
     FROM bot_inbound_jobs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
