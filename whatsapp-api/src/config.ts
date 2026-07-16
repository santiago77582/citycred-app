import 'dotenv/config';
import { z } from 'zod';

const optionalSecret = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional()
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.url().optional()
  ),
  API_KEY: z.string().min(16, 'API_KEY debe tener al menos 16 caracteres (recomendado: 32 o más)'),
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
  WHATSAPP_VERIFY_TOKEN: optionalSecret
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detalles = parsed.error.issues
    .map((issue) => `- ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
    .join('\n');
  // El logger depende de esta configuración, así que acá solo queda la consola.
  console.error(`Configuración inválida:\n${detalles}`);
  process.exit(1);
}

export const config = parsed.data;

export function isMetaSendingConfigured(): boolean {
  return Boolean(
    config.META_GRAPH_VERSION && config.WHATSAPP_ACCESS_TOKEN && config.WHATSAPP_PHONE_NUMBER_ID
  );
}

export function isMetaWebhookConfigured(): boolean {
  return Boolean(config.META_APP_SECRET && config.WHATSAPP_VERIFY_TOKEN);
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
