import { config } from '../config.js';
import { AppError } from '../errors/AppError.js';

const MAX_FLOW_JSON_BYTES = 2 * 1024 * 1024;
const MAX_FLOW_PAGES = 100;

export const FLOW_CATEGORIES = [
  'SIGN_UP',
  'SIGN_IN',
  'APPOINTMENT_BOOKING',
  'LEAD_GENERATION',
  'CONTACT_US',
  'CUSTOMER_SUPPORT',
  'SURVEY',
  'OTHER'
] as const;

export type FlowCategory = typeof FLOW_CATEGORIES[number];

export type MetaFlow = {
  id?: string;
  name?: string;
  status?: string;
  categories?: string[];
  preview?: unknown;
  validation_errors?: unknown[];
  json_version?: string;
  data_api_version?: string;
  data_channel_uri?: string;
  health_status?: unknown;
  whatsapp_business_account?: unknown;
  application?: unknown;
};

type MetaErrorEnvelope = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
};

type FlowPage = {
  data?: MetaFlow[];
  paging?: {
    cursors?: { after?: string };
  };
};

function requireFlowConfig(): void {
  const missing = [
    !config.META_GRAPH_VERSION && 'META_GRAPH_VERSION',
    !config.WHATSAPP_ACCESS_TOKEN && 'WHATSAPP_ACCESS_TOKEN',
    !config.WHATSAPP_BUSINESS_ACCOUNT_ID && 'WHATSAPP_BUSINESS_ACCOUNT_ID'
  ].filter(Boolean);
  if (missing.length) {
    throw new AppError(
      `Falta configuración de Meta para WhatsApp Flows: ${missing.join(', ')}.`,
      503
    );
  }
}

function graphUrl(path: string): URL {
  requireFlowConfig();
  return new URL(
    `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${path.replace(/^\//, '')}`
  );
}

async function request<T>(params: {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, string>;
  body?: BodyInit;
  contentType?: string;
}): Promise<T> {
  const url = graphUrl(params.path);
  for (const [key, value] of Object.entries(params.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.META_MEDIA_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: params.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        ...(params.contentType ? { 'Content-Type': params.contentType } : {})
      },
      ...(params.body ? { body: params.body } : {}),
      redirect: 'error',
      signal: controller.signal
    });
  } catch (error) {
    throw new AppError(
      controller.signal.aborted
        ? 'Meta demoró demasiado en responder al administrar WhatsApp Flows.'
        : 'No se pudo conectar con Meta para administrar WhatsApp Flows.',
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

function flowForm(params: {
  name?: string;
  categories?: FlowCategory[];
  cloneFlowId?: string | null;
  endpointUri?: string | null;
}): FormData {
  const form = new FormData();
  if (params.name !== undefined) form.set('name', params.name);
  if (params.categories !== undefined) {
    form.set('categories', JSON.stringify(params.categories));
  }
  if (params.cloneFlowId) form.set('clone_flow_id', params.cloneFlowId);
  if (params.endpointUri !== undefined) form.set('endpoint_uri', params.endpointUri ?? '');
  return form;
}

export async function listMetaFlows(): Promise<MetaFlow[]> {
  const flows: MetaFlow[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_FLOW_PAGES; page += 1) {
    const result = await request<FlowPage>({
      path: `${config.WHATSAPP_BUSINESS_ACCOUNT_ID}/flows`,
      query: {
        fields: 'id,name,status,categories,validation_errors,json_version,data_api_version,health_status',
        limit: '100',
        ...(after ? { after } : {})
      }
    });
    const current = Array.isArray(result.data) ? result.data : [];
    flows.push(...current);
    const next = result.paging?.cursors?.after;
    if (!next || next === after || current.length === 0) return flows;
    after = next;
  }
  throw new AppError('Meta devolvió demasiadas páginas de Flows; se detuvo por seguridad.', 502);
}

export function getMetaFlow(flowId: string): Promise<MetaFlow> {
  return request({
    path: flowId,
    query: {
      fields: [
        'id', 'name', 'categories', 'preview', 'status', 'validation_errors',
        'json_version', 'data_api_version', 'data_channel_uri', 'health_status',
        'whatsapp_business_account', 'application'
      ].join(',')
    }
  });
}

export function createMetaFlow(params: {
  name: string;
  categories: FlowCategory[];
  cloneFlowId?: string | null;
  endpointUri?: string | null;
}): Promise<{ id?: string }> {
  return request({
    path: `${config.WHATSAPP_BUSINESS_ACCOUNT_ID}/flows`,
    method: 'POST',
    body: flowForm(params)
  });
}

export function updateMetaFlowMetadata(flowId: string, params: {
  name?: string;
  categories?: FlowCategory[];
  endpointUri?: string | null;
}): Promise<{ success?: boolean }> {
  return request({
    path: flowId,
    method: 'POST',
    body: flowForm(params)
  });
}

export async function uploadMetaFlowJson(
  flowId: string,
  flowJson: Record<string, unknown>
): Promise<{ success?: boolean; validation_errors?: unknown[] }> {
  const serialized = JSON.stringify(flowJson);
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_FLOW_JSON_BYTES) {
    throw new AppError('El JSON del Flow supera el tamaño máximo interno de 2 MB.', 413);
  }
  const form = new FormData();
  form.set('file', new Blob([serialized], { type: 'application/json' }), 'flow.json');
  form.set('name', 'flow.json');
  form.set('asset_type', 'FLOW_JSON');
  return request({
    path: `${flowId}/assets`,
    method: 'POST',
    body: form
  });
}

export function publishMetaFlow(flowId: string): Promise<{ success?: boolean }> {
  return request({ path: `${flowId}/publish`, method: 'POST' });
}

export function deprecateMetaFlow(flowId: string): Promise<{ success?: boolean }> {
  return request({ path: `${flowId}/deprecate`, method: 'POST' });
}

export function deleteMetaFlow(flowId: string): Promise<{ success?: boolean }> {
  return request({ path: flowId, method: 'DELETE' });
}
