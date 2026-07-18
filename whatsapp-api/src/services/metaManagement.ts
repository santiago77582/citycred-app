import { config } from '../config.js';
import { AppError } from '../errors/AppError.js';

type MetaErrorEnvelope = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
};

function requireManagementConfig(): void {
  const missing = [
    !config.META_GRAPH_VERSION && 'META_GRAPH_VERSION',
    !config.WHATSAPP_ACCESS_TOKEN && 'WHATSAPP_ACCESS_TOKEN',
    !config.WHATSAPP_PHONE_NUMBER_ID && 'WHATSAPP_PHONE_NUMBER_ID'
  ].filter(Boolean);
  if (missing.length) {
    throw new AppError(
      `Falta configuración de Meta para administrar la cuenta: ${missing.join(', ')}.`,
      503
    );
  }
}

function managementUrl(path: string): URL {
  requireManagementConfig();
  return new URL(
    `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${path.replace(/^\//, '')}`
  );
}

async function parseJson<T>(response: Response): Promise<T & MetaErrorEnvelope> {
  let data: T & MetaErrorEnvelope;
  try {
    data = await response.json() as T & MetaErrorEnvelope;
  } catch {
    throw new AppError(`Meta respondió HTTP ${response.status} sin JSON válido.`, 502, {
      httpStatus: response.status
    });
  }
  if (!response.ok) {
    throw new AppError(data.error?.message ?? `Meta respondió HTTP ${response.status}.`, 502, {
      metaCode: data.error?.code,
      metaSubcode: data.error?.error_subcode,
      httpStatus: response.status
    });
  }
  return data;
}

async function fetchManagement(
  url: URL,
  init: RequestInit,
  timeoutMs = config.META_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      redirect: 'error',
      signal: controller.signal
    });
  } catch (error) {
    throw new AppError(
      controller.signal.aborted
        ? 'Meta demoró demasiado en responder.'
        : 'No se pudo conectar con Meta para administrar la cuenta.',
      controller.signal.aborted ? 504 : 502,
      { transient: true, cause: error instanceof Error ? error.name : 'unknown' }
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function graphRequest<T>(params: {
  path: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}): Promise<T> {
  const url = managementUrl(params.path);
  for (const [key, value] of Object.entries(params.query ?? {})) {
    url.searchParams.set(key, value);
  }
  const response = await fetchManagement(url, {
    method: params.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      ...(params.body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(params.body ? { body: JSON.stringify(params.body) } : {})
  });
  return parseJson<T>(response);
}

export type BusinessProfile = {
  messaging_product?: string;
  address?: string;
  description?: string;
  vertical?: string;
  about?: string;
  email?: string;
  websites?: string[];
  profile_picture_url?: string;
};

export type BusinessProfileEnvelope = {
  data?: Array<BusinessProfile | { business_profile?: BusinessProfile }>;
};

export type PhoneNumberStatus = {
  id?: string;
  verified_name?: string;
  code_verification_status?: string;
  display_phone_number?: string;
  quality_rating?: string;
};

export type CommerceSettings = {
  id?: string;
  is_cart_enabled?: boolean;
  is_catalog_visible?: boolean;
};

export async function getBusinessProfile(): Promise<BusinessProfileEnvelope> {
  return graphRequest({
    path: `${config.WHATSAPP_PHONE_NUMBER_ID}/whatsapp_business_profile`,
    query: {
      fields: 'about,address,description,email,profile_picture_url,websites,vertical'
    }
  });
}

export async function updateBusinessProfile(profile: {
  about?: string | null;
  address?: string | null;
  description?: string | null;
  email?: string | null;
  websites?: string[];
  vertical?: string | null;
  profilePictureHandle?: string | null;
}): Promise<{ success?: boolean }> {
  return graphRequest({
    path: `${config.WHATSAPP_PHONE_NUMBER_ID}/whatsapp_business_profile`,
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      ...(profile.about !== undefined ? { about: profile.about ?? '' } : {}),
      ...(profile.address !== undefined ? { address: profile.address ?? '' } : {}),
      ...(profile.description !== undefined ? { description: profile.description ?? '' } : {}),
      ...(profile.email !== undefined ? { email: profile.email ?? '' } : {}),
      ...(profile.websites !== undefined ? { websites: profile.websites } : {}),
      ...(profile.vertical !== undefined ? { vertical: profile.vertical ?? '' } : {}),
      ...(profile.profilePictureHandle !== undefined
        ? { profile_picture_handle: profile.profilePictureHandle ?? '' }
        : {})
    }
  });
}

export async function uploadBusinessProfilePicture(params: {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png';
}): Promise<{ applied: true }> {
  requireManagementConfig();
  const appId = process.env.META_APP_ID?.trim();
  if (!appId) {
    throw new AppError('Falta META_APP_ID para cargar la foto del perfil.', 503);
  }
  if (params.bytes.length === 0) throw new AppError('La imagen está vacía.', 400);
  if (params.bytes.length > 5 * 1024 * 1024) {
    throw new AppError('La foto de perfil supera el máximo interno de 5 MB.', 413);
  }

  const sessionUrl = managementUrl(`${appId}/uploads`);
  sessionUrl.searchParams.set('file_length', String(params.bytes.length));
  sessionUrl.searchParams.set('file_type', params.mimeType);
  const sessionResponse = await fetchManagement(sessionUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` }
  });
  const session = await parseJson<{ id?: string }>(sessionResponse);
  if (!session.id) throw new AppError('Meta no devolvió el identificador de carga.', 502);

  const uploadResponse = await fetchManagement(
    managementUrl(session.id),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': params.mimeType,
        file_offset: '0'
      },
      body: params.bytes as unknown as BodyInit
    },
    config.META_MEDIA_TIMEOUT_MS
  );
  const uploaded = await parseJson<{ h?: string }>(uploadResponse);
  if (!uploaded.h) throw new AppError('Meta no devolvió el identificador de la imagen.', 502);

  await updateBusinessProfile({ profilePictureHandle: uploaded.h });
  return { applied: true };
}

export async function getPhoneNumberStatus(): Promise<PhoneNumberStatus> {
  return graphRequest({
    path: String(config.WHATSAPP_PHONE_NUMBER_ID),
    query: {
      fields: [
        'id',
        'verified_name',
        'code_verification_status',
        'display_phone_number',
        'quality_rating'
      ].join(',')
    }
  });
}

export async function getCommerceSettings(): Promise<{ data?: CommerceSettings[] }> {
  return graphRequest({
    path: `${config.WHATSAPP_PHONE_NUMBER_ID}/whatsapp_commerce_settings`
  });
}

export async function updateCommerceSettings(input: {
  cartEnabled: boolean;
  catalogVisible: boolean;
}): Promise<{ success?: boolean }> {
  return graphRequest({
    path: `${config.WHATSAPP_PHONE_NUMBER_ID}/whatsapp_commerce_settings`,
    method: 'POST',
    query: {
      is_cart_enabled: String(input.cartEnabled),
      is_catalog_visible: String(input.catalogVisible)
    }
  });
}
