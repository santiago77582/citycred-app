import { createDatabaseBackup } from '../backupService.js';
import { pool } from '../db.js';
import { logger } from '../utils/logger.js';

async function main(): Promise<void> {
  try {
    const backup = await createDatabaseBackup();
    logger.info(
      { backupRunId: backup.id, sizeBytes: backup.sizeBytes, checksum: backup.checksum },
      'Respaldo generado y archivo validado'
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
    logger.error({ err: error }, 'No se pudo generar el respaldo');
    process.exitCode = 1;
});
