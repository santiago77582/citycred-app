import { createApp } from './app.js';
import { startBackupWorker, stopBackupWorker } from './backupWorker.js';
import { startCitycredWorker, stopCitycredWorker } from './bot/citycredWorker.js';
import { startCampaignWorker, stopCampaignWorker } from './campaignWorker.js';
import { config } from './config.js';
import { pool } from './db.js';
import { startOperationsWorker, stopOperationsWorker } from './operationsWorker.js';
import { logger } from './utils/logger.js';

const app = createApp();
const host = '0.0.0.0';

const server = app.listen(config.PORT, host, () => {
  startCitycredWorker();
  startCampaignWorker();
  startOperationsWorker();
  startBackupWorker();
  logger.info(
    { host, puerto: config.PORT, entorno: config.NODE_ENV },
    'API de WhatsApp CityCred escuchando'
  );
});

let cerrando = false;

function shutdown(senal: string): void {
  if (cerrando) return;
  cerrando = true;
  stopCitycredWorker();
  stopCampaignWorker();
  stopOperationsWorker();
  stopBackupWorker();
  logger.info({ senal }, 'Cerrando la API');
  server.close(() => {
    pool
      .end()
      .catch((error: unknown) => logger.error({ err: error }, 'Error al cerrar el pool de PostgreSQL'))
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
