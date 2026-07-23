import { quoteListForQuota, quoteOptionsForQuota } from '../quotes/botQuote.js';
import { CIERRE_DOCUMENTACION, DOCUMENTACION_AUTORIZADO, instruccionesAutorizacion } from '../domain/autorizacionCupo.js';
import { detectarActividadNoAdmitida, hayContradiccion, MENSAJE_NO_ADMITIDA } from '../domain/actividadNoAdmitida.js';

export type BotStage =
  | 'START'
  | 'WAIT_ENTITY'
  | 'WAIT_PERSONNEL_TYPE'
  | 'WAIT_SENIORITY'
  | 'WAIT_QUOTA'
  | 'WAIT_QUOTE_CHOICE'
  | 'WAIT_AUTHORIZATION'
  | 'WAIT_IDENTITY'
  | 'WAIT_DOCUMENTS'
  | 'HANDOFF'
  | 'NO_QUOTA'
  | 'OUT_OF_SCOPE'
  | 'CLOSED';

export type BotEntity =
  | 'Ejército'
  | 'Armada'
  | 'Fuerza Aérea'
  | 'Gendarmería'
  | 'Prefectura'
  | 'Empleado Público de Río Negro'
  | 'Otra entidad';

export type BotResponse =
  | { kind: 'text'; body: string }
  | { kind: 'buttons'; body: string; buttons: Array<{ id: string; title: string }> }
  | {
      kind: 'list';
      body: string;
      button: string;
      sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    };

export type BotContactState = {
  stage: BotStage;
  entity: string | null;
  personnelType: string | null;
  seniorityRange: string | null;
  availableQuota: number | null;
  profileName: string | null;
  documentNumber: string | null;
  commercialStatus: string;
  context: Record<string, unknown>;
};

export type BotInbound = {
  text: string | null;
  interactiveId?: string | null;
  messageType?: string | null;
  hasMedia?: boolean;
};

export type BotDecision = {
  nextStage: BotStage;
  response: BotResponse | null;
  patch: {
    entity?: BotEntity;
    personnelType?: 'VOLUNTEER' | 'CAREER';
    seniorityRange?: 'LESS_THAN_1_YEAR' | 'ONE_YEAR_OR_MORE';
    availableQuota?: number;
    profileName?: string;
    documentNumber?: string;
    commercialStatus?: string;
    context?: Record<string, unknown>;
    handoffReason?: string | null;
  };
  reason: string;
  scheduleFollowups: boolean;
};

const ENTITY_IDS: Record<string, BotEntity> = {
  'entity:army': 'Ejército',
  'entity:navy': 'Armada',
  'entity:air_force': 'Fuerza Aérea',
  'entity:gendarmerie': 'Gendarmería',
  'entity:coast_guard': 'Prefectura',
  'entity:public_rn': 'Empleado Público de Río Negro',
  'entity:other': 'Otra entidad'
};

