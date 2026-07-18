import {
  insertMessageAttachment,
  recordMessageMilestone,
  registerInboundActivity,
  type AttachmentType
} from '../platformRepository.js';
import {
  createWebhookEvent,
  finishWebhookEvent,
  insertMessage,
  updateMessageStatus,
  upsertContact,
  upsertConversation,
  type Status
} from '../repository.js';
import { sanitizeInboundMessage, sanitizeWebhookPayload } from '../security/webhookSanitizer.js';
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
  if (type === 'audio') return '[Audio]';
  if (type === 'sticker') return '[Sticker]';
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

function attachmentFrom(message: Record<string, unknown>): {
  mediaId: string | null;
  mediaType: AttachmentType;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
} | null {
  const type = String(message.type ?? '');
  if (!['image', 'audio', 'video', 'document', 'sticker'].includes(type)) return null;
  const media = message[type] as Record<string, unknown> | undefined;
  if (!media) return null;
  const voice = type === 'audio' && media.voice === true;
  const mediaType: AttachmentType = voice
    ? 'VOICE'
    : type.toUpperCase() as AttachmentType;
  return {
    mediaId: typeof media.id === 'string' ? media.id : null,
    mediaType,
    mimeType: typeof media.mime_type === 'string' ? media.mime_type : null,
    filename: typeof media.filename === 'string' ? media.filename : null,
    caption: typeof media.caption === 'string' ? media.caption : null
  };
}

export async function processWebhook(payload: MetaWebhookPayload): Promise<void> {
  const safePayload = sanitizeWebhookPayload(payload);
  const eventId = await createWebhookEvent(safePayload);
  try {
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
          if (attachment) {
            await insertMessageAttachment({ messageId, ...attachment });
          }
        }

        for (const raw of value.statuses ?? []) {
          const status = raw as Record<string, unknown>;
          const wamid = String(status.id ?? '');
          if (!wamid) continue;
          const mappedStatus = mapStatus(String(status.status ?? ''));
          const errors = Array.isArray(status.errors) ? status.errors as Array<Record<string, unknown>> : [];
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
