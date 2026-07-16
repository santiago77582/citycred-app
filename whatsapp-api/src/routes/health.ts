import { Router } from 'express';
import { checkDatabase } from '../db.js';
import {
  config,
  isMetaSendingConfigured,
  isMetaWebhookConfigured,
  metaConfigStatus
} from '../config.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const databaseOk = await checkDatabase();
  const variables = metaConfigStatus();
  const faltantes = Object.entries(variables)
    .filter(([, configurada]) => !configurada)
    .map(([nombre]) => nombre);

  res.status(databaseOk ? 200 : 503).json({
    status: databaseOk ? 'ok' : 'degraded',
    entorno: config.NODE_ENV,
    database: databaseOk ? 'ok' : 'error',
    meta: {
      envioConfigurado: isMetaSendingConfigured(),
      webhookConfigurado: isMetaWebhookConfigured(),
      variables,
      faltantes
    }
  });
});
