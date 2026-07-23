import { detectarActividadNoAdmitida, MOTIVO_ESTANDAR } from '../domain/actividadNoAdmitida.js';
import { askJson, type AiFailure } from './openaiClient.js';

/**
 * Entiende un mensaje libre (escrito o transcripto de un audio) y saca de ahí
 * la fuerza, la situación de revista, la antigüedad y el cupo.
 *
 * ORDEN DE AUTORIDAD (regla de Santiago):
 *   1. Las REGLAS deterministas deciden si la persona califica o no.
 *   2. La IA solo AYUDA a entender mensajes desordenados, con errores o sueltos.
 *
 * La IA nunca decide aprobación, monto, cuota, tasa ni cupo: eso sale de las
 * grillas y las reglas. Si la IA falla, se devuelve un resultado vacío y el bot
 * sigue con su flujo de siempre.
 */

export type FuerzaAdmitida = 'EJERCITO' | 'ARMADA' | 'GENDARMERIA' | 'PREFECTURA';

export type Clasificacion = {
  fuerza: FuerzaAdmitida | null;
  /** Etiqueta de la actividad cuando NO califica (p. ej. "Policía de Río Negro"). */
  actividadNoAdmitida: string | null;
  situacion: 'CAREER' | 'VOLUNTEER' | null;
  antiguedadAnios: number | null;
  cupo: number | null;
  /** 0 a 1. Por debajo de 0.6 se considera dudoso y se repregunta. */
  confianza: number;
  /** De dónde salió: las reglas o la IA. */
  origen: 'REGLAS' | 'IA' | 'NINGUNO';
  fallaIa?: AiFailure;
};

const VACIA: Clasificacion = {
  fuerza: null, actividadNoAdmitida: null, situacion: null,
  antiguedadAnios: null, cupo: null, confianza: 0, origen: 'NINGUNO'
};

const SYSTEM = [
  'Sos un clasificador de mensajes de clientes de CityCred, una financiera argentina.',
  'CityCred SOLO atiende personal de: Ejército, Armada, Gendarmería y Prefectura.',
  'NO atiende: policías (federal, provinciales, bonaerense, Río Negro), Fuerza Aérea,',
  'Servicio Penitenciario, empleados públicos, docentes, municipales, personal de salud',
  'provincial, jubilados, pensionados, monotributistas ni empleados de empresas privadas.',
  '',
  'Devolvé SOLO un JSON con esta forma exacta:',
  '{"fuerza": "EJERCITO"|"ARMADA"|"GENDARMERIA"|"PREFECTURA"|null,',
  ' "actividad_no_admitida": string|null,',
  ' "situacion": "CAREER"|"VOLUNTEER"|null,',
  ' "antiguedad_anios": number|null,',
  ' "cupo": number|null,',
  ' "confianza": number}',
  '',
  'Reglas estrictas:',
  '- "marino" o "marina" = ARMADA. "gendarme" = GENDARMERIA. "PNA" o "prefectura" = PREFECTURA.',
  '- Una policía provincial NUNCA es Gendarmería ni Prefectura.',
  '- Fuerza Aérea NUNCA es Ejército.',
  '- "trabajo para la provincia" NO es una fuerza: es empleo público.',
  '- Si no estás seguro, poné null y confianza baja. NO inventes.',
  '- "de carrera" = CAREER. "voluntario" = VOLUNTEER.',
  '- cupo es el monto mensual disponible que menciona la persona, en pesos, sin símbolos.',
  '- confianza: 1 si lo dijo explícito, 0.5 si es ambiguo, 0 si no hay dato.'
].join('\n');

function normalizarFuerza(value: unknown): FuerzaAdmitida | null {
  const v = String(value ?? '').toUpperCase();
  return v === 'EJERCITO' || v === 'ARMADA' || v === 'GENDARMERIA' || v === 'PREFECTURA'
    ? v
    : null;
}

function numeroONull(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Clasifica un mensaje. Primero las reglas; la IA solo si las reglas no
 * encontraron una actividad no admitida.
 */
export async function clasificarMensaje(texto: string | null | undefined): Promise<Clasificacion> {
  const limpio = (texto ?? '').trim();
  if (!limpio) return VACIA;

  // 1) Las reglas tienen la última palabra sobre el descarte.
  const porReglas = detectarActividadNoAdmitida(limpio);
  if (porReglas) {
    return {
      ...VACIA,
      actividadNoAdmitida: porReglas.actividad,
      confianza: 1,
      origen: 'REGLAS'
    };
  }

  // 2) La IA ayuda a entender lo que las reglas no pudieron.
  const respuesta = await askJson({ system: SYSTEM, user: limpio, maxTokens: 200 });
  if (!respuesta.ok) return { ...VACIA, fallaIa: respuesta.failure };

  const d = respuesta.value;
  const actividad = typeof d.actividad_no_admitida === 'string' && d.actividad_no_admitida.trim()
    ? d.actividad_no_admitida.trim()
    : null;
  const situacionRaw = String(d.situacion ?? '').toUpperCase();

  return {
    fuerza: normalizarFuerza(d.fuerza),
    actividadNoAdmitida: actividad,
    situacion: situacionRaw === 'CAREER' || situacionRaw === 'VOLUNTEER' ? situacionRaw : null,
    antiguedadAnios: numeroONull(d.antiguedad_anios),
    cupo: numeroONull(d.cupo),
    confianza: Math.max(0, Math.min(1, numeroONull(d.confianza) ?? 0)),
    origen: 'IA'
  };
}

/** Motivo estándar de descarte, para registrar en el CRM. */
export { MOTIVO_ESTANDAR };

/** Umbral por debajo del cual NO se decide solo: se repregunta o deriva. */
export const CONFIANZA_MINIMA = 0.6;

export function esDudoso(c: Clasificacion): boolean {
  if (c.origen === 'REGLAS') return false;
  if (c.actividadNoAdmitida) return c.confianza < CONFIANZA_MINIMA;
  if (c.fuerza) return c.confianza < CONFIANZA_MINIMA;
  return true;
}
