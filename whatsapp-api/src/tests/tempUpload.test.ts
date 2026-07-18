import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
  removePrivateTempUpload,
  savePrivateTempUpload
} from '../services/tempUpload.js';

test('guarda la carga en un archivo temporal y permite eliminarla', async () => {
  const upload = await savePrivateTempUpload(
    Readable.from([Buffer.from('archivo-de-prueba')]),
    1_000
  );
  try {
    assert.equal(upload.sizeBytes, Buffer.byteLength('archivo-de-prueba'));
    const info = await stat(upload.path);
    assert.equal(info.isFile(), true);
  } finally {
    await removePrivateTempUpload(upload.path);
  }
  await assert.rejects(() => stat(upload.path));
});

test('elimina el archivo temporal cuando la carga supera el límite', async () => {
  await assert.rejects(
    () => savePrivateTempUpload(
      Readable.from([Buffer.alloc(6), Buffer.alloc(6)]),
      10
    ),
    /supera el tamaño máximo/i
  );
});

test('rechaza archivos vacíos', async () => {
  await assert.rejects(
    () => savePrivateTempUpload(Readable.from([]), 100),
    /está vacío/i
  );
});
