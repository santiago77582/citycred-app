/**
 * BLINDAJE: analiza un texto antes de que salga por WhatsApp y avisa qué puede
 * costarle calidad, bloqueos o la insignia verde a la cuenta.
 *
 * Prioridad #1 de Santiago: no perder la insignia. Meta baja la calidad cuando
 * los mensajes generan reportes o bloqueos, y los que más los generan son
 * siempre los mismos: promesas de plata fácil, urgencia inventada, gritos en
 * mayúscula, links acortados y pedidos de claves.
 *
 * Es DETERMINISTA a propósito, igual que `actividadNoAdmitida`: la protección
 * de la cuenta no puede depender de que un modelo esté de buen humor, ni de que
 * haya crédito en el proveedor de IA. Son reglas, funcionan siempre y offline.
 */

export type Gravedad = 'ALTA' | 'MEDIA' | 'BAJA';

export type Hallazgo = {
  /** Etiqueta corta, p. ej. "Promesa de aprobación". */
  regla: string;
  gravedad: Gravedad;
  /** Fragmento del texto original que disparó la regla. */
  fragmento: string;
  /** Por qué es un problema para la cuenta. */
  motivo: string;
  /** Qué escribir en su lugar. */
  sugerencia: string;
};

export type NivelBlindaje = 'SEGURO' | 'REVISAR' | 'RIESGO_ALTO';

export type ResultadoBlindaje = {
  /** 0 = impecable, 100 = no lo mandes. */
  puntaje: number;
  nivel: NivelBlindaje;
  hallazgos: Hallazgo[];
  /** Una línea para mostrar en el panel. */
  resumen: string;
};

/** Cuánto suma cada hallazgo al puntaje de riesgo. */
const PESO: Record<Gravedad, number> = { ALTA: 35, MEDIA: 15, BAJA: 6 };

