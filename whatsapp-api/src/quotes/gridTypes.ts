export type GridKey =
  | 'GENERAL'
  | 'SPF_PSA_PNA'
  | 'VOLUNTARIOS_EJERCITO'
  | 'VOLUNTARIOS_FA_FAA';

/**
 * Una grilla tal cual viene del Excel de AMFAYS.
 *
 * `netos` e `installments` guardan los montos LITERALES de la planilla. El
 * sistema jamás calcula una cuota: ubica la fila y lee el valor.
 *
 * - `netos[i]` es el neto de la fila `i`.
 * - `installments[t][i]` es la cuota del plazo `terms[t]` en la fila `i`.
 * - La fila `i` corresponde al monto `minAmount + i * step`.
 */
export type GridData = {
  key: GridKey;
  sheet: string;
  displayName: string;
  /** Fecha declarada dentro de la hoja del Excel (ISO). */
  validityDate: string;
  minAmount: number;
  maxAmount: number;
  step: number;
  terms: number[];
  netos: number[];
  installments: number[][];
};
