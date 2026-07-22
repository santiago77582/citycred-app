import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';

applyTestEnv();

const { humanReplyPauseUntil } = await import('../bot/humanPause.js');

/**
 * REGLA DE SANTIAGO: cada vez que habla un humano, el bot se frena.
 * Estas pruebas cuidan que la regla valga igual venga la respuesta del panel,
 * de una plantilla, de un archivo o del celular.
 */

test('la pausa por respuesta humana dura un dia por defecto', () => {
  const ahora = Date.UTC(2026, 6, 21, 12, 0, 0);
  const hasta = humanReplyPauseUntil(ahora);
  assert.equal(hasta.getTime() - ahora, 24 * 60 * 60_000);
});

test('todas las vias de respuesta humana usan la MISMA pausa', () => {
  const archivos = [
    'src/routes/admin.ts',      // respuesta escrita desde el panel
    'src/routes/media.ts',      // envio de un archivo
    'src/routes/templates.ts',  // envio de una plantilla
    'src/services/messageEchoes.ts' // respuesta enviada desde el celular
  ];
  for (const archivo of archivos) {
    const codigo = readFileSync(archivo, 'utf8');
    assert.match(
      codigo,
      /humanReplyPauseUntil\(\)/,
      `${archivo} tiene que frenar el bot con humanReplyPauseUntil()`
    );
    // Nadie debe volver a poner una duracion suelta.
    assert.doesNotMatch(
      codigo,
      /setConversationBotPause\([^)]*new Date\(Date\.now\(\)/,
      `${archivo} no debe calcular la pausa por su cuenta`
    );
  }
});
