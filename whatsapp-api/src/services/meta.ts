import { config, isMetaSendingConfigured } from '../config.js';
import { AppError } from '../errors/AppError.js';

const TRANSIENT_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRY_DELAY_MS = 5_000;

type MetaErrorEnvelope = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
};

type RequestPolicy = {
  retryTransient: boolean;
  deliveryCanBeAmbiguous: boolean;
};

function getBaseUrl(): string {
  if (!isMetaSendingConfigured()) {
    throw new AppError(
      'WhatsApp Cloud API todavía no está configurada. Faltan credenciales de Meta.',
      503
    );
  }

  return `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, response?: Response): number {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
    }

    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_DELAY_MS);
    }
  }

  return Math.min(config.META_RETRY_BASE_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

async function fetchWithTimeout(
  url: string,
  body: unknown,
  deliveryCanBeAmbiguous: boolean
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.META_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
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
        { transient: true, deliveryUnknown: deliveryCanBeAmbiguous }
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function metaRequest<T>(
  path: string,
  body: unknown,
  policy: RequestPolicy
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const maxRetries = policy.retryTransient ? config.META_MAX_RETRIES : 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, body, policy.deliveryCanBeAmbiguous);
      let data: T & MetaErrorEnvelope;

      try {
        data = (await response.json()) as T & MetaErrorEnvelope;
      } catch {
        const transient = TRANSIENT_HTTP_STATUSES.has(response.status);
        const responseMayHaveAcceptedDelivery = response.ok || response.status >= 500;
        if (transient && attempt < maxRetries) {
          await sleep(retryDelayMs(attempt, response));
          continue;
        }
        throw new AppError(`Meta respondió HTTP ${response.status} sin JSON válido`, 502, {
          httpStatus: response.status,
          transient,
          deliveryUnknown: policy.deliveryCanBeAmbiguous && responseMayHaveAcceptedDelivery,
          attempts: attempt + 1
        });
      }

      if (response.ok) return data;

      const transient = TRANSIENT_HTTP_STATUSES.has(response.status);
      if (transient && attempt < maxRetries) {
        await sleep(retryDelayMs(attempt, response));
        continue;
      }

      const message = data.error?.message ?? `Meta respondió HTTP ${response.status}`;
      throw new AppError(message, 502, {
        metaCode: data.error?.code,
        metaSubcode: data.error?.error_subcode,
        httpStatus: response.status,
        transient,
        deliveryUnknown: policy.deliveryCanBeAmbiguous && response.status >= 500,
        attempts: attempt + 1
      });
    } catch (error) {
      if (error instanceof AppError) {
        const transient = error.details?.transient === true;
        if (transient && attempt < maxRetries) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw error;
      }

      if (attempt < maxRetries) {
        await sleep(retryDelayMs(attempt));
        continue;
      }

      throw new AppError(
        policy.deliveryCanBeAmbiguous
          ? 'No se pudo confirmar si Meta aceptó el mensaje; no se reintentó para evitar duplicados'
          : 'No se pudo conectar con Meta después de varios intentos',
        502,
        {
          transient: true,
          deliveryUnknown: policy.deliveryCanBeAmbiguous,
          attempts: attempt + 1,
          cause: error instanceof Error ? error.name : 'unknown'
        }
      );
    }
  }

  throw new AppError('No se pudo completar la solicitud a Meta', 502);
}

export type SendResult = {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string; message_status?: string }>;
};

function requireSendAcknowledgement(result: SendResult): SendResult {
  const wamid = result.messages?.[0]?.id;
  if (typeof wamid !== 'string' || wamid.trim() === '') {
    throw new AppError(
      'Meta aceptó la solicitud HTTP pero no devolvió el identificador del mensaje',
      502,
      {
        transient: false,
        deliveryUnknown: true,
        responseAccepted: true,
        reason: 'missing_wamid',
        attempts: 1
      }
    );
  }
  return result;
}

export async function sendText(
  to: string,
  text: string,
  previewUrl = false
): Promise<SendResult> {
  const result = await metaRequest<SendResult>(
    '/messages',
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: previewUrl, body: text }
    },
    { retryTransient: false, deliveryCanBeAmbiguous: true }
  );
  return requireSendAcknowledgement(result);
}

export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components?: unknown[]
): Promise<SendResult> {
  const result = await metaRequest<SendResult>(
    '/messages',
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {})
      }
    },
    { retryTransient: false, deliveryCanBeAmbiguous: true }
  );
  return requireSendAcknowledgement(result);
}

export function markAsRead(messageId: string): Promise<unknown> {
  return metaRequest(
    '/messages',
    {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    },
    { retryTransient: true, deliveryCanBeAmbiguous: false }
  );
}
