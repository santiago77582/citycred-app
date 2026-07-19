import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { CommandSpec } from '../backupService.js';
import { applyTestEnv } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const directory = await mkdtemp(path.join(tmpdir(), 'citycred-backup-test-'));
const {
  assertSafeRestoreTarget,
  createDatabaseBackup,
  restoreDatabaseBackup
} = await import('../backupService.js');

test.after(async () => rm(directory, { recursive: true, force: true }));
test.afterEach(() => base.reiniciar());

async function successfulRunner(spec: CommandSpec): Promise<void> {
  assert.equal(spec.env.DATABASE_URL, undefined);
  assert.equal(spec.env.WHATSAPP_ACCESS_TOKEN, undefined);
  if (spec.command === 'pg_dump') {
    const fileIndex = spec.args.indexOf('--file');
    assert.ok(fileIndex >= 0);
    const filename = spec.args[fileIndex + 1];
    assert.ok(filename);
    await writeFile(filename, 'archivo-postgresql-simulado');
    return;
  }
  assert.equal(spec.command, 'pg_restore');
  assert.equal(spec.args[0], '--list');
  await access(String(spec.args[1]));
}

test('genera un respaldo, valida el archivo y no simula una restauración', async () => {
  const commands: string[] = [];
  const backup = await createDatabaseBackup({
    backupDirectory: directory,
    now: new Date('2026-07-19T12:34:56.000Z'),
    retentionCount: 10,
    runner: async (spec) => {
      commands.push(`${spec.command}:${spec.args[0]}`);
      await successfulRunner(spec);
    }
  });

  assert.equal(backup.status, 'SUCCESS');
  assert.ok(backup.archiveVerifiedAt);
  assert.equal(backup.restoreTestedAt, null);
  assert.equal(backup.restoreAttemptedAt, null);
  assert.match(String(backup.storageKey), /^citycred-20260719T123456Z-/);
  assert.deepEqual(commands, ['pg_dump:--format=custom', 'pg_restore:--list']);

  const filename = path.join(directory, String(backup.storageKey));
  assert.equal(await readFile(filename, 'utf8'), 'archivo-postgresql-simulado');
  assert.equal((await stat(filename)).mode & 0o777, 0o600);
  const stored = await base.consultar(
    `SELECT status, archive_verified_at, verified_at, checksum, size_bytes
     FROM backup_runs WHERE id = $1`,
    [backup.id]
  );
  assert.equal(stored.rows[0]?.status, 'SUCCESS');
  assert.ok(stored.rows[0]?.archive_verified_at);
  assert.equal(stored.rows[0]?.verified_at, null);
  assert.equal(String(stored.rows[0]?.checksum).length, 64);
  assert.ok(Number(stored.rows[0]?.size_bytes) > 0);
});

test('restaura únicamente en una base descartable y registra el resultado real', async () => {
  const backup = await createDatabaseBackup({
    backupDirectory: directory,
    retentionCount: 10,
    runner: successfulRunner
  });
  const targetUrl = 'postgresql://restore:secret@127.0.0.2:5432/citycred_restore_test?sslmode=disable';
  let verifiedUrl = '';
  const commands: CommandSpec[] = [];
  const restored = await restoreDatabaseBackup({
    backupRunId: backup.id,
    backupDirectory: directory,
    targetDatabaseUrl: targetUrl,
    runner: async (spec) => {
      commands.push(spec);
      assert.equal(spec.command, 'pg_restore');
      assert.ok(spec.args.includes('--clean'));
      assert.ok(spec.args.includes('--exit-on-error'));
      assert.equal(spec.args.includes(targetUrl), false);
    },
    verifyRestoredDatabase: async (url) => {
      verifiedUrl = url;
    }
  });

  assert.equal(commands.length, 1);
  assert.equal(verifiedUrl, targetUrl);
  assert.ok(restored.restoreAttemptedAt);
  assert.ok(restored.restoreTestedAt);
  assert.equal(restored.restoreErrorMessage, null);
  assert.equal(restored.restoreTargetFingerprint?.length, 64);
  const stored = await base.consultar(
    'SELECT verified_at, restore_tested_at FROM backup_runs WHERE id = $1',
    [backup.id]
  );
  assert.ok(stored.rows[0]?.verified_at);
  assert.ok(stored.rows[0]?.restore_tested_at);
});

test('rechaza restaurar en la base de origen o en un nombre no descartable', () => {
  const source = 'postgresql://user:secret@db.internal:5432/citycred_restore_test';
  assert.throws(
    () => assertSafeRestoreTarget(source, source),
    /nunca puede apuntar a la base de origen/
  );
  assert.throws(
    () => assertSafeRestoreTarget(source, 'postgresql://user:secret@db.internal:5432/citycred'),
    /debe terminar en _restore_test/
  );
});

test('rechaza un archivo alterado antes de tocar la base descartable', async () => {
  const backup = await createDatabaseBackup({
    backupDirectory: directory,
    retentionCount: 10,
    runner: successfulRunner
  });
  await writeFile(path.join(directory, String(backup.storageKey)), 'contenido-alterado');
  let commandStarted = false;
  await assert.rejects(
    restoreDatabaseBackup({
      backupRunId: backup.id,
      backupDirectory: directory,
      targetDatabaseUrl: 'postgresql://restore:secret@127.0.0.2:5432/citycred_restore_test',
      runner: async () => {
        commandStarted = true;
      },
      verifyRestoredDatabase: async () => undefined
    }),
    /cambió después de su validación/
  );
  assert.equal(commandStarted, false);
});

test('marca como fallida una ejecución de pg_dump sin dejar archivos parciales', async () => {
  await assert.rejects(
    createDatabaseBackup({
      backupDirectory: directory,
      retentionCount: 10,
      runner: async () => {
        throw new Error('fallo controlado de pg_dump');
      }
    }),
    /fallo controlado/
  );
  const rows = await base.consultar(
    `SELECT status, error_message FROM backup_runs ORDER BY started_at DESC LIMIT 1`
  );
  assert.equal(rows.rows[0]?.status, 'FAILED');
  assert.match(String(rows.rows[0]?.error_message), /fallo controlado/);
});
