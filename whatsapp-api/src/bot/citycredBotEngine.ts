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
  | {
      kind: 'buttons';
      body: string;
      buttons: Array<{ id: string; title: string }>;
    }
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

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9@.$\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function entityFrom(input: BotInbound): BotEntity | null {
  const byId = input.interactiveId ? ENTITY_IDS[input.interactiveId] : undefined;
  if (byId) return byId;
  const text = normalize(input.text);
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

function personnelTypeFrom(input: BotInbound): 'VOLUNTEER' | 'CAREER' | null {
  if (input.interactiveId === 'personnel:volunteer') return 'VOLUNTEER';
  if (input.interactiveId === 'personnel:career') return 'CAREER';
  const text = normalize(input.text);
  if (/voluntari[oa]|tropa voluntaria/.test(text)) return 'VOLUNTEER';
  if (/carrera|cuadro permanente|suboficial|oficial/.test(text)) return 'CAREER';
  return null;
}

function seniorityFrom(input: BotInbound): 'LESS_THAN_1_YEAR' | 'ONE_YEAR_OR_MORE' | null {
  if (input.interactiveId === 'seniority:less_1') return 'LESS_THAN_1_YEAR';
  if (input.interactiveId === 'seniority:one_plus') return 'ONE_YEAR_OR_MORE';
  const text = normalize(input.text);
  if (/menos de (un|1) ano|0 a 1 ano|pocos meses|meses|recien ingrese|recien entr[ée]/.test(text)) {
    return 'LESS_THAN_1_YEAR';
  }
  if (/(1|un) ano o mas|mas de (un|1) ano|[2-9]\s*anos|\d{2}\s*anos/.test(text)) {
    return 'ONE_YEAR_OR_MORE';
  }
  return null;
}

function quotaFrom(textRaw: string | null): { amount: number | null; zero: boolean } {
  const text = normalize(textRaw);
  if (/sin (cupo|disponible)|cupo (cero|0)|no tengo (cupo|disponible)|disponible (cero|0)/.test(text)) {
    return { amount: 0, zero: true };
  }
  const candidates = text.match(/(?:\$\s*)?\d[\d.,]*/g) ?? [];
  for (const candidate of candidates) {
    const digits = candidate.replace(/[^0-9]/g, '');
    if (!digits) continue;
    const amount = Number(digits);
    if (Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000_000) {
      return { amount, zero: amount === 0 };
    }
  }
  return { amount: null, zero: false };
}

function dniFrom(textRaw: string | null): string | null {
  const text = normalize(textRaw);
  const explicit = text.match(/(?:dni|documento)\s*(?:nro|numero|n)?\s*([0-9]{7,8})\b/);
  if (explicit?.[1]) return explicit[1];
  const standalone = text.match(/\b([0-9]{7,8})\b/);
  return standalone?.[1] ?? null;
}

function nameFrom(textRaw: string | null): string | null {
  const raw = (textRaw ?? '').trim();
  const explicit = raw.match(/(?:me llamo|mi nombre es|soy)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{4,80})/i);
  if (explicit?.[1]) return explicit[1].trim();
  const lines = raw.split(/[\n,]/).map((line) => line.trim()).filter(Boolean);
  const candidate = lines.find((line) =>
    /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{4,80}$/.test(line)
    && line.split(/\s+/).length >= 2
  );
  return candidate ?? null;
}

function documentKind(textRaw: string | null): string | null {
  const text = normalize(textRaw);
  if (/recibo|sueldo|haberes/.test(text)) return 'PAYSLIP';
  if (/dni.*frente|frente.*dni/.test(text)) return 'DNI_FRONT';
  if (/dni.*dorso|dorso.*dni|dni.*atras/.test(text)) return 'DNI_BACK';
  if (/\bcbu\b|constancia bancaria/.test(text)) return 'CBU';
  if (/certificado/.test(text)) return 'CERTIFICATE';
  if (/cupo|disponible/.test(text)) return 'QUOTA_PROOF';
  return null;
}

function asksForHuman(textRaw: string | null): boolean {
  const text = normalize(textRaw);
  return /quiero hablar con (una persona|un asesor)|asesor humano|llamame|me pueden llamar|no entiendo nada/.test(text);
}

function wantsOptOut(textRaw: string | null): boolean {
  const text = normalize(textRaw);
  return /\bbaja\b|no contactar|no me escriban|no quiero mensajes|dejen de escribir/.test(text);
}

