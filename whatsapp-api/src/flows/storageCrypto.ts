import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { FlowEndpointError } from './flowCrypto.js';

function storageBytes(material: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(material) || material.length % 4 !== 0) {
    throw new FlowEndpointError(503, 'La configuración de almacenamiento del Flow no es válida.');
  }
  const bytes = Buffer.from(material, 'base64');
  if (bytes.length !== 32) {
    throw new FlowEndpointError(503, 'La configuración de almacenamiento del Flow debe tener 32 bytes.');
  }
  return bytes;
}

export function encryptStoredFlowData(
  data: Record<string, unknown>,
  material: string
): { encryptedData: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', storageBytes(material), iv);
  const encryptedData = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final()
  ]);
  return { encryptedData, iv, tag: cipher.getAuthTag() };
}

export function decryptStoredFlowData(params: {
  encryptedData: Buffer | null;
  iv: Buffer | null;
  tag: Buffer | null;
  material: string;
}): Record<string, unknown> {
  if (!params.encryptedData || !params.iv || !params.tag) return {};
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      storageBytes(params.material),
      params.iv
    );
    decipher.setAuthTag(params.tag);
    const plaintext = Buffer.concat([
      decipher.update(params.encryptedData),
      decipher.final()
    ]).toString('utf8');
    const parsed = JSON.parse(plaintext) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    throw new FlowEndpointError(500, 'No se pudieron leer los datos protegidos del Flow.');
  }
}
