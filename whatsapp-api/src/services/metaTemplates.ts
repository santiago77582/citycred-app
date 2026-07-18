import { config } from '../config.js';
import { AppError } from '../errors/AppError.js';
import type { SyncedTemplate } from '../templateRepository.js';

const MAX_TEMPLATE_PAGES = 100;
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

type MetaTemplateRecord = {
  id?: unknown;
  name?: unknown;
  language?: unknown;
  status?: unknown;
  category?: unknown;
  components?: unknown;
  rejected_reason?: unknown;
};

type MetaTemplatePage = {
  data?: MetaTemplateRecord[];
  paging?: {
    cursors?: { after?: unknown };
  };
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
};

function requireTemplateConfig(): void {
  const missing = [
    !config.META_GRAPH_VERSION && 'META_GRAPH_VERSION',
    !config.WHATSAPP_ACCESS_TOKEN && 'WHATSAPP_ACCESS_TOKEN',
    !config.WHATSAPP_BUSINESS_ACCOUNT_ID && 'WHATSAPP_BUSINESS_ACCOUNT_ID'
  ].filter(Boolean);
  if (missing.length) {
    throw new AppError(
      `Falta configuración de Meta para sincronizar plantillas: ${missing.join(', ')}.`,
      503
    );
  }
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeTemplate(record: MetaTemplateRecord): SyncedTemplate | null {
  const metaTemplateId = normalizeString(record.id);
  const name = normalizeString(record.name);
  const languageCode = normalizeString(record.language);
  const status = normalizeString(record.status);
  if (!metaTemplateId || !name || !languageCode || !status) return null;

  const rejection = normalizeString(record.rejected_reason);
  return {
    metaTemplateId,
    name,
    languageCode,
    category: normalizeString(record.category),
    status: status.toUpperCase(),
    components: Array.isArray(record.components) ? record.components : [],
    rejectionReason: rejection
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTemplatePage(url: URL): Promise<MetaTemplatePage> {
  const maxRetries = config.META_MAX_RETRIES;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.META_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` },
        redirect: 'error',
        signal: controller.signal
      });
      let data: MetaTemplatePage;
      try {
        data = await response.json() as MetaTemplatePage;
      } catch {
        throw new AppError(`Meta respondió HTTP ${response.status} sin JSON válido.`, 502, {
          httpStatus: response.status,
          transient: TRANSIENT_STATUSES.has(response.status)
        });
      }
      if (response.ok) return data;

      const transient = TRANSIENT_STATUSES.has(response.status);
      if (transient && attempt < maxRetries) {
        await sleep(Math.min(config.META_RETRY_BASE_MS * 2 ** attempt, 5_000));
        continue;
      }
      throw new AppError(data.error?.message ?? `Meta respondió HTTP ${response.status}.`, 502, {
        metaCode: data.error?.code,
        metaSubcode: data.error?.error_subcode,
        httpStatus: response.status,
        transient
      });
    } catch (error) {
      if (error instanceof AppError) {
        if (error.details?.transient === true && attempt < maxRetries) {
          await sleep(Math.min(config.META_RETRY_BASE_MS * 2 ** attempt, 5_000));
          continue;
        }
        throw error;
      }
      if (attempt < maxRetries) {
        await sleep(Math.min(config.META_RETRY_BASE_MS * 2 ** attempt, 5_000));
        continue;
      }
      throw new AppError(
        controller.signal.aborted
          ? 'Meta demoró demasiado en responder al sincronizar plantillas.'
          : 'No se pudo conectar con Meta para sincronizar plantillas.',
        controller.signal.aborted ? 504 : 502,
        { transient: true, cause: error instanceof Error ? error.name : 'unknown' }
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new AppError('No se pudo completar la sincronización de plantillas.', 502);
}

export async function fetchAllMetaTemplates(): Promise<SyncedTemplate[]> {
  requireTemplateConfig();
  const baseUrl = new URL(
    `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${config.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`
  );
  baseUrl.searchParams.set(
    'fields',
    'id,name,language,status,category,components,rejected_reason'
  );
  baseUrl.searchParams.set('limit', '100');

  const templates: SyncedTemplate[] = [];
  const seenKeys = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < MAX_TEMPLATE_PAGES; page += 1) {
    const url = new URL(baseUrl);
    if (after) url.searchParams.set('after', after);
    const response = await fetchTemplatePage(url);
    for (const record of response.data ?? []) {
      const template = normalizeTemplate(record);
      if (!template) continue;
      const key = `${template.name}\u0000${template.languageCode}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      templates.push(template);
    }

    const nextAfter = normalizeString(response.paging?.cursors?.after);
    if (!nextAfter || nextAfter === after || (response.data?.length ?? 0) === 0) {
      return templates;
    }
    after = nextAfter;
  }

  throw new AppError(
    `Meta devolvió más de ${MAX_TEMPLATE_PAGES} páginas de plantillas; se canceló para evitar un ciclo infinito.`,
    502
  );
}
