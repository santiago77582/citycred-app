import { config } from '../config.js';
import { AppError } from '../errors/AppError.js';

export const FLOW_METRIC_NAMES = [
  'ENDPOINT_AVAILABILITY',
  'ENDPOINT_REQUEST_COUNT',
  'ENDPOINT_REQUEST_ERROR',
  'ENDPOINT_REQUEST_LATENCY_SECONDS_CEIL'
] as const;

export type FlowMetricName = typeof FLOW_METRIC_NAMES[number];

export type MetaAnalyticsEnvelope = Record<string, unknown>;

type MetaErrorEnvelope = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
};

function requireAnalyticsConfig(): void {
  const missing = [
    !config.META_GRAPH_VERSION && 'META_GRAPH_VERSION',
    !config.WHATSAPP_ACCESS_TOKEN && 'WHATSAPP_ACCESS_TOKEN',
    !config.WHATSAPP_BUSINESS_ACCOUNT_ID && 'WHATSAPP_BUSINESS_ACCOUNT_ID'
  ].filter(Boolean);
  if (missing.length) {
    throw new AppError(
      `Falta configuración de Meta para consultar analíticas oficiales: ${missing.join(', ')}.`,
      503
    );
  }
}

function graphUrl(path: string): URL {
  requireAnalyticsConfig();
  return new URL(
    `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${path.replace(/^\//, '')}`
  );
}

async function graphGet<T>(
  path: string,
  query: Record<string, string>
): Promise<T> {
  const url = graphUrl(path);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.META_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` },
      redirect: 'error',
      signal: controller.signal
    });
  } catch (error) {
    throw new AppError(
      controller.signal.aborted
        ? 'Meta demoró demasiado en responder al consultar las analíticas.'
        : 'No se pudo conectar con Meta para consultar las analíticas.',
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

function unixSeconds(value: Date): number {
  return Math.floor(value.getTime() / 1000);
}

function analyticsExpression(params: {
  start: Date;
  end: Date;
  phoneNumbers?: string[];
  countryCodes?: string[];
}): string {
  let expression = `analytics.start(${unixSeconds(params.start)}).end(${unixSeconds(params.end)}).granularity(DAY)`;
  if (params.phoneNumbers?.length) {
    expression += `.phone_numbers(${JSON.stringify(params.phoneNumbers)})`;
  }
  if (params.countryCodes?.length) {
    expression += `.country_codes(${JSON.stringify(params.countryCodes)})`;
  }
  return expression;
}

function conversationExpression(params: {
  start: Date;
  end: Date;
  directions?: string[];
  dimensions?: string[];
}): string {
  let expression = `conversation_analytics.start(${unixSeconds(params.start)}).end(${unixSeconds(params.end)}).granularity(MONTHLY)`;
  if (params.directions?.length) {
    expression += `.conversation_directions(${JSON.stringify(params.directions)})`;
  }
  if (params.dimensions?.length) {
    expression += `.dimensions(${JSON.stringify(params.dimensions)})`;
  }
  return expression;
}

export function getWabaOfficialStatus(): Promise<MetaAnalyticsEnvelope> {
  return graphGet(String(config.WHATSAPP_BUSINESS_ACCOUNT_ID), {
    fields: [
      'id',
      'name',
      'timezone_id',
      'account_review_status',
      'currency',
      'primary_funding_id',
      'purchase_order_number',
      'message_template_namespace'
    ].join(',')
  });
}

export function getOfficialMessageAnalytics(params: {
  start: Date;
  end: Date;
  phoneNumbers?: string[];
  countryCodes?: string[];
}): Promise<MetaAnalyticsEnvelope> {
  return graphGet(String(config.WHATSAPP_BUSINESS_ACCOUNT_ID), {
    fields: analyticsExpression(params)
  });
}

export function getOfficialConversationAnalytics(params: {
  start: Date;
  end: Date;
  directions?: string[];
  dimensions?: string[];
}): Promise<MetaAnalyticsEnvelope> {
  return graphGet(String(config.WHATSAPP_BUSINESS_ACCOUNT_ID), {
    fields: conversationExpression(params)
  });
}

export function getOfficialFlowMetric(params: {
  flowId: string;
  metric: FlowMetricName;
  since: string;
  until: string;
}): Promise<MetaAnalyticsEnvelope> {
  const expression = `metric.name(${params.metric}).granularity(DAY).since(${params.since}).until(${params.until})`;
  return graphGet(params.flowId, { fields: expression });
}
