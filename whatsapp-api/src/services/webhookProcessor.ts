import {
  createWebhookEvent,
  finishWebhookEvent,
  insertMessage,
  updateMessageStatus,
  upsertContact,
  upsertConversation,
  type Status
} from '../repository.js';
import type { MetaWebhookPayload } from '../types/whatsapp.js';
import { logger } from '../utils/logger.js';

function messageText(message: Record<string, unknown>): string | null {
  const type = String(message.type ?? 'unknown');
  if (type === 'text') return String((message.text as { body?: unknown } | undefined)?.body ?? '');
  if (type === 'button') return String((message.button as { text?: unknown } | undefined)?.text ?? '');
  if (type === 'image' || type === 'video' || type === 'document') {
    const media = message[type] as { caption?: unknown; filename?: unknown } | undefined;
    return String(media?.caption ?? media?.filename ?? '');
  }
  if (type === 'interactive') {
    const interactive = message.interactive as Record<string, unknown> | undefined;
    const buttonReply = interactive?.button_reply as { title?: unknown } | undefined;
    const listReply = interactive?.list_reply as { title?: unknown } | undefined;
    return String(buttonReply?.title ?? listReply?.title ?? '');
  }
  return null;
}

function mapStatus(status: string): Status {
  switch (status) {
    case 'sent': return 'SENT';
    case 'delivered': return 'DELIVERED';
    case 'read': return 'READ';
    case 'failed': return 'FAILED';
    default: return 'PENDING';
  }
}

export async function processWebhook(payload: MetaWebhookPayload): Promise<void> {
  const eventId = await createWebhookEvent(payload);
  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        const contactsByWaId = new Map(
          (value.contacts ?? []).map((c) => [c.wa_id ?? '', c.profile?.name ?? null])
        );

        for (const raw of value.messages ?? []) {
          const message = raw as Record<string, unknown>;
          const waId = String(message.from ?? '');
          const wamid = String(message.id ?? '');
          if (!waId || !wamid) continue;

          const contact = await upsertContact(waId, contactsByWaId.get(waId));
          const conversation = await upsertConversation(contact.id);
          await insertMessage({
            wamid,
            conversationId: conversation.id,
            direction: 'INBOUND',
            type: String(message.type ?? 'unknown'),
            text: messageText(message),
            status: 'RECEIVED',
            raw: message
          });
        }

        for (const raw of value.statuses ?? []) {
          const status = raw as Record<string, unknown>;
          const wamid = String(status.id ?? '');
          if (!wamid) continue;
          const errors = Array.isArray(status.errors) ? status.errors as Array<Record<string, unknown>> : [];
          const firstError = errors[0];
          await updateMessageStatus({
            wamid,
            status: mapStatus(String(status.status ?? '')),
            errorCode: firstError?.code ? String(firstError.code) : null,
            errorMessage: firstError?.title
              ? String(firstError.title)
              : firstError?.message
                ? String(firstError.message)
                : null,
            raw: status
          });
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
