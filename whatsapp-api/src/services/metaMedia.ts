import { config, isMetaSendingConfigured } from '../config.js';
import { AppError } from '../errors/AppError.js';

export const MAX_MEDIA_DOWNLOAD_BYTES = 105 * 1024 * 1024;

export type MetaMediaInfo = {
  url: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
  id?: string;
  messaging_product?: string;
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

function requireMediaConfiguration(): void {
  if (!isMetaSendingConfigured()) {
    throw new AppError(
      'WhatsApp Cloud API todavía no está configurada para descargar archivos.',
      503
    );
  }
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

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.META_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError(
        `Meta no respondió dentro de ${config.META_REQUEST_TIMEOUT_MS} ms`,
        504,
        { transient: true }
      );
    }
    throw new AppError('No se pudo conectar con Meta para obtener el archivo.', 502, {
      transient: true,
      cause: error instanceof Error ? error.name : 'unknown'
    });
  } finally {
    clearTimeout(timeout);
  }
}

function authorizationHeaders(): HeadersInit {
  return { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` };
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

  let data: MetaMediaInfo & { error?: { message?: string; code?: number } };
  try {
    data = await response.json() as MetaMediaInfo & { error?: { message?: string; code?: number } };
  } catch {
    throw new AppError(`Meta respondió HTTP ${response.status} sin JSON válido.`, 502);
  }

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
  });

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
