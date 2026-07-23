import assert from 'node:assert/strict';
import test from 'node:test';
import { analizarBlindaje, bloqueaEnvioAutomatico } from '../domain/blindaje.js';

/**
 * El blindaje cuida la insignia: lo que importa es que NO deje pasar un mensaje
 * peligroso, y que NO moleste con falsos positivos en los mensajes de siempre.
 */

function reglas(texto: string): string[] {
  return analizarBlindaje(texto).hallazgos.map((h) => h.regla);
}

test('los mensajes normales del bot pasan limpios', () => {
  const normales = [
    '¡Hola! 😊 Soy de CityCred. ¿En qué fuerza prestás servicio?',
    'Registré tu cupo de $200.000. Elegí el plazo que más te convenga:',
    'Elegiste 36 cuotas de $18.500. Recibís $420.000 en mano.',
    'Pedí el certificado de afectación en RRHH de tu unidad. Código: 400571 | Entidad: AMFAYS',
    'Gracias, recibí el archivo. Ahí lo reviso. 😊',
    // Pedirle SUS datos al cliente es parte del trámite y no se marca.
    '¡Perfecto, ya está autorizado! Necesito DNI de ambos lados y captura del CBU de tu cuenta sueldo.'
  ];
  for (const texto of normales) {
    const r = analizarBlindaje(texto);
    assert.equal(r.nivel, 'SEGURO', `falso positivo en: ${texto}\n${JSON.stringify(r.hallazgos)}`);
  }
});

test('frena el mensaje que promete aprobación o "sin veraz"', () => {
  const r = analizarBlindaje('CREDITO APROBADO GARANTIZADO sin veraz, plata ya!!!');
  assert.equal(r.nivel, 'RIESGO_ALTO');
  assert.equal(bloqueaEnvioAutomatico(r), true);
  const encontradas = r.hallazgos.map((h) => h.regla);
  assert.ok(encontradas.includes('Menciona el Veraz como gancho'));
  assert.ok(encontradas.includes('Promete la aprobación'));
  assert.ok(encontradas.includes('Escrito en mayúsculas'));
});

test('frena el pedido de claves, que es lo que más rápido suspende una cuenta', () => {
  const r = analizarBlindaje('Mandame tu clave del home banking para acreditarte');
  assert.equal(r.nivel, 'RIESGO_ALTO');
  assert.ok(reglas('Mandame tu clave del home banking').includes('Pide una clave o código'));
});

test('frena las amenazas de cobranza', () => {
  const r = analizarBlindaje('Si no pagás hoy te mando el embargo con el abogado.');
  assert.equal(bloqueaEnvioAutomatico(r), true);
  assert.ok(r.hallazgos.some((h) => h.regla === 'Amenaza de cobranza'));
});

test('detecta links acortados', () => {
  assert.ok(reglas('Entrá acá https://bit.ly/abc123').includes('Link acortado'));
  // El link completo del portal oficial NO es un problema.
  assert.ok(!reglas('Entrá a haberes20.cge.mil.ar/Prestamos/').includes('Link acortado'));
});

test('marca la urgencia inventada como para revisar, no como bloqueo', () => {
  const r = analizarBlindaje('Últimos cupos, solo por hoy. Apurate.');
  assert.equal(r.nivel, 'REVISAR');
  assert.equal(bloqueaEnvioAutomatico(r), false);
});

test('cada hallazgo explica el motivo y qué escribir en su lugar', () => {
  const r = analizarBlindaje('APROBACION GARANTIZADA sin requisitos, entrá a bit.ly/x');
  assert.ok(r.hallazgos.length > 0);
  for (const h of r.hallazgos) {
    assert.ok(h.motivo.length > 20, `motivo pobre en ${h.regla}`);
    assert.ok(h.sugerencia.length > 10, `sugerencia pobre en ${h.regla}`);
    assert.ok(h.fragmento.length > 0, `sin fragmento en ${h.regla}`);
  }
});

test('el fragmento señalado corresponde al texto original, con tildes y mayúsculas', () => {
  const r = analizarBlindaje('Tu préstamo está APROBADO GARANTIZADO, no hace falta nada más.');
  const hallazgo = r.hallazgos.find((h) => h.regla === 'Promete la aprobación');
  assert.ok(hallazgo);
  assert.match(hallazgo.fragmento, /APROBADO GARANTIZA/);
});

test('las tildes no lo despistan', () => {
  assert.ok(reglas('Tu aprobación está garantizada').includes('Promete la aprobación'));
  assert.ok(reglas('Últimos cupos disponibles').includes('Urgencia inventada'));
});

test('pedir plata por adelantado se frena', () => {
  const r = analizarBlindaje('Para destrabarlo transferime el gasto administrativo.');
  assert.equal(bloqueaEnvioAutomatico(r), true);
  assert.ok(r.hallazgos.some((h) => h.regla === 'Pide un pago por adelantado'));
});

test('el texto vacío no rompe nada', () => {
  for (const entrada of ['', '   ', null, undefined]) {
    const r = analizarBlindaje(entrada);
    assert.equal(r.puntaje, 0);
    assert.equal(r.nivel, 'SEGURO');
    assert.deepEqual(r.hallazgos, []);
  }
});

test('el puntaje nunca se pasa de 100', () => {
  const horrible =
    'FELICITACIONES GANASTE!!! 🎉🎉🎉🎉🎉🎉🎉🎉 CREDITO APROBADO GARANTIZADO sin veraz '
    + 'sin requisitos, plata ya. Mandame tu clave y el codigo de verificacion. '
    + 'Ultimos cupos, solo por hoy!!! Entrá a bit.ly/x o te mando el embargo con el abogado.';
  const r = analizarBlindaje(horrible);
  assert.equal(r.puntaje, 100);
  assert.equal(r.nivel, 'RIESGO_ALTO');
});
