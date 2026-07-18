import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FORCE_CONFIG,
  forceConfig,
  isSituationAllowed,
  normalizeForce,
  requiresSeniority
} from '../domain/forces.js';
import {
  CREDENTIAL_SAFETY_REPLY,
  looksLikeCredentialSharing,
  protectInboundText,
  redactCredentialValues
} from '../security/sensitiveCredentials.js';

test('normaliza nombres y conserva la fuente única por fuerza', () => {
  assert.equal(normalizeForce('Ejército Argentino'), 'EJERCITO');
  assert.equal(normalizeForce('gendarmería nacional'), 'GENDARMERIA');
  assert.equal(normalizeForce('Prefectura Naval Argentina'), 'PREFECTURA');
  assert.equal(normalizeForce('Policía'), null);

  assert.equal(forceConfig('Ejército')?.decree, '352/2026');
  assert.equal(forceConfig('Ejército')?.quotaFieldLabel, 'Monto Cuota Mensual Disponible');
  assert.equal(forceConfig('Armada')?.quotaFieldLabel, 'Monto con otra entidad');
  assert.equal(FORCE_CONFIG.GENDARMERIA.entityCode, '400571');
  assert.equal(FORCE_CONFIG.PREFECTURA.decree, '14/12');
});

test('aplica carrera y antigüedad según la fuerza', () => {
  assert.equal(isSituationAllowed('GENDARMERIA', 'VOLUNTEER'), false);
  assert.equal(isSituationAllowed('PREFECTURA', 'VOLUNTEER'), false);
  assert.equal(isSituationAllowed('EJERCITO', 'VOLUNTEER'), true);
  assert.equal(requiresSeniority('EJERCITO', 'VOLUNTEER'), true);
  assert.equal(requiresSeniority('ARMADA', 'CAREER'), false);
});

test('detecta y redacta credenciales antes de guardar o enviar al bot', () => {
  const original = 'Mi usuario: santiago123 y contraseña: Secreta-987';
  assert.equal(looksLikeCredentialSharing(original), true);
  const safe = redactCredentialValues(original);
  assert.equal(safe.includes('santiago123'), false);
  assert.equal(safe.includes('Secreta-987'), false);
  assert.match(safe, /usuario: \[OCULTO\]/i);
  assert.match(safe, /contraseña: \[OCULTO\]/i);

  const protectedMessage = protectInboundText(original);
  assert.equal(protectedMessage.blocked, true);
  assert.equal(protectedMessage.reply, CREDENTIAL_SAFETY_REPLY);
});

test('no bloquea consultas normales sobre cómo entrar a un portal', () => {
  const text = '¿Dónde veo el monto en SIAF?';
  assert.equal(looksLikeCredentialSharing(text), false);
  assert.deepEqual(protectInboundText(text), { safeText: text, blocked: false, reply: null });
});
