/**
 * Filtro de actividades que CityCred NO atiende por este canal.
 *
 * Regla comercial de Santiago: se atiende ÚNICAMENTE a personal de
 * Ejército, Armada, Gendarmería y Prefectura.
 *
 * Este filtro es DETERMINISTA a propósito: decidir a quién se le presta plata
 * no puede depender de que un modelo "interprete bien". La IA sirve para
 * entender mensajes desordenados, pero el descarte se resuelve con reglas.
 */

export type ActividadNoAdmitida = {
  /** Etiqueta para el CRM, p. ej. "Policía de Río Negro". */
  actividad: string;
  /** Motivo del descarte, en texto legible. */
  motivo: string;
};

export const MOTIVO_ESTANDAR =
  'CityCred solamente atiende Ejército, Armada, Gendarmería y Prefectura.';

function normalizar(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cada regla se evalúa en orden. Las más específicas van primero para que
 * "policía de Río Negro" no quede etiquetada como "policía provincial" genérica.
 */
const REGLAS: Array<{ patron: RegExp; actividad: string }> = [
  // --- Policías ---
  { patron: /policia federal|\bpfa\b|federal argentina/, actividad: 'Policía Federal' },
  { patron: /policia de rio negro|policia rionegrina|policia de r n\b/, actividad: 'Policía de Río Negro' },
  {
    patron: /policia (de la provincia de )?buenos aires|policia bonaerense|bonaerense/,
    actividad: 'Policía de Buenos Aires'
  },
  { patron: /policia de seguridad aeroportuaria|\bpsa\b/, actividad: 'Policía de Seguridad Aeroportuaria' },
  {
    patron: /policia (de la )?provincia|policia provincial|policia local|policia comunal|policia de (santa fe|cordoba|mendoza|neuquen|chubut|salta|corrientes|misiones|entre rios|la pampa|san juan|san luis|jujuy|tucuman|formosa|chaco|catamarca|la rioja|santiago del estero|santa cruz|tierra del fuego)/,
    actividad: 'Policía provincial'
  },
  // "soy policia" a secas, cuando no se aclaró ninguna fuerza admitida.
  { patron: /\bpolicia\b|\bpoli\b|\bcana\b/, actividad: 'Policía (sin especificar)' },

  // --- Otras fuerzas u organismos no admitidos ---
  { patron: /fuerza aerea|\bfaa\b|aeronautica/, actividad: 'Fuerza Aérea' },
  {
    patron: /servicio penitenciario|penitenciari|\bspf\b|guardia carcel/,
    actividad: 'Servicio Penitenciario'
  },

  // --- Empleo público y afines ---
  {
    patron: /emplead[oa] public[oa]|provincia de rio negro|gobierno de rio negro|educacion rn|administracion publica|estatal/,
    actividad: 'Empleado público'
  },
  { patron: /\bdocente\b|maestr[oa]|profesor|escuela|\bcpe\b/, actividad: 'Docente' },
  { patron: /municipal|municipio|\bcomuna\b/, actividad: 'Municipal' },
  {
    patron: /hospital|enfermer|salud publica|ministerio de salud|sanidad provincial/,
    actividad: 'Personal de salud provincial'
  },

  // --- Situaciones laborales no admitidas ---
  { patron: /jubilad|pensionad|retirad[oa]|\banses\b/, actividad: 'Jubilado o pensionado' },
  { patron: /monotributist|monotributo|autonom[oa]|cuenta propia/, actividad: 'Monotributista' },
  {
    patron: /empresa privada|sector privado|trabajo en una empresa|empleado privado|relacion de dependencia privada/,
    actividad: 'Empresa privada'
  }
];

/** Fuerzas que SÍ atiende CityCred. Si el texto menciona una, no se descarta a ciegas. */
const ADMITIDAS = /\bejercito\b|\barmada\b|\bgendarmeria\b|\bgna\b|\bprefectura\b|\bpna\b|\bmarino\b|\bgendarme\b/;

/**
 * Detecta una actividad no admitida en el texto del cliente.
 * Devuelve `null` si no encuentra ninguna.
 */
export function detectarActividadNoAdmitida(texto: string | null | undefined): ActividadNoAdmitida | null {
  const t = normalizar(texto);
  if (!t) return null;

  for (const regla of REGLAS) {
    if (regla.patron.test(t)) {
      return { actividad: regla.actividad, motivo: MOTIVO_ESTANDAR };
    }
  }
  return null;
}

/**
 * `true` cuando el texto menciona a la vez una fuerza admitida y una actividad
 * que no lo está (por ejemplo, "soy de prefectura pero trabajo en el municipio").
 * Esos casos NO se descartan solos: los revisa una persona.
 */
export function hayContradiccion(texto: string | null | undefined): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  return ADMITIDAS.test(t) && detectarActividadNoAdmitida(t) !== null;
}

/** Mensaje breve y respetuoso para el cliente que no califica. */
export const MENSAJE_NO_ADMITIDA =
  'Gracias por comunicarte. Actualmente trabajamos únicamente con personal de '
  + 'Ejército, Armada, Gendarmería y Prefectura, por lo que por el momento no '
  + 'contamos con una línea disponible para tu actividad.';
