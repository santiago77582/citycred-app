import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideCitycredBot,
  type BotContactState
} from '../bot/citycredBotEngineV2.js';

function state(patch: Partial<BotContactState> = {}): BotContactState {
  return {
    stage: 'START',
    entity: null,
    personnelType: null,
    seniorityRange: null,
    availableQuota: null,
    profileName: null,
    documentNumber: null,
    commercialStatus: 'NEW',
    context: {},
    ...patch
  };
}

test('inicia con la lista de entidades que atiende CityCred', () => {
  const decision = decideCitycredBot(state(), { text: 'hola' });
  assert.equal(decision.nextStage, 'WAIT_ENTITY');
  assert.equal(decision.response?.kind, 'list');
  if (decision.response?.kind !== 'list') return;
  // Sin "Fuerza Aérea" ni "Empleado Público RN": los retiró Santiago.
  assert.equal(decision.response.sections[0]?.rows.length, 5);
  assert.equal(decision.scheduleFollowups, true);
});

test('Ejército y Armada preguntan voluntario o carrera', () => {
  for (const interactiveId of ['entity:army', 'entity:navy']) {
    const decision = decideCitycredBot(state(), { text: null, interactiveId });
    assert.equal(decision.nextStage, 'WAIT_PERSONNEL_TYPE');
    assert.equal(decision.response?.kind, 'buttons');
  }
});

test('al registrar el cupo muestra el desplegable y NO pide datos', () => {
  const decision = decideCitycredBot(state({
    stage: 'WAIT_QUOTA',
    entity: 'Ejército',
    personnelType: 'CAREER',
    seniorityRange: 'ONE_YEAR_OR_MORE'
  }), { text: '$85.000' });
  assert.equal(decision.nextStage, 'WAIT_QUOTE_CHOICE');
  assert.equal(decision.patch.availableQuota, 85000);
  assert.equal(decision.response?.kind, 'list');
  // Regla de Santiago: no se pide ningun dato personal en este paso.
  assert.doesNotMatch(JSON.stringify(decision.response), /DNI|nombre y apellido/i);
});

test('tras autorizar el cupo se pide la documentacion, no antes', () => {
  const decision = decideCitycredBot(state({
    stage: 'WAIT_AUTHORIZATION',
    entity: 'Ejército',
    personnelType: 'CAREER',
    seniorityRange: 'ONE_YEAR_OR_MORE',
    availableQuota: 85000,
    context: { optionsShown: true, authorizationSent: true }
  }), { text: 'ya me lo autorizaron' });
  assert.equal(decision.nextStage, 'WAIT_DOCUMENTS');
  assert.match(decision.response?.body ?? '', /ya está autorizado/i);
  assert.match(decision.response?.body ?? '', /DNI de ambos lados/i);
});

test('cupo cero corta y aclara que no pedirá autorización documentos ni derivación', () => {
  const decision = decideCitycredBot(state({
    stage: 'WAIT_QUOTA',
    entity: 'Armada',
    personnelType: 'CAREER',
    seniorityRange: 'ONE_YEAR_OR_MORE'
  }), { text: 'me figura sin disponible' });
  assert.equal(decision.nextStage, 'NO_QUOTA');
  assert.equal(decision.patch.availableQuota, 0);
  assert.equal(decision.patch.handoffReason, null);
  assert.match(decision.response?.body ?? '', /No voy a pedirte autorización ni documentación/i);
  assert.doesNotMatch(decision.response?.body ?? '', /mandame.*autorización/i);
  assert.equal(decision.scheduleFollowups, false);
});

test('menos de un año pide recibo y cupo y deriva', () => {
  const decision = decideCitycredBot(state({
    stage: 'WAIT_SENIORITY',
    entity: 'Ejército',
    personnelType: 'VOLUNTEER'
  }), { text: null, interactiveId: 'seniority:less_1' });
  assert.equal(decision.nextStage, 'HANDOFF');
  assert.equal(decision.patch.handoffReason, 'SENIORITY_UNDER_ONE_YEAR');
  assert.match(decision.response?.body ?? '', /último recibo/);
  assert.match(decision.response?.body ?? '', /352\/2026/);
});

test('Gendarmería y Prefectura rechazan voluntarios sin pedir documentos', () => {
  for (const entity of ['Gendarmería', 'Prefectura']) {
    const decision = decideCitycredBot(state({
      stage: 'WAIT_PERSONNEL_TYPE',
      entity
    }), { text: 'soy voluntario' });
    assert.equal(decision.nextStage, 'OUT_OF_SCOPE');
    assert.equal(decision.patch.commercialStatus, 'REJECTED');
    assert.match(decision.response?.body ?? '', /personal de carrera/);
    assert.match(decision.response?.body ?? '', /No voy a pedirte autorización ni documentación/);
  }
});

test('un archivo recibido se acusa sin interrogar al cliente', () => {
  const decision = decideCitycredBot(state({
    stage: 'WAIT_DOCUMENTS',
    entity: 'Ejército',
    personnelType: 'CAREER',
    seniorityRange: 'ONE_YEAR_OR_MORE',
    availableQuota: 90000,
    context: { optionsShown: true, authorizationSent: true, docsRequested: true }
  }), { text: null, messageType: 'image', hasMedia: true });
  assert.equal(decision.reason, 'document_received');
  assert.match(decision.response?.body ?? '', /recibí el archivo/i);
  assert.doesNotMatch(decision.response?.body ?? '', /decime si es/i);
});

test('el comprobante de cupo se registra como documento propio', () => {
  const decision = decideCitycredBot(state({
    stage: 'WAIT_DOCUMENTS',
    entity: 'Armada',
    personnelType: 'CAREER',
    seniorityRange: 'ONE_YEAR_OR_MORE',
    availableQuota: 100000,
    context: { optionsShown: true, authorizationSent: true, docsRequested: true }
  }), { text: 'comprobante de cupo', hasMedia: true });
  const documents = decision.patch.context?.documents as Record<string, boolean>;
  assert.equal(documents.QUOTA_PROOF, true);
  assert.equal(documents.PAYSLIP, undefined);
});

test('documentacion completa cierra y deriva a un asesor', () => {
  const decision = decideCitycredBot(state({
    stage: 'WAIT_DOCUMENTS',
    entity: 'Ejército',
    personnelType: 'CAREER',
    seniorityRange: 'ONE_YEAR_OR_MORE',
    availableQuota: 120000,
    context: {
      optionsShown: true,
      authorizationSent: true,
      docsRequested: true,
      documents: { PAYSLIP: true, DNI_FRONT: true, DNI_BACK: true, CBU: true }
    }
  }), { text: 'mi correo es juan@example.com' });
  assert.equal(decision.nextStage, 'HANDOFF');
  assert.match(decision.response?.body ?? '', /asesor/i);
});

test('la baja tiene prioridad y cancela futuros seguimientos', () => {
  const decision = decideCitycredBot(state({ stage: 'WAIT_QUOTA' }), {
    text: 'no me escriban más, baja'
  });
  assert.equal(decision.nextStage, 'CLOSED');
  assert.equal(decision.patch.commercialStatus, 'DO_NOT_CONTACT');
  assert.equal(decision.scheduleFollowups, false);
});
