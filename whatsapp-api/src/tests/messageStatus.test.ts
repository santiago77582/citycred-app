import test from 'node:test';
import assert from 'node:assert/strict';

process.env.API_KEY = 'clave-de-prueba-con-mas-de-32-caracteres';
process.env.DATABASE_URL = 'postgresql://usuario:clave@localhost:5432/prueba';

const { canTransitionOutboundStatus } = await import('../repository.js');

test('los estados salientes avanzan de forma monotónica', () => {
  assert.equal(canTransitionOutboundStatus('UNKNOWN', 'PENDING'), true);
  assert.equal(canTransitionOutboundStatus('PENDING', 'SENT'), true);
  assert.equal(canTransitionOutboundStatus('SENT', 'DELIVERED'), true);
  assert.equal(canTransitionOutboundStatus('DELIVERED', 'READ'), true);

  assert.equal(canTransitionOutboundStatus('READ', 'DELIVERED'), false);
  assert.equal(canTransitionOutboundStatus('DELIVERED', 'SENT'), false);
  assert.equal(canTransitionOutboundStatus('SENT', 'PENDING'), false);
});

test('FAILED es terminal y no puede revivir con webhooks tardíos', () => {
  assert.equal(canTransitionOutboundStatus('FAILED', 'SENT'), false);
  assert.equal(canTransitionOutboundStatus('FAILED', 'DELIVERED'), false);
  assert.equal(canTransitionOutboundStatus('FAILED', 'READ'), false);
});

test('Meta puede marcar FAILED desde cualquier estado saliente', () => {
  for (const current of ['UNKNOWN', 'PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'] as const) {
    assert.equal(canTransitionOutboundStatus(current, 'FAILED'), true, `desde ${current}`);
  }
});

test('los estados entrantes no participan de la progresión saliente', () => {
  assert.equal(canTransitionOutboundStatus('RECEIVED', 'READ'), false);
  assert.equal(canTransitionOutboundStatus('PENDING', 'RECEIVED'), false);
});
