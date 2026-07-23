import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';

// La IA ENCENDIDA para este archivo (clave + flag).
applyTestEnv({ OPENAI_API_KEY: 'sk-clave-de-prueba-no-real', AI_ENABLED: 'true' });

const { isAiEnabled } = await import('../config.js');
const { enriquecerEntrada } = await import('../ai/enriquecerEntrada.js');

const audioMsg = {
  type: 'audio',
  audio: { id: 'media-audio-1', mime_type: 'audio/ogg', voice: true }
};

test('con la IA encendida, el audio se transcribe y el bot lee lo que se dijo', async () => {
  assert.equal(isAiEnabled(), true);

  const entrada = await enriquecerEntrada(audioMsg, {
    descargarAudio: async () => ({ bytes: Buffer.from('audio-falso'), mimeType: 'audio/ogg' }),
    transcribir: async () => ({ ok: true, value: 'Hola, soy de Prefectura y estoy en carrera' })
  });

  assert.equal(entrada.text, 'Hola, soy de Prefectura y estoy en carrera');
  assert.equal(entrada.transcripcion, 'Hola, soy de Prefectura y estoy en carrera');
});

test('si la transcripción falla, se marca audio ilegible: no se inventa lo dicho', async () => {
  const entrada = await enriquecerEntrada(audioMsg, {
    descargarAudio: async () => ({ bytes: Buffer.from('x'), mimeType: 'audio/ogg' }),
    transcribir: async () => ({ ok: false, failure: 'BAD_RESPONSE' })
  });

  assert.equal(entrada.audioIlegible, true);
  assert.equal(entrada.transcripcion, undefined);
});

test('si no se puede descargar el audio, se cae al texto de siempre sin romperse', async () => {
  const entrada = await enriquecerEntrada(audioMsg, {
    descargarAudio: async () => null,
    transcribir: async () => { throw new Error('no deberia llamarse'); }
  });

  assert.match(String(entrada.text), /\[audio\]/i);
  assert.equal(entrada.audioIlegible, undefined);
});

test('si la IA se quedó sin crédito, el chat no se rompe (cae al texto de siempre)', async () => {
  const entrada = await enriquecerEntrada(audioMsg, {
    descargarAudio: async () => ({ bytes: Buffer.from('x'), mimeType: 'audio/ogg' }),
    transcribir: async () => ({ ok: false, failure: 'NO_CREDIT' })
  });
  // Falla de transcripcion -> audio ilegible -> el bot pide que lo repita.
  assert.equal(entrada.audioIlegible, true);
});
