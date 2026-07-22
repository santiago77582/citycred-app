import assert from 'node:assert/strict';
import test from 'node:test';
import { decideCitycredBot } from '../bot/citycredBotEngineV2.js';
import { quoteOptionsForQuota, quoteTextForQuota } from '../quotes/botQuote.js';
import { quoteLoan } from '../quotes/quoteService.js';

test('con el cupo del cliente ofrece montos que salen de la grilla', () => {
  const opciones = quoteOptionsForQuota({
    entity: 'Ejército', personnelType: 'VOLUNTEER', availableQuota: 150_000
  });
  assert.ok(opciones.length > 0);

  for (const opcion of opciones) {
    // La cuota ofrecida entra en el cupo declarado.
    assert.ok(opcion.monthlyInstallment <= 150_000);
    // El monto es una fila real de la grilla (van de mil en mil).
    assert.equal(opcion.amount % 1_000, 0);
    // Y los valores coinciden exactamente con cotizar esa fila.
    const fila = quoteLoan({
      force: 'EJERCITO', situation: 'VOLUNTEER', requestedAmount: opcion.amount
    });
    assert.ok(fila.ok);
    assert.equal(fila.quote.adjustedToGridRow, false);
    assert.equal(fila.quote.netAmount, opcion.netAmount);
    const enGrilla = fila.quote.options.find((o) => o.termMonths === opcion.termMonths);
    assert.ok(enGrilla);
    assert.equal(enGrilla.monthlyInstallment, opcion.monthlyInstallment);
  }
});

test('no cotiza si no sabe la fuerza o la situación de revista', () => {
  assert.equal(quoteTextForQuota({
    entity: 'Otra entidad', personnelType: 'CAREER', availableQuota: 200_000
  }), null);
  assert.equal(quoteTextForQuota({
    entity: null, personnelType: 'CAREER', availableQuota: 200_000
  }), null);
  assert.equal(quoteTextForQuota({
    entity: 'Ejército', personnelType: null, availableQuota: 200_000
  }), null);
});

test('no cotiza si el cupo no alcanza el mínimo de la grilla', () => {
  assert.equal(quoteTextForQuota({
    entity: 'Gendarmería', personnelType: 'CAREER', availableQuota: 5_000
  }), null);
  assert.equal(quoteTextForQuota({
    entity: 'Ejército', personnelType: 'CAREER', availableQuota: 0
  }), null);
});

test('el bot informa las cuotas al registrar el cupo', () => {
  const decision = decideCitycredBot(
    {
      stage: 'WAIT_QUOTA', entity: 'Ejército', personnelType: 'VOLUNTEER',
      seniorityRange: 'ONE_YEAR_OR_MORE', availableQuota: null, profileName: null,
      documentNumber: null, commercialStatus: 'NEW', context: {}
    },
    { text: '150000', messageType: 'text', hasMedia: false }
  );
  assert.equal(decision.response?.kind, 'text');
  const body = decision.response?.kind === 'text' ? decision.response.body : '';
  assert.match(body, /registré un cupo de \$150\.000/);
  assert.match(body, /podés llevarte hasta/);
  assert.match(body, /sujetos a aprobación/);
  assert.match(body, /pasame nombre y apellido y DNI/);
});

test('con cupo insuficiente el bot sigue como siempre, sin cotizar', () => {
  const decision = decideCitycredBot(
    {
      stage: 'WAIT_QUOTA', entity: 'Gendarmería', personnelType: 'CAREER',
      seniorityRange: 'ONE_YEAR_OR_MORE', availableQuota: null, profileName: null,
      documentNumber: null, commercialStatus: 'NEW', context: {}
    },
    { text: '5000', messageType: 'text', hasMedia: false }
  );
  const body = decision.response?.kind === 'text' ? decision.response.body : '';
  assert.match(body, /registré un cupo de \$5\.000/);
  assert.doesNotMatch(body, /podés llevarte/);
});

test('el menú ya no ofrece Empleado Público de Río Negro', () => {
  const decision = decideCitycredBot(
    {
      stage: 'START', entity: null, personnelType: null, seniorityRange: null,
      availableQuota: null, profileName: null, documentNumber: null,
      commercialStatus: 'NEW', context: {}
    },
    { text: 'hola', messageType: 'text', hasMedia: false }
  );
  assert.equal(decision.response?.kind, 'list');
  const titulos = decision.response?.kind === 'list'
    ? decision.response.sections.flatMap((s) => s.rows.map((r) => r.title))
    : [];
  assert.ok(titulos.includes('Ejército'));
  assert.ok(titulos.includes('Prefectura'));
  assert.ok(!titulos.some((t) => /Río Negro|RN/.test(t)));
});
