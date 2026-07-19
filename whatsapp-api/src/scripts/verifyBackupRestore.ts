import { restoreDatabaseBackup } from '../backupService.js';
import { pool } from '../db.js';
import { logger } from '../utils/logger.js';

const backupRunId = process.argv[2];

async function main(): Promise<void> {
  try {
    const backup = await restoreDatabaseBackup({ backupRunId });
    logger.info(
      { backupRunId: backup.id, restoreTestedAt: backup.restoreTestedAt },
      'Restauración real verificada en la base descartable'
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
    logger.error({ err: error }, 'La prueba de restauración falló');
    process.exitCode = 1;
});
