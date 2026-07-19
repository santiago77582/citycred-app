import { processCitycredBotInbound } from '../bot/citycredBotService.js';
import { recordMetaAccountChanges } from '../metaAccountEventsRepository.js';
import {
  insertMessageAttachment,
  recordMessageMilestone,
  registerInboundActivity
} from '../platformRepository.js';
import {
  createWebhookEvent,
  finishWebhookEvent,
  insertMessage,
  updateMessageStatus,
  upsertContact,
  upsertConversation
} from '../repository.js';
import { sanitizeInboundMessage, sanitizeWebhookPayload } from '../security/webhookSanitizer.js';
import type { MetaWebhookPayload } from '../types/whatsapp.js';
import { logger } from '../utils/logger.js';
import { attachmentFrom, mapStatus, messageText } from './webhookMessage.js';

export async function processWebhook(payload: MetaWebhookPayload): Promise<void> {
  const safePayload = sanitizeWebhookPayload(payload);
  const eventId = await createWebhookEvent(safePayload);
  try {
    await recordMetaAccountChanges(
      safePayload as unknown as Record<string, unknown>
    );

    for (const entry of safePayload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        const contactsByWaId = new Map(
          (value.contacts ?? []).map((c) => [c.wa_id ?? '', c.profile?.name ?? null])
        );

        for (const raw of value.messages ?? []) {
          const sanitized = sanitizeInboundMessage(raw as Record<string, unknown>);
          const message = sanitized.blocked
            ? { ...sanitized.message, citycred_security: { blocked_sensitive_input: true } }
            : sanitized.message;
          const waId = String(message.from ?? '');
          const wamid = String(message.id ?? '');
          if (!waId || !wamid) continue;

          const contact = await upsertContact(waId, contactsByWaId.get(waId));
          const conversation = await upsertConversation(contact.id);
          const messageId = await insertMessage({
            wamid,
            conversationId: conversation.id,
            direction: 'INBOUND',
            type: String(message.type ?? 'unknown'),
            text: messageText(message),
            status: 'RECEIVED',
            raw: message
          });
          if (!messageId) continue;

          await registerInboundActivity(conversation.id);
          const attachment = attachmentFrom(message);
          if (attachment) await insertMessageAttachment({ messageId, ...attachment });

          processCitycredBotInbound({ waId, inboundMessageId: messageId, message })
            .catch((error) => {
              logger.error(
                { err: error, waId, inboundMessageId: messageId },
                'Falló el bot después de guardar el mensaje entrante'
              );
            });
        }

        for (const raw of value.statuses ?? []) {
          const status = raw as Record<string, unknown>;
          const wamid = String(status.id ?? '');
          if (!wamid) continue;
          const mappedStatus = mapStatus(String(status.status ?? ''));
          const errors = Array.isArray(status.errors)
            ? status.errors as Array<Record<string, unknown>>
            : [];
          const firstError = errors[0];
          const updated = await updateMessageStatus({
            wamid,
            status: mappedStatus,
            errorCode: firstError?.code ? String(firstError.code) : null,
            errorMessage: firstError?.title
              ? String(firstError.title)
              : firstError?.message
                ? String(firstError.message)
                : null,
            raw: status
          });
          if (updated) await recordMessageMilestone(wamid, mappedStatus);
        }
      }
    }
    await finishWebhookEvent(eventId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishWebhookEvent(eventId, message);
    logger.error({ err: error }, 'Falló el procesamiento del webhook');
    throw error;
  }
}
