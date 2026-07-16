/**
 * Valores de entorno para las pruebas HTTP e integración.
 *
 * IMPORTANTE: `applyTestEnv()` debe ejecutarse ANTES de importar cualquier
 * módulo que lea la configuración (config.ts valida process.env al importarse
 * y termina el proceso si falta algo). Por eso los archivos de prueba usan
 * `await import(...)` después de llamar a esta función.
 */
export const TEST_API_KEY = 'clave-de-api-solo-para-pruebas-1234567890';
export const TEST_META_APP_SECRET = 'secreto-de-app-meta-solo-pruebas';
export const TEST_VERIFY_TOKEN = 'token-de-verificacion-solo-pruebas';

export function applyTestEnv(overrides: Record<string, string | undefined> = {}): void {
  const base: Record<string, string> = {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    API_KEY: TEST_API_KEY,
    // La URL no se usa: el pool real se reemplaza por pg-mem en memoria.
    DATABASE_URL: 'postgresql://pruebas:pruebas@127.0.0.1:5432/pruebas_en_memoria',
    DATABASE_SSL: 'false',
    META_APP_SECRET: TEST_META_APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: TEST_VERIFY_TOKEN
  };

  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
