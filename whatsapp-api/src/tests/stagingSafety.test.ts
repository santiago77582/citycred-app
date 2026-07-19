import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readRepositoryFile(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function assertDisabledFlag(blueprint: string, key: string): void {
  assert.match(
    blueprint,
    new RegExp(`- key: ${key}\\n\\s+value: ['\"]?false['\"]?`),
    `${key} debe quedar explícitamente apagado`
  );
}

test('los dos Blueprints de staging nacen aislados y sin autodeploy', () => {
  for (const relativePath of ['render.yaml', 'whatsapp-api/render.yaml']) {
    const blueprint = readRepositoryFile(relativePath);
    assert.match(blueprint, /staging/i);
    assert.match(blueprint, /autoDeploy: false/);
    assert.doesNotMatch(blueprint, /- key: (?:META_|WHATSAPP_)/);
    for (const key of [
      'FLOW_ENDPOINT_ENABLED',
      'CAMPAIGN_EXECUTION_ENABLED',
      'OPERATIONS_SCHEDULER_ENABLED',
      'BACKUP_SCHEDULER_ENABLED',
      'BACKUP_RESTORE_TEST_ENABLED'
    ]) {
      assertDisabledFlag(blueprint, key);
    }
  }
});

test('el smoke remoto es manual y comprueba todos los bloqueos', () => {
  const workflow = readRepositoryFile('.github/workflows/staging-smoke.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request|schedule):/m);
  assert.match(workflow, /health\.safety\?\.safeMode !== true/);
  assert.match(workflow, /postWebhook\.status !== 503/);
  assert.match(workflow, /flowPost\.status !== 503/);
  assert.match(workflow, /privateResponse\.status !== 401/);
});

test('CI construye y prueba el contenedor sin publicarlo', () => {
  const workflow = readRepositoryFile('.github/workflows/whatsapp-api.yml');
  assert.match(workflow, /container-smoke:/);
  assert.match(workflow, /docker build --tag citycred-whatsapp-api:ci whatsapp-api/);
  assert.match(workflow, /health\.safety\?\.safeMode !== true/);
  assert.doesNotMatch(workflow, /docker (?:push|login)/);
});
