import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';

/** Base PostgreSQL en memoria con el esquema real completo del proyecto. */
export type BaseDePruebas = {
  consultar: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
  reiniciar: () => void;
  simularFalloDeBase: (soloSiCoincide?: (sql: string) => boolean) => void;
  restaurarBase: () => void;
};

export async function prepararBaseEnMemoria(): Promise<BaseDePruebas> {
  const { pool } = await import('../../db.js');
  const db = newDb();
  const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../sql');
  const migrations = readdirSync(sqlDir)
    .filter((name) => /^\d+_.*\.sql$/i.test(name))
    .sort((left, right) => left.localeCompare(right));

  for (const migration of migrations) {
    db.public.none(readFileSync(path.join(sqlDir, migration), 'utf8'));
  }

  const { Pool } = db.adapters.createPg();
  const poolEnMemoria = new Pool();
  const respaldo = db.backup();
  let falloSimulado: ((sql: string) => boolean) | null = null;

  const sqlFromArgs = (args: unknown[]): string => {
    const primero = args[0];
    return typeof primero === 'string'
      ? primero
      : String((primero as { text?: unknown } | undefined)?.text ?? '');
  };

  const queryInterceptada = async (...args: unknown[]): Promise<unknown> => {
    const sql = sqlFromArgs(args);
    if (falloSimulado?.(sql)) throw new Error('Fallo de base de datos simulado por la prueba');
    const query = poolEnMemoria.query.bind(poolEnMemoria) as unknown as (
      ...values: unknown[]
    ) => Promise<unknown>;
    return query(...args);
  };

  const connectInterceptado = async (): Promise<unknown> => {
    const client = await poolEnMemoria.connect();
    const originalQuery = client.query.bind(client) as unknown as (
      ...values: unknown[]
    ) => Promise<unknown>;
    const wrappedClient = client as unknown as {
      query: (...values: unknown[]) => Promise<unknown>;
    };
    wrappedClient.query = async (...args: unknown[]) => {
      const sql = sqlFromArgs(args);
      if (falloSimulado?.(sql)) throw new Error('Fallo de base de datos simulado por la prueba');
      return originalQuery(...args);
    };
    return client;
  };

  (pool as unknown as { query: (...a: unknown[]) => Promise<unknown> }).query = queryInterceptada;
  (pool as unknown as { connect: () => Promise<unknown> }).connect = connectInterceptado;

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
