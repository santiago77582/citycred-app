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

test('la migración de plataforma crea CRM, equipo y auditoría', async () => {
  const db = newDb();
  db.public.none(sqlFile('001_init.sql'));
  db.public.none(sqlFile('003_crm_team_foundation.sql'));

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  const tables = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'`
  );
  const names = new Set(
    (tables.rows as Array<{ table_name: string }>).map((row) => row.table_name)
  );

  for (const expected of [
    'app_users',
    'labels',
    'contact_labels',
    'conversation_assignments',
    'quick_replies',
    'audit_events'
  ]) {
    assert.ok(names.has(expected), `falta la tabla ${expected}`);
  }

  const contactColumns = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'contacts'`
  );
  const contactNames = new Set(
    (contactColumns.rows as Array<{ column_name: string }>).map((row) => row.column_name)
  );
  for (const expected of ['entity', 'commercial_status', 'consent_status', 'opt_out_at']) {
    assert.ok(contactNames.has(expected), `falta contacts.${expected}`);
  }

  const conversationColumns = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'conversations'`
  );
  const conversationNames = new Set(
    (conversationColumns.rows as Array<{ column_name: string }>).map((row) => row.column_name)
  );
  for (const expected of ['assigned_user_id', 'unread_count', 'priority']) {
    assert.ok(conversationNames.has(expected), `falta conversations.${expected}`);
  }

  await pool.end();
});