function norm(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9@.$\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function entityFrom(input: BotInbound): BotEntity | null {
  if (input.interactiveId && ENTITY_IDS[input.interactiveId]) {
    return ENTITY_IDS[input.interactiveId] ?? null;
  }
  const text = norm(input.text);
  // Se aceptan las formas que usa la gente: "soy marino", "soy gendarme",
  // "GNA", "PNA", con o sin tilde. Sin esto, un cliente valido quedaba sin
  // identificar y el bot le volvia a preguntar lo mismo.
  if (/\bejercito\b|\bejercit/.test(text)) return 'Ejército';
  if (/\barmada\b|\bmarina\b|\bmarino\b|\bmarinero\b/.test(text)) return 'Armada';
  if (/fuerza aerea|\bfaa\b/.test(text)) return 'Fuerza Aérea';
  if (/gendarmer|\bgendarme\b|\bgna\b/.test(text)) return 'Gendarmería';
  if (/prefectura|\bprefecto\b|\bpna\b/.test(text)) return 'Prefectura';
  if (/emplead[oa] public[oa]|provincia de rio negro|gobierno de rio negro|educacion rn/.test(text)) {
    return 'Empleado Público de Río Negro';
  }
  if (/otra entidad|otro trabajo|ninguna de esas/.test(text)) return 'Otra entidad';
  return null;
}

function personnelFrom(input: BotInbound): 'VOLUNTEER' | 'CAREER' | null {
  if (input.interactiveId === 'personnel:volunteer') return 'VOLUNTEER';
  if (input.interactiveId === 'personnel:career') return 'CAREER';
  const text = norm(input.text);
  if (/voluntari[oa]|tropa voluntaria/.test(text)) return 'VOLUNTEER';
  if (/carrera|cuadro permanente|suboficial|oficial/.test(text)) return 'CAREER';
  return null;
}

function seniorityFrom(input: BotInbound): 'LESS_THAN_1_YEAR' | 'ONE_YEAR_OR_MORE' | null {
  if (input.interactiveId === 'seniority:less_1') return 'LESS_THAN_1_YEAR';
  if (input.interactiveId === 'seniority:one_plus') return 'ONE_YEAR_OR_MORE';
  const text = norm(input.text);
  if (/menos de (un|1) ano|0 a 1 ano|pocos meses|\bmeses\b|recien ingrese|recien entre/.test(text)) {
    return 'LESS_THAN_1_YEAR';
  }
  if (/(1|un) ano o mas|mas de (un|1) ano|[2-9]\s*anos|\d{2}\s*anos/.test(text)) {
    return 'ONE_YEAR_OR_MORE';
  }
  return null;
}

function quotaFrom(textRaw: string | null): { amount: number | null; zero: boolean } {
  const text = norm(textRaw);
  if (/sin (cupo|disponible)|cupo (cero|0)|no tengo (cupo|disponible)|disponible (cero|0)/.test(text)) {
    return { amount: 0, zero: true };
  }
  const matches = text.match(/(?:\$\s*)?\d[\d.,]*/g) ?? [];
  for (const match of matches) {
    const digits = match.replace(/[^0-9]/g, '');
    if (!digits) continue;
    const amount = Number(digits);
    if (Number.isFinite(amount) && amount <= 1_000_000_000) {
      return { amount, zero: amount === 0 };
    }
  }
  return { amount: null, zero: false };
}

function quotaSignal(state: BotContactState, textRaw: string | null): boolean {
  if (state.stage === 'WAIT_QUOTA') return true;
  return /cupo|disponible|monto|\$/.test(norm(textRaw));
}

function dniFrom(textRaw: string | null): string | null {
  const text = norm(textRaw);
  return text.match(/(?:dni|documento)\s*(?:nro|numero|n)?\s*([0-9]{7,8})\b/)?.[1]
    ?? text.match(/\b([0-9]{7,8})\b/)?.[1]
    ?? null;
}

function nameFrom(textRaw: string | null): string | null {
  const raw = (textRaw ?? '').trim();
  const explicit = raw.match(/(?:me llamo|mi nombre es|soy)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{4,80})/i)?.[1];
  if (explicit) return explicit.trim();
  return raw.split(/[\n,]/)
    .map((part) => part.trim())
    .find((part) => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{4,80}$/.test(part)
      && part.split(/\s+/).length >= 2) ?? null;
}

