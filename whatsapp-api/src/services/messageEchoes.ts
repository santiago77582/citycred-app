import {
  insertMessage,
  setConversationBotPause,
  upsertContact,
  upsertConversation
} from '../repository.js';
import { humanReplyPauseUntil } from '../bot/humanPause.js';
import { logger } from '../utils/logger.js';
import { messageText } from './webhookMessage.js';

/**
 * "Ecos" de mensajes que el negocio envió DESDE EL CELULAR.
 *
 * Cuando Santiago responde desde la app de WhatsApp del teléfono, ese mensaje
 * no pasa por la Cloud API y el panel nunca lo vería. Si Meta entrega el campo
 * `message_echoes` / `smb_message_echoes`, acá se registran como SALIENTES para
 * que la conversación se vea completa.
 *
 * Es inerte si Meta no envía esos campos: no rompe nada ni cambia el flujo normal.
 */

type UnknownRecord = Record<string, unknown>;

function asArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? (value as UnknownRecord[]) : [];
}

export async function processMessageEchoes(value: UnknownRecord): Promise<number> {
  const echoes = [
    ...asArray(value.message_echoes),
    ...asArray(value.smb_message_echoes)
  ];
  if (echoes.length === 0) return 0;

  let registrados = 0;
  for (const echo of echoes) {
    // El destinatario (el cliente) puede venir como `to` o `recipient_id`.
    const waId = String(echo.to ?? echo.recipient_id ?? '');
    const wamid = String(echo.id ?? '');
    if (!waId || !wamid) continue;

    const contact = await upsertContact(waId, null);
    const conversation = await upsertConversation(contact.id);
    const inserted = await insertMessage({
      wamid,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      type: String(echo.type ?? 'text'),
      text: messageText(echo),
      status: 'SENT',
      raw: { ...echo, citycred_source: 'phone_echo' }
    });
    // insertMessage devuelve null si el wamid ya existía: no se duplica.
    if (!inserted) continue;

    // Una respuesta manual desde el celular pausa el bot igual que desde el
    // panel, para que nunca conteste encima de una respuesta humana.
    await setConversationBotPause(waId, humanReplyPauseUntil());
    registrados += 1;
  }

  if (registrados > 0) {
    logger.info({ registrados }, 'Respuestas enviadas desde el celular registradas en el panel');
  }
  return registrados;
}
