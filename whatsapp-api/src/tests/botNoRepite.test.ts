import assert from 'node:assert/strict';
import test from 'node:test';
import { decideCitycredBot } from '../bot/citycredBotEngineV2.js';

type State = Parameters<typeof decideCitycredBot>[0];

function inicial(): State {
  return {
    stage: 'START', entity: null, personnelType: null, seniorityRange: null,
    availableQuota: null, profileName: null, documentNumber: null,
    commercialStatus: 'NEW', context: {}
  } as State;
}

function texto(decision: ReturnType<typeof decideCitycredBot>): string {
  const r = decision.response;
  if (!r) return '';
  return r.body;
}

/**
 * Caso real (22/07/2026): un cliente respondio algo que el bot no reconocio y
 * le repitio EXACTAMENTE el mismo saludo, quedando como si se hubiera colgado.
 * Nunca debe repetir el mismo texto ante una respuesta ambigua.
 * (Las actividades NO admitidas se descartan antes: ver actividadNoAdmitida.)
 */
test('no repite el saludo cuando no reconoce la entidad', () => {
  let estado = inicial();

  const saludo = decideCitycredBot(estado, { text: 'Hola, ¿me das más info?' });
  const textoSaludo = texto(saludo);
  estado = { ...estado, stage: saludo.nextStage, context: saludo.patch.context ?? estado.context } as State;

  const segunda = decideCitycredBot(estado, { text: 'trabajo en seguridad' });
  const textoSegunda = texto(segunda);

  assert.notEqual(textoSegunda, textoSaludo, 'el bot no debe repetir el mismo mensaje');
  assert.match(textoSegunda, /no pude identificar/i);
});

test('tras dos intentos sin identificar la entidad, pasa a un asesor', () => {
  let estado = inicial();
  for (const mensaje of ['hola', 'soy de la fuerza']) {
    const d = decideCitycredBot(estado, { text: mensaje });
    estado = { ...estado, stage: d.nextStage, context: d.patch.context ?? estado.context } as State;
  }
  const tercera = decideCitycredBot(estado, { text: 'y bueno, ahi ando' });
  assert.equal(tercera.nextStage, 'HANDOFF');
  assert.equal(tercera.patch.handoffReason, 'ENTITY_NOT_RECOGNIZED');
  assert.equal(tercera.scheduleFollowups, false);
});

test('una entidad valida sigue funcionando igual', () => {
  const d = decideCitycredBot(inicial(), { text: 'Ejercito' });
  assert.equal(d.nextStage, 'WAIT_PERSONNEL_TYPE');
  assert.equal(d.patch.entity, 'Ejército');
});
