import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Valida el encabezado X-Hub-Signature-256 que envía Meta: HMAC SHA-256 del cuerpo
 * crudo de la solicitud, firmado con el App Secret de la aplicación.
 */
export function isValidMetaSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!rawBody || !signatureHeader) return false;

  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;

  const provided = signatureHeader.slice(prefix.length);
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const received = Buffer.from(provided, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
