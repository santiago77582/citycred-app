import type { ForceKey, PersonnelSituation } from '../domain/forces.js';
import { ALL_GRIDS } from './gridData.js';
import type { GridData, GridKey } from './gridTypes.js';

export type { GridData, GridKey } from './gridTypes.js';

export const QUOTE_GRIDS: Readonly<Record<GridKey, GridData>> = ALL_GRIDS;

/**
 * Regla confirmada por Santiago: a todos les corresponde la grilla general,
 * y a los voluntarios la grilla de voluntarios de su fuerza.
 * Gendarmería y Prefectura solo admiten personal de carrera (ver `forces.ts`).
 */
export function resolveGridKey(
  force: ForceKey,
  situation: PersonnelSituation
): GridKey {
  if (situation === 'VOLUNTEER') {
    if (force === 'EJERCITO') return 'VOLUNTARIOS_EJERCITO';
    if (force === 'ARMADA') return 'VOLUNTARIOS_FA_FAA';
  }
  return 'GENERAL';
}

export function gridFor(force: ForceKey, situation: PersonnelSituation): GridData {
  return QUOTE_GRIDS[resolveGridKey(force, situation)];
}

/**
 * Índice de la fila EXACTA del monto dentro de la grilla, o `null` si ese monto
 * no figura en la planilla. No se interpola ni se estima: si no está, no está.
 */
export function exactRowIndex(grid: GridData, amount: number): number | null {
  if (!Number.isFinite(amount)) return null;
  if (amount < grid.minAmount || amount > grid.maxAmount) return null;
  const offset = amount - grid.minAmount;
  if (offset % grid.step !== 0) return null;
  const index = offset / grid.step;
  return index >= 0 && index < grid.netos.length ? index : null;
}

/** Monto de la grilla inmediatamente menor o igual al pedido (siempre una fila real). */
export function previousGridAmount(grid: GridData, amount: number): number | null {
  if (!Number.isFinite(amount) || amount < grid.minAmount) return null;
  const capped = Math.min(amount, grid.maxAmount);
  const index = Math.floor((capped - grid.minAmount) / grid.step);
  if (index < 0 || index >= grid.netos.length) return null;
  return grid.minAmount + index * grid.step;
}
