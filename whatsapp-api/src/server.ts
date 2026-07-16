import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { logger } from './utils/logger.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info({ puerto: config.PORT, entorno: config.NODE_ENV }, 'API de WhatsApp CityCred escuchando');
});

let cerrando = false;

function shutdown(senal: string): void {
  if (cerrando) return;
  cerrando = true;
  logger.info({ senal }, 'Cerrando la API');
  server.close(() => {
    pool
      .end()
      .catch((error: unknown) => logger.error({ err: error }, 'Error al cerrar el pool de PostgreSQL'))
      .finally(() => process.exit(0));
  });
  // Si algo queda colgado, se fuerza la salida.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
