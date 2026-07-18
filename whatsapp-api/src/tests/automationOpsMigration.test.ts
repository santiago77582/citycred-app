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

test('la migración crea automatizaciones, alertas y backups', async () => {
  const db = newDb();
  for (const migration of [
    '001_init.sql',
    '003_crm_team_foundation.sql',
    '006_automation_ops_foundation.sql'
  ]) {
    db.public.none(sqlFile(migration));
  }

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const names = new Set(
    (tables.rows as Array<{ table_name: string }>).map((row) => row.table_name)
  );

  for (const expected of ['automations', 'automation_runs', 'system_alerts', 'backup_runs']) {
    assert.ok(names.has(expected), `falta la tabla ${expected}`);
  }

  await pool.end();
});
