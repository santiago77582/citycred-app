import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';

/**
 * Base PostgreSQL en memoria (pg-mem) para las pruebas de integración.
 *
 * Estrategia reproducible sin depender de un servidor PostgreSQL real:
 * - se carga el esquema REAL desde `sql/001_init.sql` (el mismo archivo que
 *   usa producción), sin duplicar definiciones;
 * - se reemplaza `pool.query` del módulo `db.ts` por la base en memoria;
 * - `simularFalloDeBase()` permite simular una base caída (total o por
 *   consulta específica) para probar `/health` degradado y errores de
 *   persistencia del webhook;
 * - `reiniciar()` restaura los datos al estado inicial entre pruebas, lo que
 *   garantiza limpieza y aislamiento.
 *
 * Limitaciones conocidas de pg-mem (no afectan lo que se prueba acá):
 * - el subquery correlacionado de `listConversations` no es soportado, por lo
 *   que las lecturas con datos se validan vía `listMessagesByWaId`;
 * - `rowCount` de un INSERT con `ON CONFLICT ... DO NOTHING` puede informarse
 *   mal, así que la idempotencia se verifica con SELECT COUNT(*) reales.
 */

export type BaseDePruebas = {
  /** Ejecuta SQL directo contra la base en memoria (para preparar y verificar datos). */
  consultar: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
  /** Restaura los datos al estado inicial y desactiva fallos simulados. */
  reiniciar: () => void;
  /** Hace fallar las próximas consultas; sin argumento fallan todas. */
  simularFalloDeBase: (soloSiCoincide?: (sql: string) => boolean) => void;
  /** Desactiva el fallo simulado. */
  restaurarBase: () => void;
};

export async function prepararBaseEnMemoria(): Promise<BaseDePruebas> {
  // Importación diferida: db.ts lee la configuración al importarse, así que el
  // entorno de pruebas ya tiene que estar aplicado cuando se llama esta función.
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
    const sql =
      typeof primero === 'string'
        ? primero
        : String((primero as { text?: unknown } | undefined)?.text ?? '');
    if (falloSimulado?.(sql)) {
      throw new Error('Fallo de base de datos simulado por la prueba');
    }
    return (poolEnMemoria as unknown as { query: (...a: unknown[]) => Promise<unknown> }).query(
      ...args
    );
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
