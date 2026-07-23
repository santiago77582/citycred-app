import assert from 'node:assert/strict';
import test from 'node:test';
import { decideCitycredBot } from '../bot/citycredBotEngineV2.js';

type State = Parameters<typeof decideCitycredBot>[0];

/**
 * Flujo correcto definido por Santiago (22/07/2026):
 *   entidad -> antigüedad -> cupo -> DESPLEGABLE -> elige -> se le confirma ->
 *   cómo autorizar el cupo -> recién ahí, documentación.
 *
 * Regla dura: NO se le pide ningún dato personal antes de la autorización.
 */

function estado(over: Partial<State> = {}): State {
  return {
    stage: 'START', entity: null, personnelType: null, seniorityRange: null,
    availableQuota: null, profileName: null, documentNumber: null,
    commercialStatus: 'NEW', context: {}, ...over
  } as State;
}

function texto(d: ReturnType<typeof decideCitycredBot>): string {
  const r = d.response;
  return r && r.kind === 'text' ? r.body : '';
}

test('al registrar el cupo NO pide DNI ni nombre: muestra el desplegable', () => {
  const d = decideCitycredBot(
    estado({ stage: 'WAIT_QUOTA', entity: 'Gendarmería', personnelType: 'CAREER', seniorityRange: 'ONE_YEAR_OR_MORE' }),
    { text: '200000' }
  );

  assert.equal(d.response?.kind, 'list', 'debe ser un desplegable');
  if (d.response?.kind !== 'list') return;
  assert.equal(d.nextStage, 'WAIT_QUOTE_CHOICE');

  const todo = JSON.stringify(d.response);
  assert.doesNotMatch(todo, /DNI|nombre y apellido|CBU/i, 'no debe pedir datos personales');
  assert.match(d.response.body, /registré tu cupo de \$200\.000/);

  // Cada opción: cuota + neto. Nunca el monto solicitado.
  for (const row of d.response.sections[0]?.rows ?? []) {
    assert.match(row.title, /cuotas de \$/);
    assert.match(String(row.description), /Recibís \$.* en mano/);
  }
});

test('cuando elige un plazo, se lo confirma y le explica cómo autorizar', () => {
  const d = decideCitycredBot(
    estado({
      stage: 'WAIT_QUOTE_CHOICE', entity: 'Gendarmería', personnelType: 'CAREER',
      seniorityRange: 'ONE_YEAR_OR_MORE', availableQuota: 200_000,
      context: { optionsShown: true }
    }),
    { text: null, interactiveId: 'quote:36' }
  );

  const body = texto(d);
  assert.equal(d.nextStage, 'WAIT_AUTHORIZATION');
  // Le repite lo que eligió.
  assert.match(body, /Elegiste 36 cuotas/);
  assert.match(body, /Recibís \$/);
  // Y le explica cómo autorizar el cupo (datos reales de CityCred).
  assert.match(body, /certificado de afectación/i);
  assert.match(body, /400571/);
  assert.match(body, /AMFAYS/);
  // Todavía NO pide documentación.
  assert.doesNotMatch(body, /DNI de ambos lados|CBU/i);
});

test('cada fuerza recibe SUS instrucciones de autorización', () => {
  const casos: Array<[string, RegExp]> = [
    ['Ejército', /Haberes 2\.0/i],
    ['Armada', /siaf\.armada\.mil\.ar/i],
    ['Gendarmería', /gendarmeria\.gob\.ar/i],
    ['Prefectura', /RRHH|administración/i]
  ];
  for (const [entidad, esperado] of casos) {
    const d = decideCitycredBot(
      estado({
        stage: 'WAIT_QUOTE_CHOICE', entity: entidad,
        personnelType: entidad === 'Ejército' || entidad === 'Armada' ? 'CAREER' : 'CAREER',
        seniorityRange: 'ONE_YEAR_OR_MORE', availableQuota: 200_000,
        context: { optionsShown: true }
      }),
      { text: null, interactiveId: 'quote:24' }
    );
    assert.match(texto(d), esperado, `instrucciones incorrectas para ${entidad}`);
  }
});

test('la documentación se pide SOLO después de autorizar el cupo', () => {
  const d = decideCitycredBot(
    estado({
      stage: 'WAIT_AUTHORIZATION', entity: 'Gendarmería', personnelType: 'CAREER',
      seniorityRange: 'ONE_YEAR_OR_MORE', availableQuota: 200_000,
      context: { optionsShown: true, authorizationSent: true }
    }),
    { text: 'ya lo tengo autorizado' }
  );

  const body = texto(d);
  assert.equal(d.nextStage, 'WAIT_DOCUMENTS');
  assert.match(body, /ya está autorizado/i);
  assert.match(body, /DNI de ambos lados/i);
  assert.match(body, /CBU/i);
});

test('cuando mandan un archivo NO se interroga al cliente sobre qué es', () => {
  const d = decideCitycredBot(
    estado({
      stage: 'WAIT_DOCUMENTS', entity: 'Gendarmería', personnelType: 'CAREER',
      seniorityRange: 'ONE_YEAR_OR_MORE', availableQuota: 200_000,
      context: { optionsShown: true, authorizationSent: true, docsRequested: true }
    }),
    { text: null, messageType: 'image', hasMedia: true }
  );

  const body = texto(d);
  assert.match(body, /recibí el archivo/i);
  // El bot NO debe preguntar "¿es recibo, DNI frente, DNI dorso...?"
  assert.doesNotMatch(body, /decime si es|DNI frente|DNI dorso/i);
});

test('el cupo en cero corta el flujo y no pide nada', () => {
  const d = decideCitycredBot(
    estado({ stage: 'WAIT_QUOTA', entity: 'Prefectura', personnelType: 'CAREER', seniorityRange: 'ONE_YEAR_OR_MORE' }),
    { text: 'no tengo cupo' }
  );
  assert.equal(d.nextStage, 'NO_QUOTA');
  assert.equal(d.scheduleFollowups, false);
  assert.doesNotMatch(texto(d), /DNI|CBU|recibo/i);
});
