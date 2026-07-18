import { config, isMetaSendingConfigured } from '../config.js';
import { AppError } from '../errors/AppError.js';

export type AdvancedMessageResult = {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string; message_status?: string }>;
};

type MetaErrorEnvelope = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
};

function endpoint(): string {
  if (!isMetaSendingConfigured()) {
    throw new AppError(
      'WhatsApp Cloud API todavía no está configurada. Faltan credenciales de Meta.',
      503
    );
  }
  return `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

export async function sendAdvancedMessage(
  body: Record<string, unknown>
): Promise<AdvancedMessageResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.META_REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError(
        `Meta no respondió dentro de ${config.META_REQUEST_TIMEOUT_MS} ms`,
        504,
        { transient: true, deliveryUnknown: true }
      );
    }
    throw new AppError(
      'No se pudo confirmar si Meta aceptó el mensaje; no se reintentó para evitar duplicados.',
      502,
      {
        transient: true,
        deliveryUnknown: true,
        cause: error instanceof Error ? error.name : 'unknown'
      }
    );
  } finally {
    clearTimeout(timeout);
  }

  let data: AdvancedMessageResult & MetaErrorEnvelope;
  try {
    data = await response.json() as AdvancedMessageResult & MetaErrorEnvelope;
  } catch {
    throw new AppError(`Meta respondió HTTP ${response.status} sin JSON válido.`, 502, {
      httpStatus: response.status,
      deliveryUnknown: response.ok || response.status >= 500
    });
  }

  if (!response.ok) {
    throw new AppError(data.error?.message ?? `Meta respondió HTTP ${response.status}.`, 502, {
      metaCode: data.error?.code,
      metaSubcode: data.error?.error_subcode,
      httpStatus: response.status,
      deliveryUnknown: response.status >= 500
    });
  }

  const wamid = data.messages?.[0]?.id;
  if (typeof wamid !== 'string' || wamid.trim() === '') {
    throw new AppError(
      'Meta aceptó la solicitud HTTP pero no devolvió el identificador del mensaje.',
      502,
      {
        transient: false,
        deliveryUnknown: true,
        responseAccepted: true,
        reason: 'missing_wamid'
      }
    );
  }
  return data;
}
