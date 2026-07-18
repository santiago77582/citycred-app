import { openAsBlob } from 'node:fs';
import { config, isMetaSendingConfigured } from '../config.js';
import { AppError } from '../errors/AppError.js';
import type { AttachmentType } from '../platformRepository.js';

export const MAX_MEDIA_DOWNLOAD_BYTES = 105 * 1024 * 1024;

export type MetaMediaInfo = {
  url: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
  id?: string;
  messaging_product?: string;
};

export type OutboundMediaKind = 'image' | 'audio' | 'video' | 'document' | 'sticker';

export type OutboundMediaSpec = {
  kind: OutboundMediaKind;
  attachmentType: AttachmentType;
  mimeType: string;
  maxBytes: number;
  allowsCaption: boolean;
};

export type MetaMediaUploadResult = {
  id: string;
};

export type MetaMediaSendResult = {
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

const ALLOWED_MEDIA_HOSTS = [
  'graph.facebook.com',
  'lookaside.fbsbx.com'
];
const ALLOWED_MEDIA_SUFFIXES = [
  '.facebook.com',
  '.fbsbx.com',
  '.fbcdn.net',
  '.whatsapp.net'
];

const OUTBOUND_MEDIA_SPECS: Record<string, Omit<OutboundMediaSpec, 'mimeType'>> = {
  'image/jpeg': {
    kind: 'image', attachmentType: 'IMAGE', maxBytes: 5_000_000, allowsCaption: true
  },
  'image/png': {
    kind: 'image', attachmentType: 'IMAGE', maxBytes: 5_000_000, allowsCaption: true
  },
  'image/webp': {
    kind: 'sticker', attachmentType: 'STICKER', maxBytes: 100_000, allowsCaption: false
  },
  'audio/aac': {
    kind: 'audio', attachmentType: 'AUDIO', maxBytes: 16_000_000, allowsCaption: false
  },
  'audio/mp4': {
    kind: 'audio', attachmentType: 'AUDIO', maxBytes: 16_000_000, allowsCaption: false
  },
  'audio/mpeg': {
    kind: 'audio', attachmentType: 'AUDIO', maxBytes: 16_000_000, allowsCaption: false
  },
  'audio/amr': {
    kind: 'audio', attachmentType: 'AUDIO', maxBytes: 16_000_000, allowsCaption: false
  },
  'audio/ogg': {
    kind: 'audio', attachmentType: 'AUDIO', maxBytes: 16_000_000, allowsCaption: false
  },
  'video/mp4': {
    kind: 'video', attachmentType: 'VIDEO', maxBytes: 16_000_000, allowsCaption: true
  },
  'video/3gpp': {
    kind: 'video', attachmentType: 'VIDEO', maxBytes: 16_000_000, allowsCaption: true
  },
  'text/plain': {
    kind: 'document', attachmentType: 'DOCUMENT', maxBytes: 100_000_000, allowsCaption: true
  },
  'application/pdf': {
    kind: 'document', attachmentType: 'DOCUMENT', maxBytes: 100_000_000, allowsCaption: true
  },
  'application/msword': {
    kind: 'document', attachmentType: 'DOCUMENT', maxBytes: 100_000_000, allowsCaption: true
  },
  'application/vnd.ms-excel': {
    kind: 'document', attachmentType: 'DOCUMENT', maxBytes: 100_000_000, allowsCaption: true
  },
  'application/vnd.ms-powerpoint': {
    kind: 'document', attachmentType: 'DOCUMENT', maxBytes: 100_000_000, allowsCaption: true
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    kind: 'document', attachmentType: 'DOCUMENT', maxBytes: 100_000_000, allowsCaption: true
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    kind: 'document', attachmentType: 'DOCUMENT', maxBytes: 100_000_000, allowsCaption: true
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    kind: 'document', attachmentType: 'DOCUMENT', maxBytes: 100_000_000, allowsCaption: true
  },
  'application/vnd.oasis.opendocument.text': {
    kind: 'document', attachmentType: 'DOCUMENT', maxBytes: 100_000_000, allowsCaption: true
  },
  'application/vnd.oasis.opendocument.spreadsheet': {
    kind: 'document', attachmentType: 'DOCUMENT', maxBytes: 100_000_000, allowsCaption: true
  },
  'application/vnd.oasis.opendocument.presentation': {
    kind: 'document', attachmentType: 'DOCUMENT', maxBytes: 100_000_000, allowsCaption: true
  }
};

function requireMediaConfiguration(): void {
  if (!isMetaSendingConfigured()) {
    throw new AppError(
      'WhatsApp Cloud API todavía no está configurada para trabajar con archivos.',
      503
    );
  }
}

function phoneBaseUrl(): string {
  requireMediaConfiguration();
  return `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}`;
}

export function resolveOutboundMediaSpec(rawMimeType: string): OutboundMediaSpec {
  const mimeType = rawMimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const spec = OUTBOUND_MEDIA_SPECS[mimeType];
  if (!spec) {
    throw new AppError(`El formato ${mimeType || 'desconocido'} no está permitido por WhatsApp.`, 415);
  }
  return { ...spec, mimeType };
}

export function isAllowedMetaMediaUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return ALLOWED_MEDIA_HOSTS.includes(host)
      || ALLOWED_MEDIA_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = config.META_REQUEST_TIMEOUT_MS,
  deliveryCanBeAmbiguous = false
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError(
        `Meta no respondió dentro de ${timeoutMs} ms`,
        504,
        { transient: true, deliveryUnknown: deliveryCanBeAmbiguous }
      );
    }
    throw new AppError('No se pudo conectar con Meta.', 502, {
      transient: true,
      deliveryUnknown: deliveryCanBeAmbiguous,
      cause: error instanceof Error ? error.name : 'unknown'
    });
  } finally {
    clearTimeout(timeout);
  }
}

