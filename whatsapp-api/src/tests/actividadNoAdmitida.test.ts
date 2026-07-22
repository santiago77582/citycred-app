import assert from 'node:assert/strict';
import test from 'node:test';
import { decideCitycredBot } from '../bot/citycredBotEngineV2.js';
import { detectarActividadNoAdmitida, hayContradiccion } from '../domain/actividadNoAdmitida.js';

type State = Parameters<typeof decideCitycredBot>[0];

function inicial(): State {
  return {
    stage: 'START', entity: null, personnelType: null, seniorityRange: null,
    availableQuota: null, profileName: null, documentNumber: null,
    commercialStatus: 'NEW', context: {}
  } as State;
}

/** CityCred atiende SOLO Ejército, Armada, Gendarmería y Prefectura. */

test('descarta todas las actividades que CityCred no atiende', () => {
  const casos: Array<[string, string]> = [
    ['Soy de la policía federal', 'Policía Federal'],
    ['trabajo en la Policía de Río Negro', 'Policía de Río Negro'],
    ['soy policia bonaerense', 'Policía de Buenos Aires'],
    ['policía de la provincia de Buenos Aires', 'Policía de Buenos Aires'],
    ['soy de la policia de Santa Fe', 'Policía provincial'],
    ['soy policía', 'Policía (sin especificar)'],
    ['estoy en fuerza aérea', 'Fuerza Aérea'],
    ['trabajo en el servicio penitenciario', 'Servicio Penitenciario'],
    ['soy empleado público', 'Empleado público'],
    ['soy docente en una escuela', 'Docente'],
    ['trabajo en el municipio', 'Municipal'],
    ['soy enfermera del hospital', 'Personal de salud provincial'],
    ['estoy jubilado', 'Jubilado o pensionado'],
    ['soy monotributista', 'Monotributista'],
    ['trabajo en una empresa privada', 'Empresa privada']
  ];
  for (const [texto, esperado] of casos) {
    const r = detectarActividadNoAdmitida(texto);
    assert.ok(r, `deberia descartar: ${texto}`);
    assert.equal(r.actividad, esperado, `mal clasificado: ${texto}`);
  }
});

test('NO descarta a las cuatro fuerzas admitidas', () => {
  const admitidos = [
    'Soy del ejército', 'Ejercito argentino', 'Estoy en la armada', 'Soy marino',
    'Trabajo en prefectura', 'Soy de la PNA', 'Soy gendarme', 'GNA',
    'soy de gendarmeria nacional', 'prefectura naval argentina'
  ];
  for (const texto of admitidos) {
    assert.equal(detectarActividadNoAdmitida(texto), null, `no deberia descartar: ${texto}`);
  }
});

test('no confunde una policía provincial con Gendarmería ni Prefectura', () => {
  const r = detectarActividadNoAdmitida('soy de la policia de la provincia');
  assert.ok(r);
  assert.match(r.actividad, /Polic/);
  // Y una fuerza admitida no queda marcada como policía.
  assert.equal(detectarActividadNoAdmitida('soy gendarme'), null);
  assert.equal(detectarActividadNoAdmitida('trabajo en prefectura'), null);
});

test('no confunde Fuerza Aérea con Ejército', () => {
  assert.equal(detectarActividadNoAdmitida('soy del ejercito'), null);
  const fa = detectarActividadNoAdmitida('soy de la fuerza aerea');
  assert.ok(fa);
  assert.equal(fa.actividad, 'Fuerza Aérea');
});

test('detecta contradiccion entre fuerza admitida y actividad no admitida', () => {
  assert.equal(hayContradiccion('soy de prefectura pero trabajo en el municipio'), true);
  assert.equal(hayContradiccion('soy de prefectura'), false);
  assert.equal(hayContradiccion('soy policia'), false);
});

test('el bot descarta al cliente y corta el flujo automatico', () => {
  const d = decideCitycredBot(inicial(), { text: 'Hola, soy de la Policía de Río Negro' });

  assert.equal(d.nextStage, 'OUT_OF_SCOPE');
  assert.equal(d.patch.commercialStatus, 'NO_CALIFICA_ACTIVIDAD');
  assert.equal(d.scheduleFollowups, false, 'no debe programar seguimientos');
  assert.equal(d.patch.context?.actividadDetectada, 'Policía de Río Negro');
  assert.equal(d.patch.context?.excluidoDeCampanias, true);

  const body = d.response?.kind === 'text' ? d.response.body : '';
  assert.match(body, /Ejército, Armada, Gendarmería y Prefectura/);
  // No debe pedirle recibos ni cupo.
  assert.doesNotMatch(body, /recibo|cupo|DNI/i);
});

test('a un descartado no se le sigue pidiendo documentacion', () => {
  const d = decideCitycredBot(inicial(), { text: 'soy docente' });
  assert.equal(d.nextStage, 'OUT_OF_SCOPE');
  const body = d.response?.kind === 'text' ? d.response.body : '';
  assert.doesNotMatch(body, /recibo|cupo|antigüedad|antiguedad/i);
});

test('una contradiccion se deriva a una persona, no se descarta sola', () => {
  const d = decideCitycredBot(inicial(), { text: 'soy de prefectura pero trabajo en el municipio' });
  assert.equal(d.nextStage, 'HANDOFF');
  assert.equal(d.patch.handoffReason, 'ACTIVIDAD_CONTRADICTORIA');
  assert.equal(d.scheduleFollowups, false);
});

test('las cuatro fuerzas siguen avanzando en el flujo normal', () => {
  const ejercito = decideCitycredBot(inicial(), { text: 'Ejercito' });
  assert.equal(ejercito.patch.entity, 'Ejército');
  assert.notEqual(ejercito.nextStage, 'OUT_OF_SCOPE');

  const prefectura = decideCitycredBot(inicial(), { text: 'trabajo en prefectura' });
  assert.equal(prefectura.patch.entity, 'Prefectura');
  assert.notEqual(prefectura.nextStage, 'OUT_OF_SCOPE');
});

test('reconoce las formas que usa la gente para nombrar su fuerza', () => {
  const casos: Array<[string, string]> = [
    ['Soy del ejército', 'Ejército'],
    ['Ejercito argentino', 'Ejército'],
    ['Estoy en la armada', 'Armada'],
    ['Soy marino', 'Armada'],
    ['Trabajo en prefectura', 'Prefectura'],
    ['Soy de la PNA', 'Prefectura'],
    ['Soy gendarme', 'Gendarmería'],
    ['GNA', 'Gendarmería']
  ];
  for (const [texto, esperado] of casos) {
    const d = decideCitycredBot(inicial(), { text: texto });
    assert.equal(d.patch.entity, esperado, `no reconocio: ${texto}`);
    assert.notEqual(d.nextStage, 'OUT_OF_SCOPE', `descarto mal: ${texto}`);
  }
});
