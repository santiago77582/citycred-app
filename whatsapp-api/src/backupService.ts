import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  mkdir,
  rename,
  stat,
  unlink
} from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { config } from './config.js';
import { pool } from './db.js';
import { AppError } from './errors/AppError.js';
import { logger } from './utils/logger.js';

const { Client } = pg;
const MANAGED_BACKUP_NAME = /^citycred-\d{8}T\d{6}Z-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.dump$/i;

export type BackupRun = {
  id: string;
  status: string;
  storageKey: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  archiveVerifiedAt: string | null;
  restoreAttemptedAt: string | null;
  restoreTestedAt: string | null;
  restoreErrorMessage: string | null;
  restoreTargetFingerprint: string | null;
  deletedAt: string | null;
};

type BackupRow = {
  id: string;
  status: string;
  storage_key: string | null;
  size_bytes: number | string | null;
  checksum: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  archive_verified_at: string | null;
  restore_attempted_at: string | null;
  restore_tested_at: string | null;
  restore_error_message: string | null;
  restore_target_fingerprint: string | null;
  deleted_at: string | null;
};

export type CommandSpec = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
};

export type CommandRunner = (spec: CommandSpec) => Promise<void>;

type BackupOptions = {
  runner?: CommandRunner;
  now?: Date;
  backupDirectory?: string;
  databaseUrl?: string;
  databaseSsl?: boolean;
  timeoutMs?: number;
  retentionCount?: number;
};

type RestoreOptions = {
  backupRunId?: string;
  runner?: CommandRunner;
  backupDirectory?: string;
  sourceDatabaseUrl?: string;
  targetDatabaseUrl?: string;
  timeoutMs?: number;
  verifyRestoredDatabase?: (targetDatabaseUrl: string) => Promise<void>;
};

function mapBackup(row: BackupRow): BackupRun {
  const size = row.size_bytes === null ? null : Number(row.size_bytes);
  return {
    id: row.id,
    status: row.status,
    storageKey: row.storage_key,
    sizeBytes: size !== null && Number.isFinite(size) ? size : null,
    checksum: row.checksum,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    archiveVerifiedAt: row.archive_verified_at,
    restoreAttemptedAt: row.restore_attempted_at,
    restoreTestedAt: row.restore_tested_at,
    restoreErrorMessage: row.restore_error_message,
    restoreTargetFingerprint: row.restore_target_fingerprint,
    deletedAt: row.deleted_at
  };
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[URL_POSTGRES_OCULTA]')
    .slice(0, 2_000);
}

function pgEnvironment(connectionString: string, ssl: boolean): NodeJS.ProcessEnv {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new AppError('La conexión del respaldo no es una URL PostgreSQL válida.', 500);
  }
  const sslMode = url.searchParams.get('sslmode');
  const allowedSslModes = new Set(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']);
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: process.env.LANG ?? 'C.UTF-8',
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: sslMode && allowedSslModes.has(sslMode) ? sslMode : ssl ? 'require' : 'disable',
    PGCONNECT_TIMEOUT: '15'
  };
}

export const runBackupCommand: CommandRunner = (spec) => new Promise((resolve, reject) => {
  const child = spawn(spec.command, spec.args, {
    env: spec.env,
    shell: false,
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
  }, spec.timeoutMs);
  timer.unref();

  child.stderr.on('data', (chunk: Buffer | string) => {
    if (stderr.length < 8_000) stderr += String(chunk).slice(0, 8_000 - stderr.length);
  });
  child.once('error', (error) => {
    clearTimeout(timer);
    reject(new Error(`No se pudo iniciar ${spec.command}: ${safeErrorMessage(error)}`));
  });
  child.once('close', (code, signal) => {
    clearTimeout(timer);
    if (timedOut) {
      reject(new Error(`${spec.command} superó el tiempo máximo configurado.`));
      return;
    }
    if (code !== 0) {
      const detail = stderr.trim() ? `: ${stderr.trim()}` : '';
      reject(new Error(`${spec.command} terminó con código ${String(code)}${signal ? ` (${signal})` : ''}${detail}`));
      return;
    }
    resolve();
  });
});

