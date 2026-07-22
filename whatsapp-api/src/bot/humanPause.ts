import { config } from '../config.js';

/**
 * REGLA DE SANTIAGO: cada vez que habla un humano, el bot se frena.
 *
 * Vale para cualquier respuesta manual, venga del panel o del celular. Un solo
 * lugar decide cuánto dura la pausa, para que no queden criterios distintos
 * según por dónde se conteste.
 *
 * Se puede ajustar con `BOT_PAUSE_AFTER_HUMAN_MINUTES` (por defecto, un día).
 * Desde el panel siempre se puede reactivar antes con el botón "Reactivar".
 */
export function humanReplyPauseUntil(now: number = Date.now()): Date {
  return new Date(now + config.BOT_PAUSE_AFTER_HUMAN_MINUTES * 60_000);
}
