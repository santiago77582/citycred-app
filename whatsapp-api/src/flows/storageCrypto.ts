import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { FlowEndpointError } from './flowCrypto.js';

export type StoredFlowCipher = {
  encryptedData: string;
  iv: string;
  tag: string;
};

type StoredBase64 = string | Buffer;

function base64Text(value: StoredBase64): string {
  return Buffer.isBuffer(value) ? value.toString('utf8') : value;
}

function canonicalBase64(
  value: StoredBase64,
  label: string,
  expectedBytes?: number
): Buffer {
  const text = base64Text(value);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) {
    throw new FlowEndpointError(500, `${label} no contiene base64 válido.`);
  }
  const bytes = Buffer.from(text, 'base64');
  if (expectedBytes !== undefined && bytes.length !== expectedBytes) {
    throw new FlowEndpointError(500, `${label} tiene un tamaño inválido.`);
  }
  if (bytes.toString('base64').replace(/=+$/, '') !== text.replace(/=+$/, '')) {
    throw new FlowEndpointError(500, `${label} no contiene base64 canónico.`);
  }
  return bytes;
}

function storageBytes(material: string): Buffer {
  return canonicalBase64(material, 'La configuración de almacenamiento', 32);
}

export function encryptStoredFlowData(
  data: Record<string, unknown>,
  material: string
): StoredFlowCipher {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', storageBytes(material), iv);
  const encryptedData = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final()
  ]);
  return {
    encryptedData: encryptedData.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}

export function decryptStoredFlowData(params: {
  encryptedData: StoredBase64 | null;
  iv: StoredBase64 | null;
  tag: StoredBase64 | null;
  material: string;
}): Record<string, unknown> {
  if (!params.encryptedData || !params.iv || !params.tag) return {};
  try {
    const encryptedData = canonicalBase64(params.encryptedData, 'Los datos protegidos');
    const iv = canonicalBase64(params.iv, 'El vector de almacenamiento', 12);
    const tag = canonicalBase64(params.tag, 'La etiqueta de autenticación', 16);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      storageBytes(params.material),
      iv
    );
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]).toString('utf8');
    const parsed = JSON.parse(plaintext) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch (error) {
    if (error instanceof FlowEndpointError) throw error;
    throw new FlowEndpointError(500, 'No se pudieron leer los datos protegidos del Flow.');
  }
}
