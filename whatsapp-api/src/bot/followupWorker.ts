import { sendAdvancedAndPersist } from '../services/outboundAdvanced.js';
import { sendTemplateAndPersist } from '../routes/messages.js';
import { logger } from '../utils/logger.js';
import { getBotRuntimeSettings } from './botStateRepository.js';
import {
  claimDueFollowups,
  finishFollowup,
  followupEligibility
} from './followupRepository.js';

function localHour(date: Date, timezone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).find((part) => part.type === 'hour')?.value;
  return Number(hour ?? -1);
}

function isBusinessTime(
  date: Date,
  timezone: string,
  startHour: number,
  endHour: number
): boolean {
  const hour = localHour(date, timezone);
  return hour >= startHour && hour < endHour;
}

function nextBusinessTime(
  from: Date,
  timezone: string,
  startHour: number,
  endHour: number
): Date {
  const candidate = new Date(from);
  candidate.setUTCMinutes(0, 0, 0);
  for (let index = 0; index < 72; index += 1) {
    if (isBusinessTime(candidate, timezone, startHour, endHour)) return candidate;
    candidate.setUTCHours(candidate.getUTCHours() + 1);
  }
  return new Date(from.getTime() + 12 * 60 * 60 * 1000);
}

export async function runDueCitycredFollowups(limit = 20): Promise<{
  claimed: number;
  sent: number;
  skipped: number;
  rescheduled: number;
  failed: number;
}> {
  const result = { claimed: 0, sent: 0, skipped: 0, rescheduled: 0, failed: 0 };
  const settings = await getBotRuntimeSettings();
  if (!settings.followupsEnabled) return result;

  const followups = await claimDueFollowups(limit);
  result.claimed = followups.length;
  for (const followup of followups) {
    try {
      const now = new Date();
      if (!isBusinessTime(
        now,
        settings.businessTimezone,
        settings.businessHourStart,
        settings.businessHourEnd
      )) {
        await finishFollowup({
          id: followup.id,
          status: 'PENDING',
          reason: 'outside_business_hours',
          dueAt: nextBusinessTime(
            now,
            settings.businessTimezone,
            settings.businessHourStart,
            settings.businessHourEnd
          )
        });
        result.rescheduled += 1;
        continue;
      }

      const eligibility = await followupEligibility(followup);
      if (!eligibility.eligible) {
        await finishFollowup({
          id: followup.id,
          status: 'SKIPPED',
          reason: eligibility.reason
        });
        result.skipped += 1;
        continue;
      }

      const firstName = followup.profileName?.trim().split(/\s+/)[0] || 'Cliente';
      const outcome = followup.deliveryMode === 'TEXT'
        ? await sendAdvancedAndPersist({
            to: followup.waId,
            type: 'followup_text',
            text: followup.textBody,
            message: {
              type: 'text',
              text: { body: followup.textBody, preview_url: false }
            }
          })
        : await sendTemplateAndPersist({
            to: followup.waId,
            templateName: followup.templateName ?? 'seguimiento_pendiente_citycred',
            languageCode: 'es_AR',
            components: [{
              type: 'body',
              parameters: [{ type: 'text', text: firstName }]
            }]
          });

      if (outcome.statusCode !== 201) {
        await finishFollowup({
          id: followup.id,
          status: 'FAILED',
          reason: 'delivery_unknown',
          error: 'Meta no confirmó el envío; no se reintentó para evitar duplicados.'
        });
        result.failed += 1;
        continue;
      }
      await finishFollowup({
        id: followup.id,
        status: 'SENT',
        sentMessageId: outcome.payload.messageId
      });
      result.sent += 1;
    } catch (error) {
      await finishFollowup({
        id: followup.id,
        status: 'FAILED',
        error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000)
      }).catch(() => undefined);
      result.failed += 1;
      logger.error({ err: error, followupId: followup.id }, 'Falló un seguimiento de CityCred');
    }
  }
  return result;
}

let workerTimer: NodeJS.Timeout | null = null;
let running = false;

export function startCitycredFollowupWorker(): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    if (running) return;
    running = true;
    runDueCitycredFollowups()
      .catch((error) => logger.error({ err: error }, 'Falló el worker de seguimientos'))
      .finally(() => { running = false; });
  }, 60_000);
  workerTimer.unref();
}

export function stopCitycredFollowupWorker(): void {
  if (!workerTimer) return;
  clearInterval(workerTimer);
  workerTimer = null;
}