function normalizar(value: string): string {
  // NFD + quitar diacríticos no cambia la cantidad de caracteres del resultado,
  // así que los índices siguen sirviendo para recortar el texto original.
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

type Regla = {
  patron: RegExp;
  regla: string;
  gravedad: Gravedad;
  motivo: string;
  sugerencia: string;
};

/**
 * Se evalúan en orden y cada regla reporta una sola vez, aunque el texto la
 * repita: interesa el tipo de problema, no cuántas veces aparece.
 */
const REGLAS: Regla[] = [
  // ---------------------------------------------------------------- CRÍTICO
  {
    patron: /\b(clave|contrasen[ao]|password|pin|token|codigo de (verificacion|seguridad)|clave fiscal|home ?banking)\b/,
    regla: 'Pide una clave o código',
    gravedad: 'ALTA',
    motivo:
      'Pedir claves o códigos por WhatsApp es el patrón exacto de una estafa. '
      + 'Es la causa número uno de reportes y de suspensión de cuentas.',
    sugerencia: 'Nunca pidas claves ni códigos por chat. Los datos sensibles se cargan en el sistema oficial de la fuerza.'
  },
  {
    patron: /\bsin veraz\b|\bno importa el veraz\b|aunque estes en el veraz|con veraz|estando en el veraz|sin bcra|\bno miramos (el )?veraz\b/,
    regla: 'Menciona el Veraz como gancho',
    gravedad: 'ALTA',
    motivo:
      'Meta lo lee como oferta de crédito predatorio. Es una de las frases que '
      + 'más rápido baja la calidad de una cuenta financiera.',
    sugerencia: 'No hables del Veraz. Decí simplemente que el crédito se descuenta por haberes.'
  },
  {
    // Se tolera alguna palabra en el medio: "tu aprobación *está* garantizada".
    patron: /\b(aprobacion|aprobado|credito|prestamo)\b[^.!?\n]{0,15}\b(garantizad[oa]s?|asegurad[oa]s?|100 ?%|segur[oa]s?)\b|\bte lo apruebo\b|\baprobacion inmediata\b|\bsin rechazo\b|\bnadie queda afuera\b/,
    regla: 'Promete la aprobación',
    gravedad: 'ALTA',
    motivo:
      'Prometer una aprobación que después no se cumple genera reclamos y '
      + 'reportes del cliente. Además ninguna aprobación es automática.',
    sugerencia: 'Decí "sujeto a tu cupo de afectación disponible" en vez de prometer.'
  },
  {
    patron: /\bsin requisitos\b|\bsin papeles\b|\bsin tramites\b|\bsolo con el dni\b|\bsin recibo de sueldo\b/,
    regla: 'Promete "sin requisitos"',
    gravedad: 'ALTA',
    motivo: 'Es la firma clásica de una estafa de préstamos. Meta la tiene marcada.',
    sugerencia: 'Explicá el trámite real: certificado de afectación, DNI y CBU.'
  },
  {
    patron: /\bplata (facil|ya|al toque)\b|\bdinero (facil|urgente|ya)\b|\bcash\b|\befectivo ya\b|\bhaceme caso\b/,
    regla: 'Lenguaje de "plata fácil"',
    gravedad: 'ALTA',
    motivo: 'Meta clasifica estas frases como oferta financiera engañosa.',
    sugerencia: 'Hablá de "acreditación en 24 hs", que es concreto y verificable.'
  },
  {
    patron: /\b(embargo|embargar|te embargo|abogado|estudio juridico|demanda|denuncia penal|ejecucion judicial|te informamos al veraz|figuras en el veraz)\b/,
    regla: 'Amenaza de cobranza',
    gravedad: 'ALTA',
    motivo:
      'El lenguaje intimidatorio en cobranzas dispara reportes por acoso y es '
      + 'motivo directo de suspensión, además del riesgo legal.',
    sugerencia: 'Escribí en tono neutro: "te escribo para coordinar la regularización de tu cuota".'
  },
  {
    patron: /(bit\.ly|tinyurl|cutt\.ly|acortar|shorturl|is\.gd|t\.co\/|goo\.gl|rebrand\.ly|\bwa\.link\b)/,
    regla: 'Link acortado',
    gravedad: 'ALTA',
    motivo:
      'Los acortadores esconden el destino real. Meta los penaliza fuerte '
      + 'porque son el vehículo habitual del phishing.',
    sugerencia: 'Pegá el link completo y visible (por ejemplo el portal oficial de la fuerza).'
  },

  // ------------------------------------------------------------------ MEDIO
  {
    patron: /\bultim[oa]s? (dia|dias|horas|cupos|lugares)\b|\bsolo por hoy\b|\bpor tiempo limitado\b|\bse termina\b|\bno te lo pierdas\b|\bapurate\b|\bultima oportunidad\b|\bcorre\b/,
    regla: 'Urgencia inventada',
    gravedad: 'MEDIA',
    motivo: 'La presión artificial es de los principales motivos por los que la gente reporta un chat.',
    sugerencia: 'Si hay una fecha real, decila. Si no la hay, no inventes apuro.'
  },
  {
    patron: /\bfelicitaciones\b|\bganaste\b|\bsos el ganador\b|\bfuiste seleccionad[oa]\b|\bpremio\b|\bsorteo\b/,
    regla: 'Falso premio o selección',
    gravedad: 'MEDIA',
    motivo: 'Es el arranque típico de una estafa; genera bloqueos inmediatos.',
    sugerencia: 'Presentate diciendo quién sos y por qué le escribís.'
  },
  {
    patron: /\btasa (0|cero)\b|\bsin interes\b|\bsin costo\b|\bgratis\b|\bregalo\b/,
    regla: 'Promete costo cero',
    gravedad: 'MEDIA',
    motivo: 'Si el producto tiene costo, afirmar lo contrario genera reclamos por publicidad engañosa.',
    sugerencia: 'Mostrá la cuota real de la grilla; eso vende solo y es verdad.'
  },
  {
    patron: /\bhola\b.{0,40}\b(oferta|promo|promocion|oportunidad)\b|\bte escribo de parte de\b/,
    regla: 'Apertura publicitaria en frío',
    gravedad: 'MEDIA',
    motivo:
      'Abrir con publicidad a alguien que no te escribió primero es lo que más '
      + 'bloqueos genera, y los bloqueos son lo que te baja la calidad.',
    sugerencia: 'Abrí identificándote y preguntando, no ofertando.'
  },
  {
    // Ojo: pedirle SU CBU al cliente es legítimo y NO se marca. Lo que se marca
    // es pedirle que él mande plata, que es el patrón del cuento del tío.
    patron: /\bgasto administrativo\b|\bsellado\b|\barancel\b|\bsen[ae] de dinero\b|\btransferi(me|s)?\b|\bdeposita(me|r)?\b|\bpor adelantado\b|\babonar (un|el)\b/,
    regla: 'Pide un pago por adelantado',
    gravedad: 'ALTA',
    motivo:
      'Pedirle plata al cliente antes de darle el crédito es el patrón exacto '
      + 'del cuento del tío. Genera denuncias y baja la cuenta.',
    sugerencia: 'CityCred no cobra nada por adelantado: no menciones pagos previos.'
  },

  // ------------------------------------------------------------------- BAJO
  {
    patron: /\bwhatsapp\b.{0,20}\b(otro|alternativo|nuevo numero)\b|\bescribime a este otro numero\b/,
    regla: 'Deriva a otro número',
    gravedad: 'BAJA',
    motivo: 'Mover la charla a otro número es señal de evasión para Meta.',
    sugerencia: 'Atendé todo desde el número oficial.'
  }
];

/** Detecta gritos: bloques largos en mayúscula sostenida. */
function gritaEnMayusculas(texto: string): string | null {
  const bloque = texto.match(/[A-ZÁÉÍÓÚÑ]{2,}(?:[\s,.!¡]+[A-ZÁÉÍÓÚÑ]{2,}){2,}/);
  if (bloque) return bloque[0].trim();

  const letras = texto.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ]/g, '');
  if (letras.length >= 30) {
    const mayus = letras.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length;
    if (mayus / letras.length > 0.6) return texto.slice(0, 40).trim();
  }
  return null;
}

