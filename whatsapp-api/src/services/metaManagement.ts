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

async function graphRequest<T>(params: {
  path: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}): Promise<T> {
  requireManagementConfig();
  const url = new URL(
    `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${params.path.replace(/^\//, '')}`
  );
  for (const [key, value] of Object.entries(params.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.META_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: params.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        ...(params.body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(params.body ? { body: JSON.stringify(params.body) } : {}),
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
  name_status?: string;
  platform_type?: string;
  throughput?: unknown;
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

export async function getPhoneNumberStatus(): Promise<PhoneNumberStatus> {
  return graphRequest({
    path: String(config.WHATSAPP_PHONE_NUMBER_ID),
    query: {
      fields: [
        'id',
        'verified_name',
        'code_verification_status',
        'display_phone_number',
        'quality_rating',
        'name_status',
        'platform_type',
        'throughput'
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
