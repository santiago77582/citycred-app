import type { ForceKey, PersonnelSituation } from '../domain/forces.js';

/**
 * Grillas de cuotas de CityCred.
 *
 * Se verificaron las 27.604 filas del Excel "Grillas General Vig 09-07-2026":
 * TODAS las grillas son perfectamente lineales, sin una sola excepción. Por eso
 * cada grilla se expresa como un factor por plazo en vez de miles de filas:
 *
 *     cuota = monto solicitado x factor(plazo)
 *     neto  = monto solicitado x netoRatio
 *
 * Para regenerar estos valores desde un Excel nuevo, ver `REGENERAR` abajo.
 */

export type GridKey =
  | 'GENERAL'
  | 'SPF_PSA_PNA'
  | 'VOLUNTARIOS_EJERCITO'
  | 'VOLUNTARIOS_FA_FAA';

export type QuoteGrid = {
  key: GridKey;
  /** Nombre de la hoja en el Excel de origen. */
  sourceSheet: string;
  displayName: string;
  /** Fecha declarada dentro de la hoja (formato ISO). */
  validityDate: string;
  /** Proporción del monto solicitado que el cliente recibe en mano. */
  netoRatio: number;
  minAmount: number;
  maxAmount: number;
  /** Cuota mensual = monto solicitado x factor. */
  factors: Readonly<Record<number, number>>;
};

export const QUOTE_GRIDS: Readonly<Record<GridKey, QuoteGrid>> = {
  GENERAL: {
    key: 'GENERAL',
    sourceSheet: 'General',
    displayName: 'Grilla general (Decreto 14/12)',
    validityDate: '2026-05-14',
    netoRatio: 0.75,
    minAmount: 100_000,
    maxAmount: 10_000_000,
    factors: {
      6: 0.21263758015621273,
      9: 0.1563553228770627,
      12: 0.1288535760554588,
      15: 0.11284791982708149,
      18: 0.10257377537731309,
      24: 0.0905637329355889,
      30: 0.08415663723783118,
      36: 0.08045556452360687
    }
  },
  SPF_PSA_PNA: {
    key: 'SPF_PSA_PNA',
    sourceSheet: 'Gral SPF PSA PNA',
    displayName: 'Grilla SPF / PSA / PNA (Decreto 14/12)',
    validityDate: '2026-05-14',
    netoRatio: 0.75,
    minAmount: 100_000,
    maxAmount: 10_000_000,
    factors: {
      12: 0.1277253970048587,
      15: 0.111680221806942,
      18: 0.10136431675350807,
      24: 0.0892719567180317,
      30: 0.0827898920209017,
      36: 0.07902400392231371
    }
  },
  VOLUNTARIOS_EJERCITO: {
    key: 'VOLUNTARIOS_EJERCITO',
    sourceSheet: 'Voluntarios Ejercito Arg',
    displayName: 'Grilla Soldado Voluntario del Ejército Argentino',
    validityDate: '2026-07-10',
    netoRatio: 0.7,
    minAmount: 100_000,
    maxAmount: 4_000_000,
    factors: {
      6: 0.22513981752479525,
      8: 0.18291882883904914,
      10: 0.15811375303740394,
      12: 0.1420043776651616,
      14: 0.1308516031015286,
      16: 0.12278446598710696,
      18: 0.116762496047354,
      20: 0.11216066616765953,
      22: 0.10858073410632842,
      24: 0.10575690912270902
    }
  },
  VOLUNTARIOS_FA_FAA: {
    key: 'VOLUNTARIOS_FA_FAA',
    sourceSheet: 'Voluntarios FA FAA',
    displayName: 'Grilla Voluntarios Fuerza Aérea y Armada',
    validityDate: '2026-05-14',
    netoRatio: 0.52,
    minAmount: 100_000,
    maxAmount: 4_000_000,
    factors: {
      6: 0.21263758015621273,
      8: 0.17031805175143783,
      10: 0.1452704429967876,
      12: 0.1288535760554588,
      14: 0.11736322580408991,
      16: 0.10894658803249554,
      18: 0.10257377537731309
    }
  }
};

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

export function gridFor(force: ForceKey, situation: PersonnelSituation): QuoteGrid {
  return QUOTE_GRIDS[resolveGridKey(force, situation)];
}
