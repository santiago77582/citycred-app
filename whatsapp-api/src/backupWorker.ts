import { createDatabaseBackup, restoreDatabaseBackup } from './backupService.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

let initialTimer: NodeJS.Timeout | null = null;
let intervalTimer: NodeJS.Timeout | null = null;
let running = false;

async function execute(): Promise<void> {
  if (running) {
    logger.warn('Se omitió un respaldo porque el anterior sigue activo');
    return;
  }
  running = true;
  try {
    const backup = await createDatabaseBackup();
    logger.info(
      { backupRunId: backup.id, sizeBytes: backup.sizeBytes },
      'Respaldo PostgreSQL generado y archivo validado'
    );
    if (config.BACKUP_RESTORE_TEST_ENABLED) {
      const restored = await restoreDatabaseBackup({ backupRunId: backup.id });
      logger.info(
        { backupRunId: restored.id, restoreTestedAt: restored.restoreTestedAt },
        'Prueba de restauración descartable completada'
      );
    }
  } catch (error) {
    logger.error({ err: error }, 'Falló el proceso programado de respaldo');
  } finally {
    running = false;
  }
}

export function startBackupWorker(): boolean {
  if (!config.BACKUP_SCHEDULER_ENABLED || initialTimer || intervalTimer) return false;
  const initialDelayMs = config.BACKUP_INITIAL_DELAY_MINUTES * 60_000;
  const intervalMs = config.BACKUP_INTERVAL_HOURS * 60 * 60_000;
  initialTimer = setTimeout(() => {
    initialTimer = null;
    void execute();
  }, initialDelayMs);
  initialTimer.unref();
  intervalTimer = setInterval(() => void execute(), intervalMs);
  intervalTimer.unref();
  logger.info(
    {
      initialDelayMinutes: config.BACKUP_INITIAL_DELAY_MINUTES,
      intervalHours: config.BACKUP_INTERVAL_HOURS,
      retentionCount: config.BACKUP_RETENTION_COUNT,
      restoreTestEnabled: config.BACKUP_RESTORE_TEST_ENABLED
    },
    'Respaldos PostgreSQL programados activados'
  );
  return true;
}

export function stopBackupWorker(): void {
  if (initialTimer) clearTimeout(initialTimer);
  if (intervalTimer) clearInterval(intervalTimer);
  initialTimer = null;
  intervalTimer = null;
}
