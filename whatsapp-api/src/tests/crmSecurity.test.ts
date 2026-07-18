import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from '../security/passwords.js';

test('las contraseñas de usuarios se guardan con scrypt y salt', () => {
  const password = 'Clave-de-prueba-2026';
  const first = hashPassword(password);
  const second = hashPassword(password);

  assert.notEqual(first, password);
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$/);
  assert.equal(verifyPassword(password, first), true);
  assert.equal(verifyPassword('otra-clave', first), false);
});

test('rechaza hashes incompletos o de otro algoritmo', () => {
  assert.equal(verifyPassword('clave', ''), false);
  assert.equal(verifyPassword('clave', 'sha256$sal$dato'), false);
  assert.equal(verifyPassword('clave', 'scrypt$sal$00'), false);
});
