import type { ForceKey, PersonnelSituation } from '../domain/forces.js';
import { isSituationAllowed } from '../domain/forces.js';
import { exactRowIndex, gridFor, previousGridAmount } from './grids.js';
import type { GridKey } from './gridTypes.js';

/**
 * COTIZADOR DE CityCred.
 *
 * REGLA INNEGOCIABLE (definida por Santiago): los montos SIEMPRE se leen de la
 * grilla. Este archivo no calcula ni estima ni interpola una cuota bajo ninguna
 * circunstancia. Si el monto pedido no figura en la planilla, se responde con
 * los montos de las filas reales más cercanas, nunca con un número propio.
 */

export type QuoteOption = {
  termMonths: number;
  /** Valor leído de la grilla, sin ninguna operación aritmética. */
  monthlyInstallment: number;
};

export type QuoteResult = {
  gridKey: GridKey;
  gridName: string;
  validityDate: string;
  /** Lo que pidió el cliente. */
  requestedAmount: number;
  /** La fila de la grilla que se usó (puede diferir si el pedido no figuraba). */
  quotedAmount: number;
  /** `true` si hubo que usar la fila anterior porque el monto exacto no existe. */
  adjustedToGridRow: boolean;
  /** Neto leído de la grilla. */
  netAmount: number;
  options: QuoteOption[];
};

export type QuoteRejection = {
  reason:
    | 'SITUATION_NOT_ALLOWED'
    | 'AMOUNT_BELOW_MINIMUM'
    | 'AMOUNT_ABOVE_MAXIMUM'
    | 'AMOUNT_INVALID';
  message: string;
  minAmount?: number;
  maxAmount?: number;
};

export type QuoteOutcome =
  | { ok: true; quote: QuoteResult }
  | { ok: false; rejection: QuoteRejection };

/**
 * Cotiza leyendo la grilla. Si el monto exacto no figura, usa la fila anterior
 * (un monto real de la planilla) y lo informa en `adjustedToGridRow`.
 */
export function quoteLoan(params: {
  force: ForceKey;
  situation: PersonnelSituation;
  requestedAmount: number;
}): QuoteOutcome {
  const { force, situation, requestedAmount } = params;

  if (!isSituationAllowed(force, situation)) {
    return {
      ok: false,
      rejection: {
        reason: 'SITUATION_NOT_ALLOWED',
        message: 'Esa fuerza no admite esa situación de revista para este producto.'
      }
    };
  }

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return {
      ok: false,
      rejection: { reason: 'AMOUNT_INVALID', message: 'El monto solicitado no es válido.' }
    };
  }

  const grid = gridFor(force, situation);

  if (requestedAmount < grid.minAmount) {
    return {
      ok: false,
      rejection: {
        reason: 'AMOUNT_BELOW_MINIMUM',
        message: `El mínimo de esta grilla es $${grid.minAmount.toLocaleString('es-AR')}.`,
        minAmount: grid.minAmount,
        maxAmount: grid.maxAmount
      }
    };
  }

  if (requestedAmount > grid.maxAmount) {
    return {
      ok: false,
      rejection: {
        reason: 'AMOUNT_ABOVE_MAXIMUM',
        message: `El máximo de esta grilla es $${grid.maxAmount.toLocaleString('es-AR')}.`,
        minAmount: grid.minAmount,
        maxAmount: grid.maxAmount
      }
    };
  }

  const exact = exactRowIndex(grid, requestedAmount);
  const quotedAmount = exact !== null
    ? requestedAmount
    : previousGridAmount(grid, requestedAmount);
  if (quotedAmount === null) {
    return {
      ok: false,
      rejection: { reason: 'AMOUNT_INVALID', message: 'Ese monto no figura en la grilla.' }
    };
  }

  const index = exact ?? exactRowIndex(grid, quotedAmount);
  if (index === null) {
    return {
      ok: false,
      rejection: { reason: 'AMOUNT_INVALID', message: 'Ese monto no figura en la grilla.' }
    };
  }

  const netAmount = grid.netos[index];
  if (netAmount === undefined) {
    return {
      ok: false,
      rejection: { reason: 'AMOUNT_INVALID', message: 'Ese monto no figura en la grilla.' }
    };
  }

  const options: QuoteOption[] = [];
  for (let t = 0; t < grid.terms.length; t += 1) {
    const term = grid.terms[t];
    const value = grid.installments[t]?.[index];
    // Si por cualquier motivo falta el dato, se omite el plazo antes que inventarlo.
    if (term === undefined || value === undefined) continue;
    options.push({ termMonths: term, monthlyInstallment: value });
  }

  return {
    ok: true,
    quote: {
      gridKey: grid.key,
      gridName: grid.displayName,
      validityDate: grid.validityDate,
      requestedAmount,
      quotedAmount,
      adjustedToGridRow: exact === null,
      netAmount,
      options
    }
  };
}

/** Plazos cuya cuota entra en el cupo mensual disponible del cliente. */
export function affordableOptions(
  quote: QuoteResult,
  availableQuota: number
): QuoteOption[] {
  if (!Number.isFinite(availableQuota) || availableQuota <= 0) return [];
  return quote.options.filter((option) => option.monthlyInstallment <= availableQuota);
}

/**
 * Monto más alto de la grilla cuya cuota entra en el cupo disponible, para el
 * plazo indicado. Recorre las filas reales de la planilla: no despeja fórmulas.
 */
export function maxAmountForQuota(params: {
  force: ForceKey;
  situation: PersonnelSituation;
  availableQuota: number;
  termMonths: number;
}): { amount: number; monthlyInstallment: number } | null {
  const { force, situation, availableQuota, termMonths } = params;
  if (!isSituationAllowed(force, situation)) return null;
  if (!Number.isFinite(availableQuota) || availableQuota <= 0) return null;

  const grid = gridFor(force, situation);
  const termIndex = grid.terms.indexOf(termMonths);
  if (termIndex === -1) return null;
  const column = grid.installments[termIndex];
  if (!column) return null;

  // Las cuotas crecen con el monto: se busca la última fila que entra en el cupo.
  let low = 0;
  let high = column.length - 1;
  let best = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const installment = column[middle];
    if (installment === undefined) break;
    if (installment <= availableQuota) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (best === -1) return null;

  const installment = column[best];
  if (installment === undefined) return null;
  return { amount: grid.minAmount + best * grid.step, monthlyInstallment: installment };
}
