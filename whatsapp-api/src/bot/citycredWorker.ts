import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';
import { processCitycredBotInbound } from './citycredBotService.js';
import { runDueCitycredFollowups } from './followupWorker.js';
import {
  claimBotInboundJobs,
  finishBotInboundJob,
  recoverStaleBotJobs
} from './inboundJobRepository.js';

let inboundTimer: NodeJS.Timeout | null = null;
let followupTimer: NodeJS.Timeout | null = null;
let inboundRunning = false;
let followupRunning = false;

async function runInboundBatch(): Promise<void> {
  const jobs = await claimBotInboundJobs(10);
  for (const job of jobs) {
    try {
      const result = await processCitycredBotInbound({
        waId: job.waId,
        inboundMessageId: job.inboundMessageId,
        message: job.payload
      });
      await finishBotInboundJob({
        id: job.id,
        status: result.processed ? 'DONE' : 'SKIPPED',
        error: result.processed ? null : result.reason
      });
    } catch (error) {
      const transient = error instanceof AppError && error.details?.transient === true;
      const canRetry = transient && job.attemptCount < 3;
      await finishBotInboundJob({
        id: job.id,
        status: canRetry ? 'PENDING' : 'FAILED',
        error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
        retryAt: canRetry
          ? new Date(Date.now() + job.attemptCount * 60_000)
          : null
      }).catch(() => undefined);
      logger.error(
        { err: error, botJobId: job.id, attempt: job.attemptCount },
        'Falló un trabajo del bot CityCred'
      );
    }
  }
}

export async function runCitycredWorkerOnce(): Promise<void> {
  await recoverStaleBotJobs();
  await runInboundBatch();
  await runDueCitycredFollowups();
}

export function startCitycredWorker(): void {
  if (inboundTimer || followupTimer) return;
  recoverStaleBotJobs().catch((error) => {
    logger.error({ err: error }, 'No se pudieron recuperar trabajos antiguos del bot');
  });

  inboundTimer = setInterval(() => {
    if (inboundRunning) return;
    inboundRunning = true;
    runInboundBatch()
      .catch((error) => logger.error({ err: error }, 'Falló la cola del bot CityCred'))
      .finally(() => { inboundRunning = false; });
  }, 2_000);
  inboundTimer.unref();

  followupTimer = setInterval(() => {
    if (followupRunning) return;
    followupRunning = true;
    runDueCitycredFollowups()
      .catch((error) => logger.error({ err: error }, 'Falló el worker de seguimientos'))
      .finally(() => { followupRunning = false; });
  }, 60_000);
  followupTimer.unref();
}

export function stopCitycredWorker(): void {
  if (inboundTimer) clearInterval(inboundTimer);
  if (followupTimer) clearInterval(followupTimer);
  inboundTimer = null;
  followupTimer = null;
}
