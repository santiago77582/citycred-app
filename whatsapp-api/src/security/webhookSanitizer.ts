import { looksLikeCredentialSharing, redactCredentialValues } from './sensitiveCredentials.js';

function clean(value: unknown): unknown {
  if (typeof value === 'string') {
    return looksLikeCredentialSharing(value) ? redactCredentialValues(value) : value;
  }
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return Object.fromEntries(entries.map(([key, nested]) => [key, clean(nested)]));
  }
  return value;
}

export function sanitizeWebhookPayload<T>(payload: T): T {
  return clean(payload) as T;
}

export function sanitizeInboundMessage(message: Record<string, unknown>) {
  const text = message.text as { body?: unknown } | undefined;
  const body = typeof text?.body === 'string' ? text.body : '';
  return {
    message: clean(message) as Record<string, unknown>,
    blocked: body !== '' && looksLikeCredentialSharing(body)
  };
}