function entityPrompt(): BotResponse {
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

function personnelPrompt(): BotResponse {
  return {
    kind: 'buttons',
    body: '¿Sos personal voluntario o de carrera?',
    buttons: [
      { id: 'personnel:volunteer', title: 'Voluntario' },
      { id: 'personnel:career', title: 'De carrera' }
    ]
  };
}

function seniorityPrompt(): BotResponse {
  return {
    kind: 'buttons',
    body: '¿Qué antigüedad tenés?',
    buttons: [
      { id: 'seniority:less_1', title: 'Menos de 1 año' },
      { id: 'seniority:one_plus', title: '1 año o más' }
    ]
  };
}

function quotaLabel(entity: string | null): string {
  if (entity === 'Ejército') return '“Monto cuota mensual disponible 352/2026”';
  if (entity === 'Armada') return '“Monto otra entidad”';
  if (entity === 'Prefectura') return 'monto disponible de deducción';
  if (entity === 'Gendarmería') return 'cupo disponible';
  return 'cupo o disponible mensual';
}

function quotaPrompt(entity: string | null): BotResponse {
  return {
    kind: 'text',
    body: `Ahora necesito saber tu ${quotaLabel(entity)}. Podés escribir el monto. Si figura $0 o sin disponible, decímelo.`
  };
}

function mergeContext(
  state: BotContactState,
  updates: Record<string, unknown>
): Record<string, unknown> {
  return { ...state.context, ...updates };
}

export function decideCitycredBot(
  state: BotContactState,
  inbound: BotInbound
): BotDecision {
  if (wantsOptOut(inbound.text)) {
    return {
      nextStage: 'CLOSED',
      response: { kind: 'text', body: 'Listo. Marcamos tu contacto para no recibir más mensajes automáticos.' },
      patch: {
        commercialStatus: 'DO_NOT_CONTACT',
        context: mergeContext(state, { optOutRequested: true }),
        handoffReason: null
      },
      reason: 'opt_out',
      scheduleFollowups: false
    };
  }

  if (asksForHuman(inbound.text)) {
    return {
      nextStage: 'HANDOFF',
      response: { kind: 'text', body: 'Perfecto. Dejo tu consulta para que la continúe un asesor.' },
      patch: {
        commercialStatus: 'INTERESTED',
        handoffReason: 'CUSTOMER_REQUESTED_HUMAN'
      },
      reason: 'human_requested',
      scheduleFollowups: false
    };
  }

  const detectedEntity = entityFrom(inbound);
  const entity = (detectedEntity ?? state.entity) as BotEntity | null;
  if (!entity) {
    return {
      nextStage: 'WAIT_ENTITY',
      response: entityPrompt(),
      patch: {},
      reason: 'missing_entity',
      scheduleFollowups: true
    };
  }

  if (entity === 'Otra entidad') {
    return {
      nextStage: 'HANDOFF',
      response: {
        kind: 'text',
        body: 'Gracias. Esa entidad necesita revisión manual. Dejo tus datos para que un asesor confirme si podemos ayudarte.'
      },
      patch: {
        entity,
        commercialStatus: 'PENDING',
        handoffReason: 'OTHER_ENTITY_REVIEW'
      },
      reason: 'other_entity',
      scheduleFollowups: false
    };
  }

  let personnelType = personnelTypeFrom(inbound) ?? state.personnelType;
  if (entity === 'Gendarmería' || entity === 'Prefectura') personnelType = 'CAREER';
  if ((entity === 'Ejército' || entity === 'Armada') && !personnelType) {
    return {
      nextStage: 'WAIT_PERSONNEL_TYPE',
      response: personnelPrompt(),
      patch: { entity },
      reason: 'missing_personnel_type',
      scheduleFollowups: true
    };
  }

  if (
    (entity === 'Gendarmería' || entity === 'Prefectura')
    && personnelTypeFrom(inbound) === 'VOLUNTEER'
  ) {
    return {
      nextStage: 'OUT_OF_SCOPE',
      response: {
        kind: 'text',
        body: `Por el momento trabajamos con personal de carrera de ${entity}. No voy a pedirte autorización ni documentación.`
      },
      patch: {
        entity,
        personnelType: 'VOLUNTEER',
        commercialStatus: 'REJECTED',
        handoffReason: null
      },
      reason: 'unsupported_personnel_type',
      scheduleFollowups: false
    };
  }

  const seniority = seniorityFrom(inbound) ?? state.seniorityRange;
  if (!seniority) {
    return {
      nextStage: 'WAIT_SENIORITY',
      response: seniorityPrompt(),
      patch: {
        entity,
        ...(personnelType ? { personnelType: personnelType as 'VOLUNTEER' | 'CAREER' } : {})
      },
      reason: 'missing_seniority',
      scheduleFollowups: true
    };
  }

  const quotaParsed = quotaFrom(inbound.text);
  const quota = quotaParsed.amount ?? state.availableQuota;
  if (seniority === 'LESS_THAN_1_YEAR') {
    return {
      nextStage: 'HANDOFF',
      response: {
        kind: 'text',
        body: `Con menos de un año necesitamos revisar tu caso. Mandame el último recibo y tu ${quotaLabel(entity)}; un asesor lo evalúa sin prometer aprobación.`
      },
      patch: {
        entity,
        ...(personnelType ? { personnelType: personnelType as 'VOLUNTEER' | 'CAREER' } : {}),
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
      response: quotaPrompt(entity),
      patch: {
        entity,
        ...(personnelType ? { personnelType: personnelType as 'VOLUNTEER' | 'CAREER' } : {}),
        seniorityRange: 'ONE_YEAR_OR_MORE'
      },
      reason: 'missing_quota',
      scheduleFollowups: true
    };
  }

  if (quotaParsed.zero || quota === 0) {
    return {
      nextStage: 'NO_QUOTA',
      response: {
        kind: 'text',
        body: 'En este momento figura sin cupo disponible. No voy a pedirte autorización ni documentación. Podés volver a consultar cuando aparezca un monto disponible.'
      },
      patch: {
        entity,
        ...(personnelType ? { personnelType: personnelType as 'VOLUNTEER' | 'CAREER' } : {}),
        seniorityRange: 'ONE_YEAR_OR_MORE',
        availableQuota: 0,
        commercialStatus: 'PENDING',
        handoffReason: null
      },
      reason: 'zero_quota',
      scheduleFollowups: false
    };
  }

  const detectedName = nameFrom(inbound.text);
  const detectedDni = dniFrom(inbound.text);
  const profileName = detectedName ?? state.profileName;
  const documentNumber = detectedDni ?? state.documentNumber;
  if (!profileName || !documentNumber) {
    const missing = [!profileName && 'nombre y apellido', !documentNumber && 'DNI']
      .filter(Boolean)
      .join(' y ');
    return {
      nextStage: 'WAIT_IDENTITY',
      response: { kind: 'text', body: `Perfecto, registré un cupo de $${quota.toLocaleString('es-AR')}. Ahora pasame ${missing}.` },
      patch: {
        entity,
        ...(personnelType ? { personnelType: personnelType as 'VOLUNTEER' | 'CAREER' } : {}),
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

  const docs = {
    ...((state.context.documents as Record<string, boolean> | undefined) ?? {})
  };
  const kind = documentKind(inbound.text);
  if (inbound.hasMedia && kind) docs[kind] = true;
  if (inbound.hasMedia && !kind) {
    return {
      nextStage: 'WAIT_DOCUMENTS',
      response: {
        kind: 'text',
        body: 'Recibí el archivo. Decime si es recibo, DNI frente, DNI dorso, CBU, certificado o comprobante de cupo.'
      },
      patch: {
        profileName,
        documentNumber,
        context: mergeContext(state, {
          documents: docs,
          unlabeledMediaPending: true
        }),
        commercialStatus: 'DOCUMENTATION_PENDING'
      },
      reason: 'unlabeled_document',
      scheduleFollowups: true
    };
  }

  const required = ['PAYSLIP', 'DNI_FRONT', 'DNI_BACK', 'CBU'];
  const missingDocs = required.filter((item) => docs[item] !== true);
  if (missingDocs.length > 0) {
    return {
      nextStage: 'WAIT_DOCUMENTS',
      response: {
        kind: 'text',
        body: 'Para continuar necesito: último recibo, DNI frente y dorso, CBU Banco Nación y correo. El comprobante de cupo se guarda aparte y no reemplaza esos documentos.'
      },
      patch: {
        profileName,
        documentNumber,
        context: mergeContext(state, { documents: docs, unlabeledMediaPending: false }),
        commercialStatus: 'DOCUMENTATION_PENDING'
      },
      reason: 'missing_documents',
      scheduleFollowups: true
    };
  }

  return {
    nextStage: 'HANDOFF',
    response: {
      kind: 'text',
      body: 'Perfecto. Registré la documentación. Un asesor la va a revisar y te confirma las opciones disponibles; esto todavía no significa aprobación.'
    },
    patch: {
      profileName,
      documentNumber,
      context: mergeContext(state, { documents: docs, documentationComplete: true }),
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
    const buttonReply = interactive?.button_reply as Record<string, unknown> | undefined;
    const listReply = interactive?.list_reply as Record<string, unknown> | undefined;
    if (typeof buttonReply?.id === 'string') return buttonReply.id;
    if (typeof listReply?.id === 'string') return listReply.id;
  }
  if (message.type === 'button') {
    const button = message.button as Record<string, unknown> | undefined;
    if (typeof button?.payload === 'string') return button.payload;
  }
  return null;
}