function authorizationHeaders(): HeadersInit {
  return { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` };
}

async function parseMetaJson<T>(response: Response): Promise<T & MetaErrorEnvelope> {
  try {
    return await response.json() as T & MetaErrorEnvelope;
  } catch {
    throw new AppError(`Meta respondió HTTP ${response.status} sin JSON válido.`, 502, {
      httpStatus: response.status,
      deliveryUnknown: response.status >= 500
    });
  }
}

export async function uploadMetaMedia(params: {
  filePath: string;
  mimeType: string;
  filename: string;
}): Promise<MetaMediaUploadResult> {
  const blob = await openAsBlob(params.filePath, { type: params.mimeType });
  const form = new FormData();
  form.set('messaging_product', 'whatsapp');
  form.set('file', blob, params.filename);

  const response = await fetchWithTimeout(
    `${phoneBaseUrl()}/media`,
    {
      method: 'POST',
      headers: authorizationHeaders(),
      body: form
    },
    config.META_MEDIA_TIMEOUT_MS,
    false
  );
  const data = await parseMetaJson<MetaMediaUploadResult>(response);
  if (!response.ok) {
    throw new AppError(data.error?.message ?? `Meta respondió HTTP ${response.status}.`, 502, {
      metaCode: data.error?.code,
      metaSubcode: data.error?.error_subcode,
      httpStatus: response.status,
      deliveryUnknown: false
    });
  }
  if (typeof data.id !== 'string' || data.id.trim() === '') {
    throw new AppError('Meta no devolvió el identificador del archivo subido.', 502, {
      deliveryUnknown: false
    });
  }
  return { id: data.id };
}

export async function sendMetaMediaMessage(params: {
  to: string;
  kind: OutboundMediaKind;
  mediaId: string;
  caption?: string | null;
  filename?: string | null;
}): Promise<MetaMediaSendResult> {
  const mediaObject: Record<string, string> = { id: params.mediaId };
  if (params.caption && ['image', 'video', 'document'].includes(params.kind)) {
    mediaObject.caption = params.caption;
  }
  if (params.filename && params.kind === 'document') {
    mediaObject.filename = params.filename;
  }

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: params.to,
    type: params.kind,
    [params.kind]: mediaObject
  };
  const response = await fetchWithTimeout(
    `${phoneBaseUrl()}/messages`,
    {
      method: 'POST',
      headers: {
        ...authorizationHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    },
    config.META_REQUEST_TIMEOUT_MS,
    true
  );
  const data = await parseMetaJson<MetaMediaSendResult>(response);
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
    throw new AppError('Meta aceptó el envío pero no devolvió el identificador del mensaje.', 502, {
      deliveryUnknown: true,
      responseAccepted: true,
      reason: 'missing_wamid'
    });
  }
  return data;
}

export async function retrieveMetaMediaInfo(mediaId: string): Promise<MetaMediaInfo> {
  requireMediaConfiguration();
  const url = new URL(
    `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${encodeURIComponent(mediaId)}`
  );
  url.searchParams.set('phone_number_id', String(config.WHATSAPP_PHONE_NUMBER_ID));

  const response = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: authorizationHeaders(),
    redirect: 'error'
  });

  const data = await parseMetaJson<MetaMediaInfo>(response);
  if (!response.ok) {
    throw new AppError(data.error?.message ?? `Meta respondió HTTP ${response.status}.`, 502, {
      metaCode: data.error?.code,
      httpStatus: response.status
    });
  }
  if (typeof data.url !== 'string' || !isAllowedMetaMediaUrl(data.url)) {
    throw new AppError('Meta devolvió una dirección de archivo no permitida.', 502);
  }
  if (typeof data.file_size === 'number' && data.file_size > MAX_MEDIA_DOWNLOAD_BYTES) {
    throw new AppError('El archivo supera el tamaño máximo permitido.', 413);
  }
  return data;
}

export async function openMetaMediaDownload(mediaId: string): Promise<{
  info: MetaMediaInfo;
  response: Response;
}> {
  const info = await retrieveMetaMediaInfo(mediaId);
  const response = await fetchWithTimeout(info.url, {
    method: 'GET',
    headers: authorizationHeaders(),
    redirect: 'error'
  }, config.META_MEDIA_TIMEOUT_MS);

  if (!response.ok) {
    throw new AppError(`No se pudo descargar el archivo desde Meta (HTTP ${response.status}).`, 502, {
      httpStatus: response.status
    });
  }

  const lengthHeader = response.headers.get('content-length');
  const length = lengthHeader ? Number(lengthHeader) : Number.NaN;
  if (Number.isFinite(length) && length > MAX_MEDIA_DOWNLOAD_BYTES) {
    await response.body?.cancel();
    throw new AppError('El archivo supera el tamaño máximo permitido.', 413);
  }
  if (!response.body) {
    throw new AppError('Meta no devolvió el contenido del archivo.', 502);
  }
  return { info, response };
}