async function sha256File(filename: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filename);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function timestampForFilename(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function managedBackupPath(directory: string, storageKey: string): string {
  if (!MANAGED_BACKUP_NAME.test(storageKey) || path.basename(storageKey) !== storageKey) {
    throw new AppError('La referencia del respaldo no es segura.', 500);
  }
  const root = path.resolve(directory);
  const resolved = path.resolve(root, storageKey);
  if (path.dirname(resolved) !== root) {
    throw new AppError('La referencia del respaldo queda fuera del directorio permitido.', 500);
  }
  return resolved;
}

async function backupByIdOrLatest(id?: string): Promise<BackupRow> {
  const result = id
    ? await pool.query<BackupRow>(
      `SELECT id, status, storage_key, size_bytes, checksum, error_message,
              started_at, completed_at, archive_verified_at, restore_attempted_at,
              restore_tested_at, restore_error_message, restore_target_fingerprint, deleted_at
       FROM backup_runs WHERE id = $1`,
      [id]
    )
    : await pool.query<BackupRow>(
      `SELECT id, status, storage_key, size_bytes, checksum, error_message,
              started_at, completed_at, archive_verified_at, restore_attempted_at,
              restore_tested_at, restore_error_message, restore_target_fingerprint, deleted_at
       FROM backup_runs
       WHERE LOWER(status) = 'success' AND archive_verified_at IS NOT NULL AND deleted_at IS NULL
       ORDER BY started_at DESC LIMIT 1`
    );
  const row = result.rows[0];
  if (!row) throw new AppError('No se encontró un respaldo verificable para restaurar.', 404);
  return row;
}

export async function listBackupRuns(limit = 20): Promise<BackupRun[]> {
  const result = await pool.query<BackupRow>(
    `SELECT id, status, storage_key, size_bytes, checksum, error_message,
            started_at, completed_at, archive_verified_at, restore_attempted_at,
            restore_tested_at, restore_error_message, restore_target_fingerprint, deleted_at
     FROM backup_runs
     ORDER BY started_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map(mapBackup);
}

export async function pruneExpiredBackups(
  backupDirectory = config.BACKUP_DIRECTORY,
  retentionCount = config.BACKUP_RETENTION_COUNT
): Promise<number> {
  const result = await pool.query<{ id: string; storage_key: string | null }>(
    `SELECT id, storage_key
     FROM backup_runs
     WHERE LOWER(status) = 'success' AND deleted_at IS NULL
     ORDER BY started_at DESC
     OFFSET $1`,
    [retentionCount]
  );
  let deleted = 0;
  for (const row of result.rows) {
    if (!row.storage_key) continue;
    const filename = managedBackupPath(backupDirectory, row.storage_key);
    await unlink(filename).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    await pool.query(
      `UPDATE backup_runs SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [row.id]
    );
    deleted += 1;
  }
  return deleted;
}

