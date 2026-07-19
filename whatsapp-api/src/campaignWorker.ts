import {
  campaignExecutionCapabilities,
  checkClaimedCampaignRecipient,
  claimNextCampaignRecipient,
  finalizeCompletedCampaigns,
  finishCampaignRecipient,
  isCampaignSendTime,
  recoverStaleCampaignRecipients
} from './campaignExecutionRepository.js';
import { sendTemplateAndPersist, type TemplateSendOutcome } from './routes/messages.js';
import { logger } from './utils/logger.js';

type CampaignSender = (input: {
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
}) => Promise<TemplateSendOutcome>;

export async function runCampaignWorkerBatch(params: {
  limit?: number;
  sender?: CampaignSender;
  now?: Date;
} = {}): Promise<{
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  unknown: number;
}> {
  const result = { claimed: 0, sent: 0, skipped: 0, failed: 0, unknown: 0 };
  if (!campaignExecutionCapabilities().enabled) return result;
  await recoverStaleCampaignRecipients();
  await finalizeCompletedCampaigns();
  if (!isCampaignSendTime(params.now)) return result;

  const limit = Math.max(1, Math.min(params.limit ?? 5, 25));
  const sender = params.sender ?? sendTemplateAndPersist;
  for (let index = 0; index < limit; index += 1) {
    const recipient = await claimNextCampaignRecipient();
    if (!recipient) break;
    result.claimed += 1;
    try {
      const eligibility = await checkClaimedCampaignRecipient(recipient);
      if (!eligibility.eligible) {
        await finishCampaignRecipient({
          recipientId: recipient.recipientId,
          status: 'SKIPPED',
          reason: eligibility.reason
        });
        result.skipped += 1;
        continue;
      }

      const outcome = await sender({
        to: recipient.waId,
        templateName: recipient.templateName,
        languageCode: recipient.languageCode,
        components: recipient.templateComponents
      });
      if (outcome.statusCode === 201) {
        await finishCampaignRecipient({
          recipientId: recipient.recipientId,
          status: 'SENT',
          messageId: outcome.payload.messageId
        });
        result.sent += 1;
      } else {
        await finishCampaignRecipient({
          recipientId: recipient.recipientId,
          status: 'UNKNOWN',
          messageId: outcome.payload.messageId,
          error: 'Meta no confirmó el resultado. No se reintentó para evitar duplicados.'
        });
        result.unknown += 1;
      }
    } catch (error) {
      await finishCampaignRecipient({
        recipientId: recipient.recipientId,
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error)
      }).catch(() => undefined);
      result.failed += 1;
      logger.error(
        { err: error, campaignId: recipient.campaignId, recipientId: recipient.recipientId },
        'Falló un destinatario de campaña; no se reintentará automáticamente'
      );
    }
  }
  await finalizeCompletedCampaigns();
  return result;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startCampaignWorker(): void {
  if (timer || !campaignExecutionCapabilities().enabled) return;
  recoverStaleCampaignRecipients()
    .then(() => finalizeCompletedCampaigns())
    .catch((error) => logger.error({ err: error }, 'No se pudo recuperar la cola de campañas'));
  timer = setInterval(() => {
    if (running) return;
    running = true;
    runCampaignWorkerBatch()
      .catch((error) => logger.error({ err: error }, 'Falló el worker de campañas'))
      .finally(() => { running = false; });
  }, 5_000);
  timer.unref();
}

export function stopCampaignWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}
