import type { ForceKey, PersonnelSituation } from '../domain/forces.js';
import { isSituationAllowed } from '../domain/forces.js';
import { gridFor, type QuoteGrid } from './grids.js';

/** Una opción de plazo con su cuota mensual. */
export type QuoteOption = {
  termMonths: number;
  monthlyInstallment: number;
};

export type QuoteResult = {
  gridKey: QuoteGrid['key'];
  gridName: string;
  validityDate: string;
  requestedAmount: number;
  /** Lo que el cliente recibe en mano. */
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
  /** Límites de la grilla que correspondía, para poder orientar al cliente. */
  minAmount?: number;
  maxAmount?: number;
};

export type QuoteOutcome =
  | { ok: true; quote: QuoteResult }
  | { ok: false; rejection: QuoteRejection };

/** Redondea a peso entero: nunca se informan centavos al cliente. */
function toPesos(value: number): number {
  return Math.round(value);
}

/**
 * Cotiza un préstamo. Devuelve un rechazo explícito (nunca un número inventado)
 * cuando el monto queda fuera de la grilla o la situación no corresponde.
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
        message: `El mínimo para esta grilla es $${grid.minAmount.toLocaleString('es-AR')}.`,
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
        message: `El máximo para esta grilla es $${grid.maxAmount.toLocaleString('es-AR')}.`,
        minAmount: grid.minAmount,
        maxAmount: grid.maxAmount
      }
    };
  }

  const options = Object.entries(grid.factors)
    .map(([term, factor]) => ({
      termMonths: Number(term),
      monthlyInstallment: toPesos(requestedAmount * factor)
    }))
    .sort((left, right) => left.termMonths - right.termMonths);

  return {
    ok: true,
    quote: {
      gridKey: grid.key,
      gridName: grid.displayName,
      validityDate: grid.validityDate,
      requestedAmount,
      netAmount: toPesos(requestedAmount * grid.netoRatio),
      options
    }
  };
}

/**
 * Busca el plazo cuya cuota entra en el cupo disponible del cliente.
 * Devuelve la opción de mayor plazo posible... y la de menor cuota que entra.
 */
export function affordableOptions(
  quote: QuoteResult,
  availableQuota: number
): QuoteOption[] {
  if (!Number.isFinite(availableQuota) || availableQuota <= 0) return [];
  return quote.options.filter((option) => option.monthlyInstallment <= availableQuota);
}