export async function createDatabaseBackup(options: BackupOptions = {}): Promise<BackupRun> {
  const runner = options.runner ?? runBackupCommand;
  const now = options.now ?? new Date();
  const directory = path.resolve(options.backupDirectory ?? config.BACKUP_DIRECTORY);
  const databaseUrl = options.databaseUrl ?? config.DATABASE_URL;
  const databaseSsl = options.databaseSsl ?? config.DATABASE_SSL;
  const timeoutMs = options.timeoutMs ?? config.BACKUP_COMMAND_TIMEOUT_MINUTES * 60_000;
  const retentionCount = options.retentionCount ?? config.BACKUP_RETENTION_COUNT;
  const id = randomUUID();
  const storageKey = `citycred-${timestampForFilename(now)}-${id}.dump`;
  const finalPath = managedBackupPath(directory, storageKey);
  const partialPath = `${finalPath}.partial`;
  let runCreated = false;
  let finalCreated = false;

  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await pool.query(
    `UPDATE backup_runs
     SET status = 'FAILED', error_message = 'La ejecución quedó interrumpida.', completed_at = NOW()
     WHERE status = 'RUNNING' AND started_at < NOW() - INTERVAL '3 hours'`
  );
  try {
    await pool.query(
      `INSERT INTO backup_runs (id, status, storage_key, metadata, started_at)
       VALUES ($1, 'RUNNING', $2, $3::jsonb, NOW())`,
      [id, storageKey, JSON.stringify({ format: 'postgres-custom', compression: 6 })]
    );
    runCreated = true;

    const environment = pgEnvironment(databaseUrl, databaseSsl);
    await runner({
      command: 'pg_dump',
      args: [
        '--format=custom',
        '--compress=6',
        '--no-owner',
        '--no-privileges',
        '--file',
        partialPath
      ],
      env: environment,
      timeoutMs
    });
    await chmod(partialPath, 0o600);
    await runner({
      command: 'pg_restore',
      args: ['--list', partialPath],
      env: environment,
      timeoutMs
    });
    await rename(partialPath, finalPath);
    finalCreated = true;
    const [fileStat, checksum] = await Promise.all([stat(finalPath), sha256File(finalPath)]);

    const updated = await pool.query<BackupRow>(
      `UPDATE backup_runs
       SET status = 'SUCCESS', size_bytes = $2, checksum = $3,
           archive_verified_at = NOW(), completed_at = NOW(), error_message = NULL
       WHERE id = $1
       RETURNING id, status, storage_key, size_bytes, checksum, error_message,
                 started_at, completed_at, archive_verified_at, restore_attempted_at,
                 restore_tested_at, restore_error_message, restore_target_fingerprint, deleted_at`,
      [id, fileStat.size, checksum]
    );
    const row = updated.rows[0];
    if (!row) throw new Error('No se pudo confirmar el respaldo en la base de datos.');
    finalCreated = false;
    await pruneExpiredBackups(directory, retentionCount).catch((error: unknown) => {
      logger.warn({ err: error }, 'El respaldo terminó, pero falló la política de retención');
    });
    return mapBackup(row);
  } catch (error) {
    await unlink(partialPath).catch((unlinkError: NodeJS.ErrnoException) => {
      if (unlinkError.code !== 'ENOENT') logger.warn({ err: unlinkError }, 'No se pudo limpiar el respaldo parcial');
    });
    if (finalCreated) {
      await unlink(finalPath).catch((unlinkError: NodeJS.ErrnoException) => {
        if (unlinkError.code !== 'ENOENT') logger.warn({ err: unlinkError }, 'No se pudo limpiar el respaldo incompleto');
      });
    }
    if (runCreated) {
      await pool.query(
        `UPDATE backup_runs
         SET status = 'FAILED', error_message = $2, completed_at = NOW()
         WHERE id = $1`,
        [id, safeErrorMessage(error)]
      ).catch(() => undefined);
    }
    if ((error as { code?: unknown }).code === '23505') {
      throw new AppError('Ya hay un respaldo en ejecución.', 409);
    }
    throw error;
  }
}

function databaseIdentity(connectionString: string): { host: string; port: string; database: string } {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new AppError('La base de restauración no usa PostgreSQL.', 400);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new AppError('La base de restauración no tiene nombre.', 400);
  return { host: url.hostname.toLowerCase(), port: url.port || '5432', database };
}

export function assertSafeRestoreTarget(sourceUrl: string, targetUrl: string): string {
  const source = databaseIdentity(sourceUrl);
  const target = databaseIdentity(targetUrl);
  if (!/_restore_test$/i.test(target.database)) {
    throw new AppError('La base descartable debe terminar en _restore_test.', 400);
  }
  if (
    source.host === target.host
    && source.port === target.port
    && source.database === target.database
  ) {
    throw new AppError('La restauración nunca puede apuntar a la base de origen.', 400);
  }
  return createHash('sha256')
    .update(`${target.host}:${target.port}/${target.database}`)
    .digest('hex');
}

