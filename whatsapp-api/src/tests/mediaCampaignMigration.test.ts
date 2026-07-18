import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';

function sqlFile(name: string): string {
  return readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../../sql/${name}`),
    'utf8'
  );
}

test('las migraciones crean multimedia, plantillas y campañas', async () => {
  const db = newDb();
  for (const migration of [
    '001_init.sql',
    '003_crm_team_foundation.sql',
    '004_media_foundation.sql',
    '005_campaign_foundation.sql'
  ]) {
    db.public.none(sqlFile(migration));
  }

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const tableNames = new Set(
    (tables.rows as Array<{ table_name: string }>).map((row) => row.table_name)
  );
  for (const expected of [
    'message_attachments',
    'whatsapp_templates',
    'campaigns',
    'campaign_recipients'
  ]) {
    assert.ok(tableNames.has(expected), `falta la tabla ${expected}`);
  }

  const messageColumns = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'messages'`
  );
  const messageColumnNames = new Set(
    (messageColumns.rows as Array<{ column_name: string }>).map((row) => row.column_name)
  );
  for (const expected of ['reply_to_wamid', 'sent_at', 'delivered_at', 'read_at']) {
    assert.ok(messageColumnNames.has(expected), `falta messages.${expected}`);
  }

  await pool.end();
});