function contarEmojis(texto: string): number {
  return (texto.match(/\p{Extended_Pictographic}/gu) ?? []).length;
}

/** Recorta el fragmento para mostrarlo en el panel sin desarmar la fila. */
function recortar(fragmento: string): string {
  const limpio = fragmento.replace(/\s+/g, ' ').trim();
  return limpio.length > 60 ? `${limpio.slice(0, 57)}…` : limpio;
}

/**
 * Analiza un texto y devuelve su riesgo para la cuenta.
 * Nunca lanza: un texto vacío es simplemente SEGURO con puntaje 0.
 */
export function analizarBlindaje(texto: string | null | undefined): ResultadoBlindaje {
  const original = (texto ?? '').trim();
  const hallazgos: Hallazgo[] = [];

  if (!original) {
    return { puntaje: 0, nivel: 'SEGURO', hallazgos: [], resumen: 'No hay texto para analizar.' };
  }

  const plano = normalizar(original);

  for (const regla of REGLAS) {
    const coincidencia = plano.match(regla.patron);
    if (!coincidencia) continue;
    // El índice de la versión normalizada coincide con la original: normalizar
    // no cambia la cantidad de caracteres (solo saca tildes y baja mayúsculas).
    const desde = coincidencia.index ?? 0;
    hallazgos.push({
      regla: regla.regla,
      gravedad: regla.gravedad,
      fragmento: recortar(original.slice(desde, desde + coincidencia[0].length)),
      motivo: regla.motivo,
      sugerencia: regla.sugerencia
    });
  }

  const grito = gritaEnMayusculas(original);
  if (grito) {
    hallazgos.push({
      regla: 'Escrito en mayúsculas',
      gravedad: 'MEDIA',
      fragmento: recortar(grito),
      motivo: 'En WhatsApp las mayúsculas se leen como grito y son marca registrada del spam.',
      sugerencia: 'Escribilo normal. Para resaltar usá *negrita* con asteriscos.'
    });
  }

  const emojis = contarEmojis(original);
  if (emojis > 6) {
    hallazgos.push({
      regla: 'Demasiados emojis',
      gravedad: 'BAJA',
      fragmento: `${emojis} emojis`,
      motivo: 'El exceso de emojis es un indicador de mensaje promocional masivo.',
      sugerencia: 'Dejá 2 o 3 como mucho.'
    });
  }

  if (/[!¡]{2,}|\?{2,}/.test(original)) {
    hallazgos.push({
      regla: 'Signos repetidos',
      gravedad: 'BAJA',
      fragmento: recortar(original.match(/[!¡]{2,}|\?{2,}/)?.[0] ?? ''),
      motivo: 'Los "!!!" son otra señal clásica de spam.',
      sugerencia: 'Usá un solo signo.'
    });
  }

  if (original.length > 900) {
    hallazgos.push({
      regla: 'Mensaje demasiado largo',
      gravedad: 'BAJA',
      fragmento: `${original.length} caracteres`,
      motivo: 'Los mensajes muy largos se leen menos y se reportan más.',
      sugerencia: 'Partilo en dos o tres mensajes cortos.'
    });
  }

  const puntaje = Math.min(100, hallazgos.reduce((total, h) => total + PESO[h.gravedad], 0));
  // Un solo hallazgo grave ya alcanza para frenar el envío: no hace falta que
  // se acumulen varios. "Mandame tu clave" solo, sin nada más, ya es motivo de
  // suspensión.
  const hayGrave = hallazgos.some((h) => h.gravedad === 'ALTA');
  const nivel: NivelBlindaje =
    hayGrave || puntaje >= 50 ? 'RIESGO_ALTO' : puntaje >= PESO.MEDIA ? 'REVISAR' : 'SEGURO';

  const resumen =
    nivel === 'SEGURO'
      ? hallazgos.length === 0
        ? 'Listo para enviar. No se detectaron riesgos.'
        : `Se puede enviar. ${hallazgos.length} detalle(s) menor(es) para pulir.`
      : nivel === 'REVISAR'
        ? `Conviene corregir ${hallazgos.length} punto(s) antes de enviar.`
        : `No lo envíes así: ${hallazgos.length} problema(s) que pueden costarte la cuenta.`;

  return { puntaje, nivel, hallazgos, resumen };
}

/** `true` cuando el texto NO debería salir automáticamente sin que lo vea una persona. */
export function bloqueaEnvioAutomatico(resultado: ResultadoBlindaje): boolean {
  return resultado.nivel === 'RIESGO_ALTO';
}
