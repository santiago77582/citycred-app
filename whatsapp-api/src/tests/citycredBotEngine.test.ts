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

test('no vuelve a preguntar datos ya guardados', () => {
  const decision = decideCitycredBot(state({
    stage: 'WAIT_QUOTA',
    entity: 'Ejército',
    personnelType: 'CAREER',
    seniorityRange: 'ONE_YEAR_OR_MORE'
  }), { text: '$85.000' });
  assert.equal(decision.nextStage, 'WAIT_IDENTITY');
  assert.equal(decision.patch.availableQuota, 85000);
  assert.match(decision.response?.body ?? '', /nombre y apellido y DNI/);
});

test('un DNI posterior se guarda sin reemplazar el cupo ya registrado', () => {
  const decision = decideCitycredBot(state({
    stage: 'WAIT_IDENTITY',
    entity: 'Ejército',
    personnelType: 'CAREER',
    seniorityRange: 'ONE_YEAR_OR_MORE',
    availableQuota: 85000,
    profileName: 'Juan Pérez'
  }), { text: 'DNI 30751003' });
  assert.equal(decision.nextStage, 'WAIT_DOCUMENTS');
  assert.equal(decision.patch.availableQuota, undefined);
  assert.equal(decision.patch.documentNumber, '30751003');
  assert.match(decision.response?.body ?? '', /último recibo/);
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

test('etiqueta un archivo pendiente con el mensaje siguiente', () => {
  const first = decideCitycredBot(state({
    stage: 'WAIT_DOCUMENTS',
    entity: 'Ejército',
    personnelType: 'CAREER',
    seniorityRange: 'ONE_YEAR_OR_MORE',
    availableQuota: 90000,
    profileName: 'Juan Pérez',
    documentNumber: '30751003'
  }), { text: null, messageType: 'image', hasMedia: true });
  assert.equal(first.reason, 'unlabeled_document');

  const second = decideCitycredBot(state({
    stage: 'WAIT_DOCUMENTS',
    entity: 'Ejército',
    personnelType: 'CAREER',
    seniorityRange: 'ONE_YEAR_OR_MORE',
    availableQuota: 90000,
    profileName: 'Juan Pérez',
    documentNumber: '30751003',
    context: first.patch.context ?? {}
  }), { text: 'es el recibo' });
  const documents = second.patch.context?.documents as Record<string, boolean>;
  assert.equal(documents.PAYSLIP, true);
});

test('el comprobante de cupo no reemplaza la documentación', () => {
  const decision = decideCitycredBot(state({
    stage: 'WAIT_DOCUMENTS',
    entity: 'Armada',
    personnelType: 'CAREER',
    seniorityRange: 'ONE_YEAR_OR_MORE',
    availableQuota: 100000,
    profileName: 'Ana Gómez',
    documentNumber: '30111222'
  }), { text: 'comprobante de cupo', hasMedia: true });
  assert.equal(decision.nextStage, 'WAIT_DOCUMENTS');
  assert.equal(decision.reason, 'missing_documents');
  const documents = decision.patch.context?.documents as Record<string, boolean>;
  assert.equal(documents.QUOTA_PROOF, true);
  assert.equal(documents.PAYSLIP, undefined);
});

test('documentación completa y correo derivan sin prometer aprobación', () => {
  const decision = decideCitycredBot(state({
    stage: 'WAIT_DOCUMENTS',
    entity: 'Ejército',
    personnelType: 'CAREER',
    seniorityRange: 'ONE_YEAR_OR_MORE',
    availableQuota: 120000,
    profileName: 'Juan Pérez',
    documentNumber: '30751003',
    context: {
      documents: {
        PAYSLIP: true,
        DNI_FRONT: true,
        DNI_BACK: true,
        CBU: true
      }
    }
  }), { text: 'mi correo es juan@example.com' });
  assert.equal(decision.nextStage, 'HANDOFF');
  assert.equal(decision.patch.handoffReason, 'DOCUMENTATION_COMPLETE');
  assert.match(decision.response?.body ?? '', /no significa aprobación/i);
});

test('la baja tiene prioridad y cancela futuros seguimientos', () => {
  const decision = decideCitycredBot(state({ stage: 'WAIT_QUOTA' }), {
    text: 'no me escriban más, baja'
  });
  assert.equal(decision.nextStage, 'CLOSED');
  assert.equal(decision.patch.commercialStatus, 'DO_NOT_CONTACT');
  assert.equal(decision.scheduleFollowups, false);
});
