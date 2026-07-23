import { config, isAiEnabled } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Cliente mínimo de OpenAI.
 *
 * REGLAS DE SEGURIDAD (Santiago):
 * - La clave sale SIEMPRE de la variable de entorno. Nunca del código.
 * - La clave no se registra en logs ni se devuelve en ninguna respuesta.
 * - Si la IA falla, NO se rompe el webhook ni el chat: se devuelve `null` y
 *   quien llama sigue con las reglas de siempre.
 */

const BASE_URL = 'https://api.openai.com/v1';

export type AiFailure =
  | 'DISABLED'        // la IA está apagada o falta la clave
  | 'TIMEOUT'
  | 'NO_CREDIT'       // la cuenta de OpenAI se quedó sin crédito
  | 'RATE_LIMIT'
  | 'BAD_RESPONSE'
  | 'ERROR';

export type AiResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: AiFailure };

function fail(failure: AiFailure): AiResult<never> {
  return { ok: false, failure };
}

/** Traduce el estado HTTP de OpenAI a una causa entendible. */
function failureFromStatus(status: number): AiFailure {
  if (status === 429) return 'RATE_LIMIT';
  // 402 = sin credito. OpenAI tambien usa 429 con "insufficient_quota".
  if (status === 402) return 'NO_CREDIT';
  return 'ERROR';
}

async function requestOpenAi(
  path: string,
  init: { method: string; body: BodyInit; headers?: Record<string, string> }
): Promise<AiResult<unknown>> {
  if (!isAiEnabled()) return fail('DISABLED');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.AI_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: init.method,
      // La clave viaja solo en el encabezado, jamás en el cuerpo ni en la URL.
      headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}`, ...(init.headers ?? {}) },
      body: init.body,
      signal: controller.signal
    });

    if (!response.ok) {
      const detalle = await response.text().catch(() => '');
      const sinCredito = /insufficient_quota|billing_hard_limit|exceeded your current quota/i.test(detalle);
      const causa = sinCredito ? 'NO_CREDIT' : failureFromStatus(response.status);
      // Se registra el error tecnico SIN la clave ni datos del cliente.
      logger.error({ status: response.status, causa }, 'La IA respondió con error');
      return fail(causa);
    }

    return { ok: true, value: await response.json() };
  } catch (error) {
    const abortada = error instanceof Error && error.name === 'AbortError';
    logger.error({ err: error }, 'Falló la llamada a la IA');
    return fail(abortada ? 'TIMEOUT' : 'ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

/** Pide una respuesta en JSON al modelo de texto/visión. */
export async function askJson(params: {
  system: string;
  user: Array<Record<string, unknown>> | string;
  maxTokens?: number;
}): Promise<AiResult<Record<string, unknown>>> {
  const result = await requestOpenAi('/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.AI_TEXT_MODEL,
      // temperature baja: interesa consistencia, no creatividad.
      temperature: 0,
      max_tokens: params.maxTokens ?? 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user }
      ]
    })
  });
  if (!result.ok) return result;

  const cuerpo = result.value as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const texto = cuerpo.choices?.[0]?.message?.content;
  if (typeof texto !== 'string') return fail('BAD_RESPONSE');
  try {
    const parsed = JSON.parse(texto) as Record<string, unknown>;
    return { ok: true, value: parsed };
  } catch {
    return fail('BAD_RESPONSE');
  }
}

/** Transcribe un audio. Devuelve el texto dicho por la persona. */
export async function transcribeAudio(params: {
  audio: Buffer;
  mimeType: string;
}): Promise<AiResult<string>> {
  if (!isAiEnabled()) return fail('DISABLED');

  const form = new FormData();
  const extension = params.mimeType.includes('mp4') ? 'mp4'
    : params.mimeType.includes('mpeg') ? 'mp3'
      : params.mimeType.includes('wav') ? 'wav'
        : 'ogg';
  form.append('file', new Blob([new Uint8Array(params.audio)], { type: params.mimeType }), `audio.${extension}`);
  form.append('model', config.AI_TRANSCRIBE_MODEL);
  form.append('language', 'es');

  const result = await requestOpenAi('/audio/transcriptions', { method: 'POST', body: form });
  if (!result.ok) return result;

  const texto = (result.value as { text?: unknown }).text;
  if (typeof texto !== 'string' || texto.trim() === '') return fail('BAD_RESPONSE');
  return { ok: true, value: texto.trim() };
}