function emailFrom(textRaw: string | null): string | null {
  return (textRaw ?? '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null;
}

function documentKind(textRaw: string | null): string | null {
  const text = norm(textRaw);
  if (/recibo|sueldo|haberes/.test(text)) return 'PAYSLIP';
  if (/dni.*frente|frente.*dni/.test(text)) return 'DNI_FRONT';
  if (/dni.*dorso|dorso.*dni|dni.*atras/.test(text)) return 'DNI_BACK';
  if (/\bcbu\b|constancia bancaria/.test(text)) return 'CBU';
  if (/certificado/.test(text)) return 'CERTIFICATE';
  if (/cupo|disponible/.test(text)) return 'QUOTA_PROOF';
  return null;
}

function wantsOptOut(text: string | null): boolean {
  return /\bbaja\b|no contactar|no me escriban|no quiero mensajes|dejen de escribir/.test(norm(text));
}

function asksHuman(text: string | null): boolean {
  return /hablar con (una persona|un asesor)|asesor humano|llamame|me pueden llamar|no entiendo nada/.test(norm(text));
}


/**
 * Detecta qué plazo eligió el cliente en el desplegable (id `quote:36`) o si lo
 * escribió a mano ("36 cuotas"). Devuelve la opción REAL de la grilla.
 */
function choiceFrom(
  input: BotInbound,
  params: { entity: string | null; personnelType: string | null; availableQuota: number | null }
): { termMonths: number; monthlyInstallment: number; netAmount: number } | null {
  let term: number | null = null;
  const id = input.interactiveId ?? '';
  if (id.startsWith('quote:')) term = Number(id.slice('quote:'.length));
  if (term === null || !Number.isFinite(term)) {
    const m = norm(input.text).match(/(\d{1,2})\s*(?:cuotas|meses)/);
    if (m?.[1]) term = Number(m[1]);
  }
  if (term === null || !Number.isFinite(term)) return null;

  // El monto sale de la grilla, nunca de lo que escriba el cliente.
  const opciones = quoteOptionsForQuota(params);
  return opciones.find((o) => o.termMonths === term) ?? null;
}

function listPrompt(): BotResponse {
  return {
    kind: 'list',
    body: '¡Hola! Soy el asistente de CityCred. ¿Dónde trabajás?',
    button: 'Elegir opción',
    sections: [{
      title: 'Entidad',
      rows: [
        { id: 'entity:army', title: 'Ejército' },
        { id: 'entity:navy', title: 'Armada' },
        // "Fuerza Aérea" y "Empleado Público RN" se retiraron del menú por
        // indicación de Santiago: no son entidades que CityCred atienda acá.
        { id: 'entity:gendarmerie', title: 'Gendarmería' },
        { id: 'entity:coast_guard', title: 'Prefectura' },
        // "Empleado Público RN" se retiró del menú por indicación de Santiago:
        // no es una entidad que CityCred atienda con este producto.
        { id: 'entity:other', title: 'Otra entidad' }
      ]
    }]
  };
}

function quotaLabel(entity: string | null): string {
  if (entity === 'Ejército') return '“Monto cuota mensual disponible 352/2026”';
  if (entity === 'Armada') return '“Monto otra entidad”';
  if (entity === 'Prefectura') return 'monto disponible de deducción';
  return 'cupo o disponible mensual';
}

function context(state: BotContactState, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...state.context, ...patch };
}

