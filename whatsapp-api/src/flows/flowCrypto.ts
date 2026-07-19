import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPrivateKey,
  privateDecrypt,
  timingSafeEqual
} from 'node:crypto';
import { z } from 'zod';

const MAX_ENCRYPTED_DATA_BYTES = 1024 * 1024;
const AUTH_TAG_BYTES = 16;

export class FlowEndpointError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'FlowEndpointError';
  }
}

export const encryptedFlowEnvelopeSchema = z.object({
  encrypted_aes_key: z.string().min(1).max(4096),
  encrypted_flow_data: z.string().min(1).max(1_500_000),
  initial_vector: z.string().min(1).max(128)
}).strict();

export type EncryptedFlowEnvelope = z.infer<typeof encryptedFlowEnvelopeSchema>;

function decodeBase64(name: string, value: string, maxBytes: number): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new FlowEndpointError(400, `${name} no contiene base64 válido.`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 0 || decoded.length > maxBytes) {
    throw new FlowEndpointError(400, `${name} tiene un tamaño inválido.`);
  }
  const normalizedInput = value.replace(/=+$/, '');
  const normalizedOutput = decoded.toString('base64').replace(/=+$/, '');
  if (normalizedInput !== normalizedOutput) {
    throw new FlowEndpointError(400, `${name} no contiene base64 canónico.`);
  }
  return decoded;
}

export function isFlowSignatureValid(params: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  secret: string;
}): boolean {
  const match = /^sha256=([a-f0-9]{64})$/i.exec(params.signatureHeader ?? '');
  if (!match?.[1]) return false;
  const supplied = Buffer.from(match[1], 'hex');
  const expected = createHmac('sha256', params.secret).update(params.rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function decryptFlowRequest(params: {
  envelope: EncryptedFlowEnvelope;
  pem: string;
  passphrase?: string;
}): {
  body: Record<string, unknown>;
  aesMaterial: Buffer;
  initialVector: Buffer;
} {
  const encryptedMaterial = decodeBase64(
    'encrypted_aes_key',
    params.envelope.encrypted_aes_key,
    1024
  );
  let aesMaterial: Buffer;
  try {
    const decryptionMaterial = createPrivateKey({
      key: params.pem,
      ...(params.passphrase ? { passphrase: params.passphrase } : {})
    });
    aesMaterial = privateDecrypt(
      {
        key: decryptionMaterial,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      encryptedMaterial
    );
  } catch {
    throw new FlowEndpointError(
      421,
      'No se pudo descifrar la solicitud. Verificá el material configurado para el Flow.'
    );
  }

  if (aesMaterial.length !== 16) {
    throw new FlowEndpointError(400, 'El material AES recibido debe tener 16 bytes.');
  }
  const encryptedFlowData = decodeBase64(
    'encrypted_flow_data',
    params.envelope.encrypted_flow_data,
    MAX_ENCRYPTED_DATA_BYTES
  );
  if (encryptedFlowData.length <= AUTH_TAG_BYTES) {
    throw new FlowEndpointError(400, 'Los datos cifrados del Flow están incompletos.');
  }
  const initialVector = decodeBase64('initial_vector', params.envelope.initial_vector, 32);
  if (initialVector.length !== 12) {
    throw new FlowEndpointError(400, 'El vector inicial debe tener 12 bytes.');
  }

  const encryptedBody = encryptedFlowData.subarray(0, -AUTH_TAG_BYTES);
  const authTag = encryptedFlowData.subarray(-AUTH_TAG_BYTES);
  let plaintext: string;
  try {
    const decipher = createDecipheriv('aes-128-gcm', aesMaterial, initialVector);
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([
      decipher.update(encryptedBody),
      decipher.final()
    ]).toString('utf8');
  } catch {
    throw new FlowEndpointError(400, 'No se pudo autenticar el contenido cifrado del Flow.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new FlowEndpointError(400, 'El contenido descifrado no contiene JSON válido.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FlowEndpointError(400, 'El contenido descifrado debe ser un objeto JSON.');
  }
  return {
    body: parsed as Record<string, unknown>,
    aesMaterial,
    initialVector
  };
}

export function encryptFlowResponse(params: {
  response: Record<string, unknown>;
  aesMaterial: Buffer;
  initialVector: Buffer;
}): string {
  const invertedVector = Buffer.from(
    params.initialVector.map((value) => value ^ 0xff)
  );
  const cipher = createCipheriv('aes-128-gcm', params.aesMaterial, invertedVector);
  return Buffer.concat([
    cipher.update(JSON.stringify(params.response), 'utf8'),
    cipher.final(),
    cipher.getAuthTag()
  ]).toString('base64');
}
