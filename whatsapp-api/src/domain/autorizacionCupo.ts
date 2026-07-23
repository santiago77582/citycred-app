import type { BotEntity } from '../bot/citycredBotEngineV2.js';

/**
 * Instrucciones para que el cliente autorice su CUPO DE AFECTACIÓN.
 *
 * Se envían DESPUÉS de que el cliente eligió su plazo en el desplegable.
 * Regla de Santiago: hasta acá NO se le pide ningún dato personal. La
 * documentación (DNI, CBU, etc.) se pide recién cuando vuelve con el
 * certificado autorizado.
 *
 * Datos operativos de CityCred: entidad AMFAYS, código 400571 (Decreto 14/12).
 */

export const CODIGO_AMFAYS = '400571';
export const ENTIDAD_AMFAYS = 'AMFAYS';

const EJERCITO = [
  'Para tramitarlo, entrá a Haberes 2.0:',
  '🔗 haberes20.cge.mil.ar/Prestamos/',
  '',
  '1️⃣ Entidad: *ASOCIACION MUTUAL DE LAS FF AA Y SEGURIDAD*',
  '2️⃣ Tipo de préstamo: *PRÉSTAMO DINERARIO*',
  '3️⃣ Importe total deseado: el monto que elegiste',
  '4️⃣ Guardá y enviá a la UHL',
  '',
  '⚠️ Cuando te llegue la propuesta de AMFAYS tenés que hacer *dos cosas*: '
    + 'firmar el contrato Y aceptar la propuesta en Haberes 2.0. Sin las dos, no avanza.',
  '',
  'Cuando esté listo, avisame. 😊'
].join('\n');

const ARMADA = [
  'Para generar la afectación entrá al portal SIAF de la Armada:',
  '🔗 siaf.armada.mil.ar',
  '',
  '1️⃣ Iniciá sesión',
  '2️⃣ Andá a *Monto de afectación*',
  '3️⃣ Clic en *Solicitar certificado*',
  `4️⃣ Entidad descontante: *${ENTIDAD_AMFAYS}* — Código *${CODIGO_AMFAYS}*`,
  '5️⃣ Confirmá la solicitud',
  '',
  'El certificado queda como *PENDIENTE* hasta que lo aprueben. '
    + 'Cuando cambie, descargalo y mandámelo. 😊'
].join('\n');

const GENDARMERIA = [
  'Pedí el *certificado de afectación* a la UTAC con estos datos:',
  '',
  `📋 Código: *${CODIGO_AMFAYS}*  |  Entidad: *${ENTIDAD_AMFAYS}*`,
  '📩 ESC44-SAFD@gendarmeria.gob.ar',
  '📩 SAFD-DESTMOV1@gendarmeria.gob.ar',
  '',
  'Puede demorar, así que pedilo cuanto antes. Cuando tengas el número, mandámelo. 😊'
].join('\n');

const PREFECTURA = [
  'Pedí el *certificado de afectación* en RRHH o administración de tu unidad:',
  '',
  `📋 Código: *${CODIGO_AMFAYS}*  |  Entidad: *${ENTIDAD_AMFAYS}*`,
  '',
  'Cuando tengas el número, mandámelo. 😊'
].join('\n');

const POR_FUERZA: Partial<Record<BotEntity, string>> = {
  'Ejército': EJERCITO,
  'Armada': ARMADA,
  'Gendarmería': GENDARMERIA,
  'Prefectura': PREFECTURA
};

/** Instrucciones de autorización para la fuerza del cliente, o `null`. */
export function instruccionesAutorizacion(entity: string | null): string | null {
  if (!entity) return null;
  return POR_FUERZA[entity as BotEntity] ?? null;
}

/**
 * Documentación que se pide SOLO cuando el cupo ya está autorizado.
 * Nunca antes: pedir datos de entrada espanta al cliente.
 */
export const DOCUMENTACION_AUTORIZADO = [
  '¡Perfecto, ya está autorizado! 🎉 Para terminar necesito:',
  '',
  '✅ DNI de ambos lados',
  `✅ Certificado de descuento (${ENTIDAD_AMFAYS})`,
  '✅ Captura del CBU de tu cuenta sueldo',
  '✅ Correo electrónico y teléfono'
].join('\n');

/** Cierre cuando ya mandó todo. */
export const CIERRE_DOCUMENTACION =
  '¡Listo, recibí todo! 😊 Un asesor te contacta para terminar de cargar tu crédito. Gracias.';
