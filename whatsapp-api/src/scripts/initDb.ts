import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;
const MIGRATION_ADVISORY_LOCK_ID = '4213377121001';

function resolveSqlDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'sql'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sql')
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`No se encontró el directorio sql (se buscó en: ${candidates.join(' | ')})`);
  }
  return found;
}

function checksum(sqlText: string): string {
  return createHash('sha256').update(sqlText).digest('hex');
}

async function main(): Promise<void> {
  const sqlDir = resolveSqlDir();
  const files = (await readdir(sqlDir))
    .filter((filename) => /^\d+_.*\.sql$/i.test(filename))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`No se encontraron migraciones SQL en ${sqlDir}`);
  }

  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    max: 1
  });
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock($1::bigint)', [MIGRATION_ADVISORY_LOCK_ID]);
    lockAcquired = true;
    logger.debug('Lock exclusivo de migraciones adquirido');

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const filename of files) {
      const sqlPath = path.join(sqlDir, filename);
      const sqlText = await readFile(sqlPath, 'utf8');
      const currentChecksum = checksum(sqlText);
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE filename = $1',
        [filename]
      );

      if (existing.rowCount === 1) {
        const storedChecksum = existing.rows[0]?.checksum;
        if (storedChecksum !== currentChecksum) {
          throw new Error(
            `La migración ${filename} fue modificada después de aplicarse. ` +
            'Creá una migración nueva en lugar de editarla.'
          );
        }
        logger.debug({ archivo: filename }, 'Migración ya aplicada');
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sqlText);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [filename, currentChecksum]
        );
        await client.query('COMMIT');
        logger.info({ archivo: filename }, 'Migración de base de datos aplicada');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1::bigint)', [MIGRATION_ADVISORY_LOCK_ID]);
        logger.debug('Lock exclusivo de migraciones liberado');
      } catch (error) {
        logger.error({ err: error }, 'No se pudo liberar explícitamente el lock de migraciones');
      }
    }
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'No se pudo inicializar la base de datos');
  process.exitCode = 1;
});
