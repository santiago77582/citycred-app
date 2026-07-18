import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('las rutas CRM no atribuyen acciones a un UUID declarado por el cliente', () => {
  for (const file of ['routes/crmContacts.ts', 'routes/crmSettings.ts']) {
    const source = readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /x-actor-user-id/i);
    assert.doesNotMatch(source, /actorSchema/);
  }
});
