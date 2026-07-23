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

// WhatsApp permite hasta 10 filas en una lista desplegable.
const MAX_OPCIONES = 8;

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

export type QuoteList = {
  body: string;
  button: string;
  rows: Array<{ id: string; title: string; description: string }>;
};

/**
 * Lista desplegable de opciones para el cliente.
 *
 * REGLA DE SANTIAGO: cada opción muestra SOLO el neto (lo que recibe en mano)
 * y la cuota. El monto solicitado de la grilla NUNCA se muestra: confunde.
 *
 * Devuelve `null` si no se puede cotizar (el bot sigue con su flujo de siempre).
 */
export function quoteListForQuota(params: {
  entity: string | null;
  personnelType: string | null;
  availableQuota: number | null;
}): QuoteList | null {
  const opciones = quoteOptionsForQuota(params);
  if (opciones.length === 0) return null;

  const rows = opciones.map((o) => ({
    id: `quote:${o.termMonths}`,
    // Título corto (WhatsApp limita a 24): plazo + cuota.
    title: `${o.termMonths} cuotas de ${pesos(o.monthlyInstallment)}`.slice(0, 24),
    // Descripción: lo que recibe en mano. Nunca el monto solicitado.
    description: `Recibís ${pesos(o.netAmount)} en mano`.slice(0, 72)
  }));

  return {
    body: 'Estas son las opciones para vos. Tocá "Ver opciones" y elegí la que te sirva 👇',
    button: 'Ver opciones',
    rows
  };
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