async function verifyRestoredDatabase(targetDatabaseUrl: string): Promise<void> {
  const url = new URL(targetDatabaseUrl);
  const sslMode = url.searchParams.get('sslmode');
  const client = new Client({
    connectionString: targetDatabaseUrl,
    ssl: sslMode && sslMode !== 'disable' ? { rejectUnauthorized: false } : undefined
  });
  await client.connect();
  try {
    const migrations = await client.query<{ count: number | string }>(
      'SELECT COUNT(*) AS count FROM schema_migrations'
    );
    if (Number(migrations.rows[0]?.count ?? 0) < 1) {
      throw new Error('La base restaurada no contiene migraciones registradas.');
    }
    const tables = await client.query<{ contacts: string | null; messages: string | null }>(
      `SELECT to_regclass('public.contacts')::text AS contacts,
              to_regclass('public.messages')::text AS messages`
    );
    if (!tables.rows[0]?.contacts || !tables.rows[0]?.messages) {
      throw new Error('La base restaurada no contiene las tablas críticas.');
    }
  } finally {
    await client.end();
  }
}

export async function restoreDatabaseBackup(options: RestoreOptions = {}): Promise<BackupRun> {
  const runner = options.runner ?? runBackupCommand;
  const directory = path.resolve(options.backupDirectory ?? config.BACKUP_DIRECTORY);
  const sourceUrl = options.sourceDatabaseUrl ?? config.DATABASE_URL;
  const targetUrl = options.targetDatabaseUrl ?? config.BACKUP_RESTORE_TEST_DATABASE_URL;
  const timeoutMs = options.timeoutMs ?? config.BACKUP_COMMAND_TIMEOUT_MINUTES * 60_000;
  if (!targetUrl) {
    throw new AppError('Falta BACKUP_RESTORE_TEST_DATABASE_URL.', 400);
  }
  const targetFingerprint = assertSafeRestoreTarget(sourceUrl, targetUrl);
  const row = await backupByIdOrLatest(options.backupRunId);
  if (row.status !== 'SUCCESS' || !row.archive_verified_at || row.deleted_at || !row.storage_key) {
    throw new AppError('El respaldo no está disponible o no superó la verificación del archivo.', 409);
  }
  const filename = managedBackupPath(directory, row.storage_key);
  const [fileStat, currentChecksum] = await Promise.all([stat(filename), sha256File(filename)]);
  if (
    !row.checksum
    || currentChecksum !== row.checksum
    || (row.size_bytes !== null && fileStat.size !== Number(row.size_bytes))
  ) {
    throw new AppError('El respaldo cambió después de su validación y no puede restaurarse.', 409);
  }
  await pool.query(
    `UPDATE backup_runs
     SET restore_attempted_at = NOW(), restore_error_message = NULL,
         restore_target_fingerprint = $2
     WHERE id = $1`,
    [row.id, targetFingerprint]
  );

  try {
    const identity = databaseIdentity(targetUrl);
    const targetSslMode = new URL(targetUrl).searchParams.get('sslmode');
    await runner({
      command: 'pg_restore',
      args: [
        '--clean',
        '--if-exists',
        '--exit-on-error',
        '--no-owner',
        '--no-privileges',
        '--dbname',
        identity.database,
        filename
      ],
      env: pgEnvironment(targetUrl, Boolean(targetSslMode && targetSslMode !== 'disable')),
      timeoutMs
    });
    await (options.verifyRestoredDatabase ?? verifyRestoredDatabase)(targetUrl);
    const updated = await pool.query<BackupRow>(
      `UPDATE backup_runs
       SET verified_at = NOW(), restore_tested_at = NOW(),
           restore_error_message = NULL, restore_target_fingerprint = $2
       WHERE id = $1
       RETURNING id, status, storage_key, size_bytes, checksum, error_message,
                 started_at, completed_at, archive_verified_at, restore_attempted_at,
                 restore_tested_at, restore_error_message, restore_target_fingerprint, deleted_at`,
      [row.id, targetFingerprint]
    );
    const restored = updated.rows[0];
    if (!restored) throw new Error('No se pudo registrar la prueba de restauración.');
    return mapBackup(restored);
  } catch (error) {
    await pool.query(
      `UPDATE backup_runs SET restore_error_message = $2 WHERE id = $1`,
      [row.id, safeErrorMessage(error)]
    ).catch(() => undefined);
    throw error;
  }
}
