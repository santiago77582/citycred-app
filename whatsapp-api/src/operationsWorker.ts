import { config } from './config.js';
import { runOperationalChecks, type OperationalTrigger } from './operationsRepository.js';
import { logger } from './utils/logger.js';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function execute(trigger: OperationalTrigger): Promise<void> {
  if (running) {
    logger.warn({ trigger }, 'Se omitió una verificación operativa porque la anterior sigue activa');
    return;
  }
  running = true;
  try {
    const run = await runOperationalChecks(trigger);
    logger.info(
      { runId: run.id, status: run.status, summary: run.summary },
      'Verificación operativa terminada'
    );
  } catch (error) {
    logger.error({ err: error, trigger }, 'Falló la verificación operativa programada');
  } finally {
    running = false;
  }
}

export function startOperationsWorker(): boolean {
  if (!config.OPERATIONS_SCHEDULER_ENABLED || timer) return false;
  const intervalMs = config.OPERATIONS_CHECK_INTERVAL_MINUTES * 60_000;
  void execute('STARTUP');
  timer = setInterval(() => void execute('SCHEDULED'), intervalMs);
  timer.unref();
  logger.info(
    { intervalMinutes: config.OPERATIONS_CHECK_INTERVAL_MINUTES },
    'Monitor operativo programado activado'
  );
  return true;
}

export function stopOperationsWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
