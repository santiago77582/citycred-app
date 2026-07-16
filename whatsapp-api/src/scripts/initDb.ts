import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

function resolveSqlPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'sql/001_init.sql'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sql/001_init.sql')
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`No se encontró sql/001_init.sql (se buscó en: ${candidates.join(' | ')})`);
  }
  return found;
}

async function main(): Promise<void> {
  const sqlPath = resolveSqlPath();
  const sqlText = await readFile(sqlPath, 'utf8');
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    max: 1
  });

  try {
    await pool.query(sqlText);
    logger.info({ archivo: sqlPath }, 'Esquema de base de datos aplicado');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'No se pudo inicializar la base de datos');
  process.exitCode = 1;
});
