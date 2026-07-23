import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const optionalSecret = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional()
);

const optionalAdminPassword = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(12, 'ADMIN_PASSWORD debe tener al menos 12 caracteres').optional()
);

const httpUrl = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'La URL debe usar http o https');

const postgresUrl = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'postgres:' || protocol === 'postgresql:';
}, 'La URL debe usar postgres o postgresql');

const optionalPostgresUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  postgresUrl.optional()
);

const corsOrigins = z.preprocess(
  (value) => {
    if (typeof value !== 'string' || value.trim() === '') return [];
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  },
  z.array(httpUrl)
);

const booleanFlag = z.preprocess(
  (value) => typeof value === 'string' ? value.trim().toLowerCase() : value,
  z.enum(['true', 'false', '1', '0']).default('false')
).transform((value) => value === 'true' || value === '1');

const timeZone = z.string().min(1).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, 'Zona horaria IANA inválida');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    httpUrl.optional()
  ),
  CORS_ORIGINS: corsOrigins,
  API_KEY: z.string().min(16, 'API_KEY debe tener al menos 16 caracteres (recomendado: 32 o más)'),
  ADMIN_PASSWORD: optionalAdminPassword,
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  DATABASE_SSL: z
    .preprocess(
      (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
      z.enum(['true', 'false', '1', '0']).default('false')
    )
    .transform((value) => value === 'true' || value === '1'),
  META_GRAPH_VERSION: optionalSecret,
  META_APP_SECRET: optionalSecret,
  WHATSAPP_ACCESS_TOKEN: optionalSecret,
  WHATSAPP_PHONE_NUMBER_ID: optionalSecret,
  WHATSAPP_BUSINESS_ACCOUNT_ID: optionalSecret,
  WHATSAPP_VERIFY_TOKEN: optionalSecret,
  META_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  META_MEDIA_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(120_000),
  META_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
  META_RETRY_BASE_MS: z.coerce.number().int().min(50).max(5_000).default(250),
  CAMPAIGN_EXECUTION_ENABLED: booleanFlag,
  CAMPAIGN_MAX_RECIPIENTS: z.coerce.number().int().min(1).max(1_000).default(250),
  CAMPAIGN_PREVIEW_TTL_MINUTES: z.coerce.number().int().min(5).max(1_440).default(60),
  CAMPAIGN_TIME_ZONE: timeZone.default('America/Argentina/Buenos_Aires'),
  CAMPAIGN_SEND_WINDOW_START_HOUR: z.coerce.number().int().min(0).max(22).default(9),
  CAMPAIGN_SEND_WINDOW_END_HOUR: z.coerce.number().int().min(1).max(23).default(18),
  // Inteligencia artificial (OpenAI). APAGADA por defecto: aunque la clave esté
  // cargada, la IA no se usa hasta encender AI_ENABLED explícitamente.
  OPENAI_API_KEY: optionalSecret,
  AI_ENABLED: booleanFlag,
  AI_TEXT_MODEL: z.string().min(1).default('gpt-4o-mini'),
  AI_TRANSCRIBE_MODEL: z.string().min(1).default('gpt-4o-mini-transcribe'),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(20_000),
  // Cuánto se frena el bot en una conversación después de que responde un
  // humano (desde el panel o desde el celular). Regla de Santiago: cada vez
  // que él habla, el bot se tiene que frenar. Por defecto, un día entero.
  BOT_PAUSE_AFTER_HUMAN_MINUTES: z.coerce.number().int().min(1).max(10_080).default(1_440),
  OPERATIONS_SCHEDULER_ENABLED: booleanFlag,
  OPERATIONS_CHECK_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1_440).default(15),
  BACKUP_SCHEDULER_ENABLED: booleanFlag,
  BACKUP_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  BACKUP_INITIAL_DELAY_MINUTES: z.coerce.number().int().min(0).max(120).default(5),
  BACKUP_RETENTION_COUNT: z.coerce.number().int().min(1).max(365).default(14),
  BACKUP_COMMAND_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(120).default(30),
  BACKUP_DIRECTORY: z.string().min(1).default('/app/data/backups').refine(
    (value) => path.isAbsolute(value),
    'BACKUP_DIRECTORY debe ser una ruta absoluta'
  ),
  BACKUP_RESTORE_TEST_ENABLED: booleanFlag,
  BACKUP_RESTORE_TEST_DATABASE_URL: optionalPostgresUrl
}).superRefine((value, context) => {
  if (value.CAMPAIGN_SEND_WINDOW_END_HOUR <= value.CAMPAIGN_SEND_WINDOW_START_HOUR) {
    context.addIssue({
      code: 'custom',
      path: ['CAMPAIGN_SEND_WINDOW_END_HOUR'],
      message: 'Debe ser mayor que CAMPAIGN_SEND_WINDOW_START_HOUR'
    });
  }
  if (value.BACKUP_RESTORE_TEST_ENABLED && !value.BACKUP_RESTORE_TEST_DATABASE_URL) {
    context.addIssue({
      code: 'custom',
      path: ['BACKUP_RESTORE_TEST_DATABASE_URL'],
      message: 'Es obligatoria cuando BACKUP_RESTORE_TEST_ENABLED=true'
    });
  }
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detalles = parsed.error.issues
    .map((issue) => `- ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
    .join('\n');
  console.error(`Configuración inválida:\n${detalles}`);
  process.exit(1);
}

export const config = parsed.data;

export function adminPassword(): string {
  return config.ADMIN_PASSWORD ?? config.API_KEY;
}

export function isMetaSendingConfigured(): boolean {
  return Boolean(
    config.META_GRAPH_VERSION && config.WHATSAPP_ACCESS_TOKEN && config.WHATSAPP_PHONE_NUMBER_ID
  );
}

export function isMetaWebhookConfigured(): boolean {
  return Boolean(config.META_APP_SECRET && config.WHATSAPP_VERIFY_TOKEN);
}

/**
 * La IA se usa SOLO si está encendida Y hay clave. Sin las dos cosas, el módulo
 * queda inerte y el bot sigue funcionando con sus reglas de siempre.
 */
export function isAiEnabled(): boolean {
  return Boolean(config.AI_ENABLED && config.OPENAI_API_KEY);
}

export function aiConfigStatus(): Record<string, boolean> {
  return {
    AI_ENABLED: config.AI_ENABLED,
    OPENAI_API_KEY: Boolean(config.OPENAI_API_KEY)
  };
}

export function metaConfigStatus(): Record<string, boolean> {
  return {
    META_GRAPH_VERSION: Boolean(config.META_GRAPH_VERSION),
    META_APP_SECRET: Boolean(config.META_APP_SECRET),
    WHATSAPP_ACCESS_TOKEN: Boolean(config.WHATSAPP_ACCESS_TOKEN),
    WHATSAPP_PHONE_NUMBER_ID: Boolean(config.WHATSAPP_PHONE_NUMBER_ID),
    WHATSAPP_BUSINESS_ACCOUNT_ID: Boolean(config.WHATSAPP_BUSINESS_ACCOUNT_ID),
    WHATSAPP_VERIFY_TOKEN: Boolean(config.WHATSAPP_VERIFY_TOKEN)
  };
}