export function decideCitycredBot(state: BotContactState, input: BotInbound): BotDecision {
  if (wantsOptOut(input.text)) {
    return {
      nextStage: 'CLOSED',
      response: { kind: 'text', body: 'Listo. Marcamos tu contacto para no recibir más mensajes automáticos.' },
      patch: { commercialStatus: 'DO_NOT_CONTACT', context: context(state, { optOutRequested: true }), handoffReason: null },
      reason: 'opt_out',
      scheduleFollowups: false
    };
  }
  if (asksHuman(input.text)) {
    return {
      nextStage: 'HANDOFF',
      response: { kind: 'text', body: 'Perfecto. Dejo tu consulta para que la continúe un asesor.' },
      patch: { commercialStatus: 'INTERESTED', handoffReason: 'CUSTOMER_REQUESTED_HUMAN' },
      reason: 'human_requested',
      scheduleFollowups: false
    };
  }
  if (['HANDOFF', 'CLOSED', 'OUT_OF_SCOPE'].includes(state.stage)) {
    return { nextStage: state.stage, response: null, patch: {}, reason: 'terminal_stage', scheduleFollowups: false };
  }

  // FILTRO COMERCIAL: CityCred solo atiende Ejército, Armada, Gendarmería y
  // Prefectura. Se evalúa ANTES de identificar la fuerza para no seguir
  // pidiéndole recibos ni cupo a alguien que no califica.
  if (!state.entity) {
    if (hayContradiccion(input.text)) {
      // Mencionó una fuerza admitida y una actividad que no lo está: lo revisa
      // una persona, no se descarta ni se continúa solo.
      return {
        nextStage: 'HANDOFF',
        response: {
          kind: 'text',
          body: 'Gracias por los datos. Dejo tu consulta con un asesor para confirmar tu situación antes de seguir.'
        },
        patch: {
          commercialStatus: 'PENDING',
          handoffReason: 'ACTIVIDAD_CONTRADICTORIA',
          context: { ...state.context, actividadDetectada: 'contradictoria' }
        },
        reason: 'actividad_contradictoria',
        scheduleFollowups: false
      };
    }

    const noAdmitida = detectarActividadNoAdmitida(input.text);
    if (noAdmitida) {
      return {
        nextStage: 'OUT_OF_SCOPE',
        response: { kind: 'text', body: MENSAJE_NO_ADMITIDA },
        patch: {
          commercialStatus: 'NO_CALIFICA_ACTIVIDAD',
          handoffReason: null,
          context: {
            ...state.context,
            actividadDetectada: noAdmitida.actividad,
            motivoDescarte: noAdmitida.motivo,
            excluidoDeCampanias: true
          }
        },
        reason: 'actividad_no_admitida',
        // Sin seguimientos: no se le vuelve a ofrecer el crédito.
        scheduleFollowups: false
      };
    }
  }

  const entity = (entityFrom(input) ?? state.entity) as BotEntity | null;
  if (!entity) {
    // El cliente ya contestó algo que no pudimos reconocer (por ejemplo, una
    // fuerza provincial). NUNCA repetir el mismo saludo: queda robótico y el
    // cliente cree que el bot se colgó. Se reformula una vez y, si sigue sin
    // entenderse, pasa a un asesor.
    const intentos = typeof state.context.entityAttempts === 'number'
      ? state.context.entityAttempts
      : 0;

    if (intentos === 0) {
      return {
        nextStage: 'WAIT_ENTITY',
        response: listPrompt(),
        patch: { context: { ...state.context, entityAttempts: 1 } },
        reason: 'missing_entity',
        scheduleFollowups: true
      };
    }

    if (intentos === 1) {
      return {
        nextStage: 'WAIT_ENTITY',
        response: {
          kind: 'list',
          body: 'Perdón, no pude identificar tu entidad. Trabajamos con estas fuerzas: '
            + 'elegí la tuya de la lista. Si no está, tocá “Otra entidad” y te paso con un asesor.',
          button: 'Elegir opción',
          sections: listPrompt().kind === 'list'
            ? (listPrompt() as { sections: Array<{ title: string; rows: Array<{ id: string; title: string }> }> }).sections
            : []
        },
        patch: { context: { ...state.context, entityAttempts: 2 } },
        reason: 'entity_not_recognized',
        scheduleFollowups: true
      };
    }

    // Dos intentos sin poder identificarla: lo toma una persona.
    return {
      nextStage: 'HANDOFF',
      response: {
        kind: 'text',
        body: 'No logré identificar tu entidad. Dejo tu consulta para que la siga un asesor y te confirme si podemos ayudarte.'
      },
      patch: {
        context: { ...state.context, entityAttempts: 3 },
        commercialStatus: 'PENDING',
        handoffReason: 'ENTITY_NOT_RECOGNIZED'
      },
      reason: 'entity_not_recognized_handoff',
      scheduleFollowups: false
    };
  }
  if (entity === 'Otra entidad') {
    return {
      nextStage: 'HANDOFF',
      response: { kind: 'text', body: 'Esa entidad necesita revisión manual. Dejo tu consulta para que un asesor confirme si podemos ayudarte.' },
      patch: { entity, commercialStatus: 'PENDING', handoffReason: 'OTHER_ENTITY_REVIEW' },
      reason: 'other_entity',
      scheduleFollowups: false
    };
  }

  const inboundPersonnel = personnelFrom(input);
  if ((entity === 'Gendarmería' || entity === 'Prefectura') && inboundPersonnel === 'VOLUNTEER') {
    return {
      nextStage: 'OUT_OF_SCOPE',
      response: { kind: 'text', body: `Por el momento trabajamos únicamente con personal de carrera de ${entity}. No voy a pedirte autorización ni documentación.` },
      patch: { entity, personnelType: 'VOLUNTEER', commercialStatus: 'REJECTED', handoffReason: null },
      reason: 'unsupported_personnel_type',
      scheduleFollowups: false
    };
  }
  let personnel = inboundPersonnel ?? state.personnelType;
  if (entity === 'Gendarmería' || entity === 'Prefectura') personnel = 'CAREER';
  if ((entity === 'Ejército' || entity === 'Armada') && !personnel) {
    return {
      nextStage: 'WAIT_PERSONNEL_TYPE',
      response: {
        kind: 'buttons',
        body: '¿Sos personal voluntario o de carrera?',
        buttons: [
          { id: 'personnel:volunteer', title: 'Voluntario' },
          { id: 'personnel:career', title: 'De carrera' }
        ]
      },
      patch: { entity },
      reason: 'missing_personnel_type',
      scheduleFollowups: true
    };
  }

  const seniority = seniorityFrom(input) ?? state.seniorityRange;
  if (!seniority) {
    return {
      nextStage: 'WAIT_SENIORITY',
      response: {
        kind: 'buttons',
        body: '¿Qué antigüedad tenés?',
        buttons: [
          { id: 'seniority:less_1', title: 'Menos de 1 año' },
          { id: 'seniority:one_plus', title: '1 año o más' }
        ]
      },
      patch: { entity, ...(personnel ? { personnelType: personnel as 'VOLUNTEER' | 'CAREER' } : {}) },
      reason: 'missing_seniority',
      scheduleFollowups: true
    };
  }

  const parsedQuota = quotaSignal(state, input.text)
    ? quotaFrom(input.text)
    : { amount: null, zero: false };
  const quota = parsedQuota.amount ?? state.availableQuota;
  if (seniority === 'LESS_THAN_1_YEAR') {
    return {
      nextStage: 'HANDOFF',
      response: { kind: 'text', body: `Con menos de un año necesitamos revisar tu caso. Mandame el último recibo y tu ${quotaLabel(entity)}; un asesor lo evalúa sin prometer aprobación.` },
      patch: {
        entity,
        ...(personnel ? { personnelType: personnel as 'VOLUNTEER' | 'CAREER' } : {}),
        seniorityRange: 'LESS_THAN_1_YEAR',
        ...(quota !== null ? { availableQuota: quota } : {}),
        commercialStatus: 'UNDER_REVIEW',
        handoffReason: 'SENIORITY_UNDER_ONE_YEAR'
      },
      reason: 'young_seniority_handoff',
      scheduleFollowups: false
    };
  }
  if (quota === null) {
    return {
      nextStage: 'WAIT_QUOTA',
      response: { kind: 'text', body: `Ahora necesito saber tu ${quotaLabel(entity)}. Escribí el monto. Si figura $0 o sin disponible, decímelo.` },
      patch: {
        entity,
        ...(personnel ? { personnelType: personnel as 'VOLUNTEER' | 'CAREER' } : {}),
        seniorityRange: 'ONE_YEAR_OR_MORE'
      },
      reason: 'missing_quota',
      scheduleFollowups: true
    };
  }
  if (parsedQuota.zero || quota === 0) {
    return {
      nextStage: 'NO_QUOTA',
      response: { kind: 'text', body: 'En este momento figura sin cupo disponible. No voy a pedirte autorización ni documentación. Podés volver a consultar cuando aparezca un monto.' },
      patch: { entity, seniorityRange: 'ONE_YEAR_OR_MORE', availableQuota: 0, commercialStatus: 'PENDING', handoffReason: null },
      reason: 'zero_quota',
      scheduleFollowups: false
    };
  }

  const basePatch = {
    entity,
    ...(personnel ? { personnelType: personnel as 'VOLUNTEER' | 'CAREER' } : {}),
    seniorityRange: 'ONE_YEAR_OR_MORE' as const,
    availableQuota: quota,
    commercialStatus: 'INTERESTED'
  };

  // --- PASO 4: MOSTRAR OPCIONES EN DESPLEGABLE ---
  // Regla de Santiago: hasta acá NO se le pide NINGÚN dato personal. Solo el
  // cupo. Las opciones muestran el neto y la cuota; el monto solicitado nunca.
  if (state.context.optionsShown !== true) {
    const lista = quoteListForQuota({
      entity,
      personnelType: personnel ?? state.personnelType,
      availableQuota: quota
    });
    if (lista) {
      return {
        nextStage: 'WAIT_QUOTE_CHOICE',
        response: {
          kind: 'list',
          body: `Perfecto, registré tu cupo de $${quota.toLocaleString('es-AR')}.\n\n${lista.body}`,
          button: lista.button,
          sections: [{ title: 'Opciones', rows: lista.rows }]
        },
        patch: { ...basePatch, context: { ...state.context, optionsShown: true } },
        reason: 'quote_options_shown',
        scheduleFollowups: true
      };
    }

    // Sin opciones para ese cupo (no llega al mínimo de la grilla). Se avisa y
    // se corta: no se le pide documentación ni se lo hace avanzar en falso.
    return {
      nextStage: 'HANDOFF',
      response: {
        kind: 'text',
        body: `Registré tu cupo de $${quota.toLocaleString('es-AR')}. `
          + 'Con ese monto no tenemos opciones disponibles por el momento. '
          + 'Si tu cupo cambia, escribime y lo vemos. 😊'
      },
      patch: { ...basePatch, commercialStatus: 'PENDING', handoffReason: 'CUPO_INSUFICIENTE' },
      reason: 'cupo_insuficiente',
      scheduleFollowups: false
    };
  }

  // --- PASO 5: EL CLIENTE ELIGIÓ UN PLAZO ---
  // Se le confirma lo elegido y se le explica cómo autorizar el cupo.
  const eleccion = choiceFrom(input, {
    entity,
    personnelType: personnel ?? state.personnelType,
    availableQuota: quota
  });
  if (eleccion && state.context.authorizationSent !== true) {
    const instrucciones = instruccionesAutorizacion(entity);
    const confirmacion = `¡Buenísimo! Elegiste ${eleccion.termMonths} cuotas de `
      + `$${eleccion.monthlyInstallment.toLocaleString('es-AR')}. `
      + `Recibís $${eleccion.netAmount.toLocaleString('es-AR')} en mano.`;

    if (!instrucciones) {
      return {
        nextStage: 'HANDOFF',
        response: { kind: 'text', body: `${confirmacion}\n\nTe paso con un asesor para seguir.` },
        patch: { ...basePatch, handoffReason: 'SIN_INSTRUCCIONES_FUERZA' },
        reason: 'choice_without_instructions',
        scheduleFollowups: false
      };
    }
    return {
      nextStage: 'WAIT_AUTHORIZATION',
      response: { kind: 'text', body: `${confirmacion}\n\n${instrucciones}` },
      patch: {
        ...basePatch,
        context: {
          ...state.context,
          authorizationSent: true,
          chosenTerm: eleccion.termMonths,
          chosenNet: eleccion.netAmount,
          chosenInstallment: eleccion.monthlyInstallment
        }
      },
      reason: 'authorization_instructions_sent',
      scheduleFollowups: true
    };
  }

  // --- PASO 6: YA AUTORIZÓ EL CUPO ---
  // Recién acá se pide documentación. Nunca antes.
  const profileName = nameFrom(input.text) ?? state.profileName;
  const documentNumber = dniFrom(input.text) ?? state.documentNumber;
  const docs = { ...((state.context.documents as Record<string, boolean> | undefined) ?? {}) };
  const kind = documentKind(input.text);
  if (kind) docs[kind] = true;
  const email = emailFrom(input.text) ?? (typeof state.context.email === 'string' ? state.context.email : null);

  // Si todavía no se pidió la documentación, se pide una sola vez.
  if (state.context.docsRequested !== true) {
    return {
      nextStage: 'WAIT_DOCUMENTS',
      response: { kind: 'text', body: DOCUMENTACION_AUTORIZADO },
      patch: {
        ...(profileName ? { profileName } : {}),
        ...(documentNumber ? { documentNumber } : {}),
        context: context(state, { documents: docs, email, docsRequested: true }),
        commercialStatus: 'DOCUMENTATION_PENDING'
      },
      reason: 'documentation_requested',
      scheduleFollowups: true
    };
  }

  // Llegó un archivo: se acusa recibo sin interrogar al cliente sobre qué es.
  // (La lectura automática del documento queda para cuando la IA esté activa.)
  if (input.hasMedia) {
    return {
      nextStage: 'WAIT_DOCUMENTS',
      response: { kind: 'text', body: 'Gracias, recibí el archivo. Ahí lo reviso. 😊' },
      patch: {
        ...(profileName ? { profileName } : {}),
        ...(documentNumber ? { documentNumber } : {}),
        context: context(state, { documents: docs, email }),
        commercialStatus: 'DOCUMENTATION_PENDING'
      },
      reason: 'document_received',
      scheduleFollowups: true
    };
  }

  return {
    nextStage: 'HANDOFF',
    response: { kind: 'text', body: CIERRE_DOCUMENTACION },
    patch: {
      ...(profileName ? { profileName } : {}),
      ...(documentNumber ? { documentNumber } : {}),
      context: context(state, { documents: docs, email, documentationComplete: true }),
      commercialStatus: 'UNDER_REVIEW',
      handoffReason: 'DOCUMENTATION_COMPLETE'
    },
    reason: 'documentation_complete',
    scheduleFollowups: false
  };
}

export function extractInteractiveId(message: Record<string, unknown>): string | null {
  if (message.type === 'interactive') {
    const interactive = message.interactive as Record<string, unknown> | undefined;
    const button = interactive?.button_reply as Record<string, unknown> | undefined;
    const list = interactive?.list_reply as Record<string, unknown> | undefined;
    if (typeof button?.id === 'string') return button.id;
    if (typeof list?.id === 'string') return list.id;
  }
  const button = message.button as Record<string, unknown> | undefined;
  return typeof button?.payload === 'string' ? button.payload : null;
}
