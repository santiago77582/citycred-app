import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const {
  applyCompletedFlowToContact,
  completeFlowToken,
  registerFlowToken
} = await import('../flows/flowEndpointRepository.js');
const { saveFlowSessionSafely } = await import('../flows/flowSessionRepository.js');
const { upsertContact, upsertConversation } = await import('../repository.js');

const storageMaterial = randomBytes(32).toString('base64');

test.afterEach(() => base.reiniciar());

test('actualiza una sesión existente y completa la ficha', async () => {
  const waId = '5492917000001';
  const contact = await upsertContact(waId, 'Cliente Flow');
  await upsertConversation(contact.id);
  const token = await registerFlowToken({
    token: 'token-repository-flow-123456',
    flowId: 'flow-repository-1',
    waId
  });

  await saveFlowSessionSafely({
    token,
    screen: 'INICIO',
    data: { source: 'whatsapp' },
    storageMaterial
  });
  const merged = await saveFlowSessionSafely({
    token,
    screen: 'SUCCESS',
    data: {
      complete: true,
      profile_name: 'María Pérez',
      dni: '30111222',
      entity: 'Ejército',
      seniority: 'ONE_YEAR_OR_MORE',
      cupo: '95000'
    },
    storageMaterial,
    complete: true
  });
  await completeFlowToken(token);
  await applyCompletedFlowToContact({ token, data: merged });

  const session = await base.consultar(
    `SELECT completed FROM whatsapp_flow_sessions WHERE token_id = $1`,
    [token.id]
  );
  assert.equal(session.rows[0]?.completed, true);
  const updated = await base.consultar(
    `SELECT profile_name, available_quota, commercial_status
     FROM contacts WHERE wa_id = $1`,
    [waId]
  );
  assert.equal(updated.rows[0]?.profile_name, 'María Pérez');
  assert.equal(Number(updated.rows[0]?.available_quota), 95000);
  assert.equal(updated.rows[0]?.commercial_status, 'UNDER_REVIEW');
});
