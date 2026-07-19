import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { FlowEndpointError } from './flowCrypto.js';

export type StoredFlowCipher = {
  encryptedData: string;
  iv: string;
  tag: string;
};

function canonicalBase64(value: string, label: string, expectedBytes?: number): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new FlowEndpointError(500, `${label} no contiene base64 válido.`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (expectedBytes !== undefined && bytes.length !== expectedBytes) {
    throw new FlowEndpointError(500, `${label} tiene un tamaño inválido.`);
  }
  if (bytes.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) {
    throw new FlowEndpointError(500, `${label} no contiene base64 canónico.`);
  }
  return bytes;
}

function storageBytes(material: string): Buffer {
  const bytes = canonicalBase64(material, 'La configuración de almacenamiento', 32);
  return bytes;
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
  encryptedData: string | null;
  iv: string | null;
  tag: string | null;
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
