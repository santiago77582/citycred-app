import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';

/**
 * Base PostgreSQL en memoria para las pruebas de integración existentes.
 * Carga el esquema inicial; las pruebas de migraciones adicionales usan una base aislada propia.
 */
export type BaseDePruebas = {
  consultar: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
  reiniciar: () => void;
  simularFalloDeBase: (soloSiCoincide?: (sql: string) => boolean) => void;
  restaurarBase: () => void;
};

export async function prepararBaseEnMemoria(): Promise<BaseDePruebas> {
  const { pool } = await import('../../db.js');
  const db = newDb();
  const rutaSql = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../sql/001_init.sql'
  );
  db.public.none(readFileSync(rutaSql, 'utf8'));

  const { Pool } = db.adapters.createPg();
  const poolEnMemoria = new Pool();
  const respaldo = db.backup();
  let falloSimulado: ((sql: string) => boolean) | null = null;

  const queryInterceptada = async (...args: unknown[]): Promise<unknown> => {
    const primero = args[0];
    const sql = typeof primero === 'string'
      ? primero
      : String((primero as { text?: unknown } | undefined)?.text ?? '');
    if (falloSimulado?.(sql)) throw new Error('Fallo de base de datos simulado por la prueba');
    return (poolEnMemoria as unknown as { query: (...a: unknown[]) => Promise<unknown> }).query(...args);
  };

  (pool as unknown as { query: (...a: unknown[]) => Promise<unknown> }).query = queryInterceptada;

  return {
    consultar: (sql, params) =>
      (poolEnMemoria as unknown as {
        query: (
          sql: string,
          params?: unknown[]
        ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
      }).query(sql, params),
    reiniciar: () => {
      falloSimulado = null;
      respaldo.restore();
    },
    simularFalloDeBase: (soloSiCoincide) => {
      falloSimulado = soloSiCoincide ?? (() => true);
    },
    restaurarBase: () => {
      falloSimulado = null;
    }
  };
}
