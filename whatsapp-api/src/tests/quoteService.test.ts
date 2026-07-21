import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGridKey } from '../quotes/grids.js';
import { affordableOptions, quoteLoan } from '../quotes/quoteService.js';

/**
 * Los valores esperados salen TAL CUAL del Excel
 * "Grillas General Vig 09-07-2026" (redondeados a peso entero).
 * Si una grilla cambia y estos numeros no se actualizan, el test falla.
 */

function cuota(
  force: Parameters<typeof quoteLoan>[0]['force'],
  situation: Parameters<typeof quoteLoan>[0]['situation'],
  monto: number,
  plazo: number
): number {
  const outcome = quoteLoan({ force, situation, requestedAmount: monto });
  assert.ok(outcome.ok, 'la cotizacion deberia ser valida');
  const option = outcome.quote.options.find((o) => o.termMonths === plazo);
  assert.ok(option, `falta el plazo de ${plazo} meses`);
  return option.monthlyInstallment;
}

test('grilla general: coincide con el Excel en el minimo y en el maximo', () => {
  // Excel General, fila 100.000: 12 meses = 12885,3576055458
  assert.equal(cuota('GENDARMERIA', 'CAREER', 100_000, 12), 12_885);
  // Excel General, fila 10.000.000: 12 meses = 1288535,76055458
  assert.equal(cuota('GENDARMERIA', 'CAREER', 10_000_000, 12), 1_288_536);
  // Excel General, fila 100.000: 6 meses = 21263,7580156212
  assert.equal(cuota('PREFECTURA', 'CAREER', 100_000, 6), 21_264);
  // Excel General, fila 100.000: 36 meses = 8045,55645236068
  assert.equal(cuota('EJERCITO', 'CAREER', 100_000, 36), 8_046);
});

test('grilla de voluntarios del Ejercito: coincide con el Excel', () => {
  // Excel Voluntarios Ejercito, fila 100.000: 6 meses = 22513,981752479525
  assert.equal(cuota('EJERCITO', 'VOLUNTEER', 100_000, 6), 22_514);
  // Excel Voluntarios Ejercito, fila 4.000.000: 24 meses = 423027,636490836
  assert.equal(cuota('EJERCITO', 'VOLUNTEER', 4_000_000, 24), 423_028);
});

test('grilla de voluntarios de Armada: coincide con el Excel', () => {
  // Excel Voluntarios FA FAA, fila 100.000: 12 meses = 12885,3576055458
  assert.equal(cuota('ARMADA', 'VOLUNTEER', 100_000, 12), 12_885);
});

test('el neto que recibe el cliente sale de la grilla correcta', () => {
  const general = quoteLoan({ force: 'EJERCITO', situation: 'CAREER', requestedAmount: 100_000 });
  assert.ok(general.ok);
  assert.equal(general.quote.netAmount, 75_000); // 75 %

  const volEjercito = quoteLoan({ force: 'EJERCITO', situation: 'VOLUNTEER', requestedAmount: 100_000 });
  assert.ok(volEjercito.ok);
  assert.equal(volEjercito.quote.netAmount, 70_000); // 70 %

  // Un voluntario de Armada recibe MUCHO menos por el mismo monto solicitado.
  const volArmada = quoteLoan({ force: 'ARMADA', situation: 'VOLUNTEER', requestedAmount: 100_000 });
  assert.ok(volArmada.ok);
  assert.equal(volArmada.quote.netAmount, 52_000); // 52 %
});

test('asigna la grilla segun la regla de CityCred', () => {
  assert.equal(resolveGridKey('EJERCITO', 'VOLUNTEER'), 'VOLUNTARIOS_EJERCITO');
  assert.equal(resolveGridKey('ARMADA', 'VOLUNTEER'), 'VOLUNTARIOS_FA_FAA');
  // Todo el personal de carrera va a la general.
  assert.equal(resolveGridKey('EJERCITO', 'CAREER'), 'GENERAL');
  assert.equal(resolveGridKey('ARMADA', 'CAREER'), 'GENERAL');
  assert.equal(resolveGridKey('GENDARMERIA', 'CAREER'), 'GENERAL');
  assert.equal(resolveGridKey('PREFECTURA', 'CAREER'), 'GENERAL');
});

test('rechaza cotizar a un voluntario de Gendarmeria o Prefectura', () => {
  for (const force of ['GENDARMERIA', 'PREFECTURA'] as const) {
    const outcome = quoteLoan({ force, situation: 'VOLUNTEER', requestedAmount: 500_000 });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.rejection.reason, 'SITUATION_NOT_ALLOWED');
  }
});

test('nunca inventa una cuota fuera del rango de la grilla', () => {
  const bajo = quoteLoan({ force: 'EJERCITO', situation: 'CAREER', requestedAmount: 50_000 });
  assert.equal(bajo.ok, false);
  if (!bajo.ok) assert.equal(bajo.rejection.reason, 'AMOUNT_BELOW_MINIMUM');

  // La grilla de voluntarios llega hasta 4.000.000, no hasta 10.000.000.
  const alto = quoteLoan({ force: 'EJERCITO', situation: 'VOLUNTEER', requestedAmount: 5_000_000 });
  assert.equal(alto.ok, false);
  if (!alto.ok) {
    assert.equal(alto.rejection.reason, 'AMOUNT_ABOVE_MAXIMUM');
    assert.equal(alto.rejection.maxAmount, 4_000_000);
  }

  // Ese mismo monto SI entra en la grilla general.
  const general = quoteLoan({ force: 'EJERCITO', situation: 'CAREER', requestedAmount: 5_000_000 });
  assert.equal(general.ok, true);
});

test('rechaza montos invalidos en vez de responder cualquier cosa', () => {
  for (const monto of [0, -100_000, Number.NaN]) {
    const outcome = quoteLoan({ force: 'EJERCITO', situation: 'CAREER', requestedAmount: monto });
    assert.equal(outcome.ok, false);
  }
});

test('filtra los plazos que entran en el cupo disponible del cliente', () => {
  const outcome = quoteLoan({ force: 'EJERCITO', situation: 'CAREER', requestedAmount: 1_000_000 });
  assert.ok(outcome.ok);
  // Con 100.000 de cupo solo entran los plazos largos (cuota mas baja).
  const entran = affordableOptions(outcome.quote, 100_000);
  assert.ok(entran.length > 0);
  assert.ok(entran.every((o) => o.monthlyInstallment <= 100_000));
  // El plazo mas corto (6 meses = 212.638) no puede entrar.
  assert.ok(!entran.some((o) => o.termMonths === 6));
  // Sin cupo, no se ofrece nada.
  assert.deepEqual(affordableOptions(outcome.quote, 0), []);
});

test('las cuotas se informan en pesos enteros, sin centavos', () => {
  const outcome = quoteLoan({ force: 'ARMADA', situation: 'CAREER', requestedAmount: 333_000 });
  assert.ok(outcome.ok);
  for (const option of outcome.quote.options) {
    assert.equal(Number.isInteger(option.monthlyInstallment), true);
  }
  assert.equal(Number.isInteger(outcome.quote.netAmount), true);
});
