import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../utils/phone.js';

test('conserva un móvil argentino internacional', () => {
  assert.equal(normalizePhone('+54 9 2920 123456'), '5492920123456');
});

test('convierte un móvil argentino nacional con 0 y 15', () => {
  assert.equal(normalizePhone('02920 15 123456'), '5492920123456');
});

test('convierte un móvil argentino nacional sin prefijos', () => {
  assert.equal(normalizePhone('2920123456'), '5492920123456');
});

test('no confunde el indicativo 291 con un prefijo local 15', () => {
  assert.equal(normalizePhone('0291 555-1111'), '5492915551111');
});

test('conserva otro número internacional válido', () => {
  assert.equal(normalizePhone('+1 415 555 2671'), '14155552671');
});
