export type BotStage =
  | 'START'
  | 'WAIT_ENTITY'
  | 'WAIT_PERSONNEL_TYPE'
  | 'WAIT_SENIORITY'
  | 'WAIT_QUOTA'
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
  if (/\bejercito\b/.test(text)) return 'Ejército';
  if (/\barmada\b|\bmarina\b/.test(text)) return 'Armada';
  if (/fuerza aerea|\bfaa\b/.test(text)) return 'Fuerza Aérea';
  if (/gendarmeria|\bgna\b/.test(text)) return 'Gendarmería';
  if (/prefectura|\bpna\b/.test(text)) return 'Prefectura';
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
        { id: 'entity:air_force', title: 'Fuerza Aérea' },
        { id: 'entity:gendarmerie', title: 'Gendarmería' },
        { id: 'entity:coast_guard', title: 'Prefectura' },
        { id: 'entity:public_rn', title: 'Empleado Público RN' },
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

  const entity = (entityFrom(input) ?? state.entity) as BotEntity | null;
  if (!entity) {
    return { nextStage: 'WAIT_ENTITY', response: listPrompt(), patch: {}, reason: 'missing_entity', scheduleFollowups: true };
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

  const detectedName = nameFrom(input.text);
  const detectedDni = dniFrom(input.text);
  const profileName = detectedName ?? state.profileName;
  const documentNumber = detectedDni ?? state.documentNumber;
  if (!profileName || !documentNumber) {
    const missing = [!profileName && 'nombre y apellido', !documentNumber && 'DNI'].filter(Boolean).join(' y ');
    return {
      nextStage: 'WAIT_IDENTITY',
      response: { kind: 'text', body: `Perfecto, registré un cupo de $${quota.toLocaleString('es-AR')}. Ahora pasame ${missing}.` },
      patch: {
        entity,
        ...(personnel ? { personnelType: personnel as 'VOLUNTEER' | 'CAREER' } : {}),
        seniorityRange: 'ONE_YEAR_OR_MORE',
        availableQuota: quota,
        ...(detectedName ? { profileName: detectedName } : {}),
        ...(detectedDni ? { documentNumber: detectedDni } : {}),
        commercialStatus: 'INTERESTED'
      },
      reason: 'missing_identity',
      scheduleFollowups: true
    };
  }

  const docs = { ...((state.context.documents as Record<string, boolean> | undefined) ?? {}) };
  const kind = documentKind(input.text);
  const pendingLabel = state.context.unlabeledMediaPending === true;
  if (kind && (input.hasMedia || pendingLabel || kind === 'CBU')) docs[kind] = true;
  const email = emailFrom(input.text) ?? (typeof state.context.email === 'string' ? state.context.email : null);

  if (input.hasMedia && !kind) {
    return {
      nextStage: 'WAIT_DOCUMENTS',
      response: { kind: 'text', body: 'Recibí el archivo. Decime si es recibo, DNI frente, DNI dorso, CBU, certificado o comprobante de cupo.' },
      patch: {
        profileName,
        documentNumber,
        context: context(state, { documents: docs, email, unlabeledMediaPending: true }),
        commercialStatus: 'DOCUMENTATION_PENDING'
      },
      reason: 'unlabeled_document',
      scheduleFollowups: true
    };
  }

  const missingDocs = ['PAYSLIP', 'DNI_FRONT', 'DNI_BACK', 'CBU'].filter((item) => docs[item] !== true);
  if (missingDocs.length || !email) {
    return {
      nextStage: 'WAIT_DOCUMENTS',
      response: { kind: 'text', body: 'Para continuar necesito: último recibo, DNI frente y dorso, CBU Banco Nación y correo. El comprobante de cupo se guarda aparte y no reemplaza esos documentos.' },
      patch: {
        profileName,
        documentNumber,
        context: context(state, { documents: docs, email, unlabeledMediaPending: false }),
        commercialStatus: 'DOCUMENTATION_PENDING'
      },
      reason: 'missing_documents',
      scheduleFollowups: true
    };
  }

  return {
    nextStage: 'HANDOFF',
    response: { kind: 'text', body: 'Perfecto. Registré la documentación. Un asesor la va a revisar y te confirma las opciones; esto todavía no significa aprobación.' },
    patch: {
      profileName,
      documentNumber,
      context: context(state, { documents: docs, email, documentationComplete: true, unlabeledMediaPending: false }),
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
