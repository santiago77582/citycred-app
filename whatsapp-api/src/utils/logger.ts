import pino from 'pino';
import { config } from '../config.js';

const SENSITIVE_QUERY_PARAMETERS = new Set([
  'hub.verify_token',
  'access_token',
  'token',
  'api_key',
  'apikey'
]);

export function sanitizeRequestUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    let changed = false;

    for (const [key] of parsed.searchParams) {
      if (SENSITIVE_QUERY_PARAMETERS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, 'OCULTO');
        changed = true;
      }
    }

    if (!changed) return rawUrl;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return rawUrl.replace(
      /([?&](?:hub\.verify_token|access_token|token|api_key|apikey)=)[^&#]*/gi,
      '$1OCULTO'
    );
  }
}

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.x-api-key',
      'req.headers.cookie',
      'req.headers.x-hub-signature-256',
      'res.headers.set-cookie',
      '*.access_token',
      '*.token',
      '*.password',
      '*.apiKey',
      '*.appSecret'
    ],
    censor: '[OCULTO]'
  }
});
