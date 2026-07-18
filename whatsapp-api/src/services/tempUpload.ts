import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppError } from '../errors/AppError.js';

export type PrivateTempUpload = {
  path: string;
  sizeBytes: number;
};

export async function savePrivateTempUpload(
  source: Readable,
  maxBytes: number
): Promise<PrivateTempUpload> {
  const path = join(tmpdir(), `citycred-upload-${randomUUID()}`);
  const destination = createWriteStream(path, { flags: 'wx', mode: 0o600 });
  let sizeBytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sizeBytes += chunk.length;
      if (sizeBytes > maxBytes) {
        callback(new AppError('El archivo supera el tamaño máximo permitido.', 413));
        return;
      }
      callback(null, chunk);
    }
  });

  try {
    await pipeline(source, limiter, destination);
    if (sizeBytes === 0) {
      throw new AppError('El archivo está vacío.', 400);
    }
    return { path, sizeBytes };
  } catch (error) {
    await unlink(path).catch(() => undefined);
    throw error;
  }
}

export async function removePrivateTempUpload(path: string): Promise<void> {
  await unlink(path).catch(() => undefined);
}
