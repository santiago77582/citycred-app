import { config, isMetaSendingConfigured } from '../config.js';
import { AppError } from '../errors/AppError.js';

function getBaseUrl(): string {
  if (!isMetaSendingConfigured()) {
    throw new AppError(
      'WhatsApp Cloud API todavía no está configurada. Faltan credenciales de Meta.',
      503
    );
  }

  return `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}`;
}

async function metaRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  let data: T & { error?: { message?: string; code?: number; error_subcode?: number } };
  try {
    data = (await response.json()) as T & {
      error?: { message?: string; code?: number; error_subcode?: number };
    };
  } catch {
    throw new AppError(`Meta respondió HTTP ${response.status} sin JSON válido`, 502);
  }

  if (!response.ok) {
    const message = data.error?.message ?? `Meta respondió HTTP ${response.status}`;
    throw new AppError(message, 502, {
      metaCode: data.error?.code,
      metaSubcode: data.error?.error_subcode,
      httpStatus: response.status
    });
  }
  return data;
}

export type SendResult = {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string; message_status?: string }>;
};

export function sendText(to: string, text: string, previewUrl = false): Promise<SendResult> {
  return metaRequest('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: previewUrl, body: text }
  });
}

export function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components?: unknown[]
): Promise<SendResult> {
  return metaRequest('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components ? { components } : {})
    }
  });
}

export function markAsRead(messageId: string): Promise<unknown> {
  return metaRequest('/messages', {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId
  });
}
