import { normalizeForce, type PersonnelSituation } from '../domain/forces.js';
import { maxAmountForQuota, quoteLoan } from './quoteService.js';
import { gridFor } from './grids.js';

/**
 * Traduce el cupo mensual que declaró el cliente en opciones concretas,
 * SIEMPRE leídas de la grilla. Si algo no se puede resolver con certeza
 * (fuerza desconocida, situación sin definir, cupo que no alcanza), devuelve
 * `null` y el bot sigue con su mensaje de siempre: nunca improvisa un monto.
 */

export type BotQuoteOption = {
  termMonths: number;
  amount: number;
  monthlyInstallment: number;
  netAmount: number;
};

const MAX_OPCIONES = 3;

function pesos(value: number): string {
  return `$${value.toLocaleString('es-AR')}`;
}

export function quoteOptionsForQuota(params: {
  entity: string | null;
  personnelType: string | null;
  availableQuota: number | null;
}): BotQuoteOption[] {
  const { entity, personnelType, availableQuota } = params;
  if (!entity || !personnelType) return [];
  if (!Number.isFinite(availableQuota) || (availableQuota ?? 0) <= 0) return [];
  if (personnelType !== 'CAREER' && personnelType !== 'VOLUNTEER') return [];

  const force = normalizeForce(entity);
  if (!force) return [];
  const situation = personnelType as PersonnelSituation;

  const grid = gridFor(force, situation);
  const opciones: BotQuoteOption[] = [];

  // Plazos de mayor a menor: el plazo más largo permite el monto más alto.
  for (const term of [...grid.terms].sort((a, b) => b - a)) {
    const mejor = maxAmountForQuota({
      force,
      situation,
      availableQuota: availableQuota as number,
      termMonths: term
    });
    if (!mejor) continue;

    // El neto también se lee de la grilla, nunca se calcula.
    const detalle = quoteLoan({ force, situation, requestedAmount: mejor.amount });
    if (!detalle.ok) continue;

    opciones.push({
      termMonths: term,
      amount: mejor.amount,
      monthlyInstallment: mejor.monthlyInstallment,
      netAmount: detalle.quote.netAmount
    });
    if (opciones.length >= MAX_OPCIONES) break;
  }

  return opciones;
}

/** Texto listo para mandarle al cliente, o `null` si no se puede cotizar. */
export function quoteTextForQuota(params: {
  entity: string | null;
  personnelType: string | null;
  availableQuota: number | null;
}): string | null {
  const opciones = quoteOptionsForQuota(params);
  if (opciones.length === 0) return null;

  const mejor = opciones[0];
  if (!mejor) return null;

  // Con un cupo mensual fijo, cuanto más largo el plazo, más monto entra.
  // Por eso se muestra el máximo y, debajo, las alternativas de menos plazo.
  const alternativas = opciones.slice(1).map(
    (o) => `• ${o.termMonths} cuotas: ${pesos(o.amount)} (cuota ${pesos(o.monthlyInstallment)})`
  );

  const lineas = [
    `Con ese cupo podés llevarte hasta ${pesos(mejor.amount)} en ${mejor.termMonths} cuotas `
      + `de ${pesos(mejor.monthlyInstallment)}. Recibís ${pesos(mejor.netAmount)} en mano.`
  ];
  if (alternativas.length > 0) {
    lineas.push('Si preferís menos plazo:', ...alternativas);
  }
  lineas.push('Son valores de la grilla vigente y quedan sujetos a aprobación.');
  return lineas.join('\n');
}
