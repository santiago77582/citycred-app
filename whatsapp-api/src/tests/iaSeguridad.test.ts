import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';

/**
 * Seguridad de la IA: apagada por defecto, las reglas mandan sobre la IA, y si
 * la IA falla NUNCA se rompe el chat.
 */

// La IA arranca APAGADA aunque haya clave: hace falta AI_ENABLED.
applyTestEnv({ OPENAI_API_KEY: 'sk-clave-de-prueba-no-real' });

const { isAiEnabled } = await import('../config.js');
const { clasificarMensaje } = await import('../ai/clasificarActividad.js');
const { enriquecerEntrada } = await import('../ai/enriquecerEntrada.js');

test('la IA queda apagada aunque la clave esté cargada, sin AI_ENABLED', () => {
  assert.equal(isAiEnabled(), false);
});

test('con la IA apagada, la clasificación se resuelve solo con las reglas', async () => {
  // Una actividad no admitida se detecta por reglas, sin llamar a la IA.
  const descartado = await clasificarMensaje('soy de la policia de rio negro');
  assert.equal(descartado.origen, 'REGLAS');
  assert.equal(descartado.actividadNoAdmitida, 'Policía de Río Negro');

  // Un texto que las reglas no clasifican: con IA apagada no se inventa nada.
  const ambiguo = await clasificarMensaje('hola, quiero info');
  assert.equal(ambiguo.origen, 'NINGUNO');
  assert.equal(ambiguo.fallaIa, 'DISABLED');
  assert.equal(ambiguo.fuerza, null);
});

test('las reglas SIEMPRE ganan: aunque la IA dijera otra cosa, no se la consulta', async () => {
  // "soy de la fuerza aerea" lo descartan las reglas antes de tocar la IA.
  const r = await clasificarMensaje('soy de la fuerza aerea');
  assert.equal(r.origen, 'REGLAS');
  assert.equal(r.actividadNoAdmitida, 'Fuerza Aérea');
});

test('un audio con la IA apagada no se transcribe: se usa el texto de siempre', async () => {
  const entrada = await enriquecerEntrada({
    type: 'audio',
    audio: { id: 'media-1', mime_type: 'audio/ogg', voice: true }
  });
  assert.match(String(entrada.text), /\[audio\]/i);
  assert.equal(entrada.transcripcion, undefined);
});

test('un mensaje de texto pasa igual, sin tocar la IA', async () => {
  const entrada = await enriquecerEntrada({ type: 'text', text: { body: 'Soy de prefectura' } });
  assert.equal(entrada.text, 'Soy de prefectura');
});
