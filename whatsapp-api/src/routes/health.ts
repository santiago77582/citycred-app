import { Router } from 'express';
import { getBotRuntimeSettings } from '../bot/botStateRepository.js';
import { checkDatabase } from '../db.js';
import { endpointOptions } from '../flows/endpointOptions.js';
import {
  aiConfigStatus,
  config,
  isAiEnabled,
  isMetaSendingConfigured,
  isMetaWebhookConfigured,
  metaConfigStatus
} from '../config.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  let databaseOk = await checkDatabase();
  let botEnabled: boolean | null = null;
  let followupsEnabled: boolean | null = null;
  if (databaseOk) {
    try {
      const bot = await getBotRuntimeSettings();
      botEnabled = bot.botEnabled;
      followupsEnabled = bot.followupsEnabled;
    } catch {
      databaseOk = false;
    }
  }
  const variables = metaConfigStatus();
  const faltantes = Object.entries(variables)
    .filter(([, configurada]) => !configurada)
    .map(([nombre]) => nombre);

  const flowEndpointEnabled = endpointOptions().enabled;
  const features = {
    botEnabled,
    followupsEnabled,
    campaignExecutionEnabled: config.CAMPAIGN_EXECUTION_ENABLED,
    flowEndpointEnabled,
    operationsSchedulerEnabled: config.OPERATIONS_SCHEDULER_ENABLED,
    backupSchedulerEnabled: config.BACKUP_SCHEDULER_ENABLED,
    backupRestoreTestEnabled: config.BACKUP_RESTORE_TEST_ENABLED
  };
  const safeMode = databaseOk
    && Object.values(variables).every((configured) => !configured)
    && Object.values(features).every((enabled) => enabled === false);

  res.status(databaseOk ? 200 : 503).json({
    status: databaseOk ? 'ok' : 'degraded',
    entorno: config.NODE_ENV,
    database: databaseOk ? 'ok' : 'error',
    safety: {
      safeMode,
      features
    },
    meta: {
      envioConfigurado: isMetaSendingConfigured(),
      webhookConfigurado: isMetaWebhookConfigured(),
      variables,
      faltantes
    },
    ia: {
      encendida: isAiEnabled(),
      variables: aiConfigStatus()
    }
  });
});
