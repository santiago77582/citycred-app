export type ForceKey = 'EJERCITO' | 'ARMADA' | 'GENDARMERIA' | 'PREFECTURA';
export type PersonnelSituation = 'CAREER' | 'VOLUNTEER';

export type ForceConfig = {
  key: ForceKey;
  displayName: string;
  portalName: string;
  portalHost: string | null;
  quotaFieldLabel: string;
  decree: string | null;
  entityCode: string | null;
  allowedSituations: readonly PersonnelSituation[];
  seniorityRequiredFor: readonly PersonnelSituation[];
};

export const FORCE_CONFIG: Readonly<Record<ForceKey, ForceConfig>> = {
  EJERCITO: {
    key: 'EJERCITO',
    displayName: 'Ejército Argentino',
    portalName: 'Haberes 2.0',
    portalHost: 'res20.cge.mil.ar',
    quotaFieldLabel: 'Monto Cuota Mensual Disponible',
    decree: '352/2026',
    entityCode: null,
    allowedSituations: ['CAREER', 'VOLUNTEER'],
    seniorityRequiredFor: ['VOLUNTEER']
  },
  ARMADA: {
    key: 'ARMADA',
    displayName: 'Armada Argentina',
    portalName: 'SIAF Armada',
    portalHost: 'siaf.armada.mil.ar',
    quotaFieldLabel: 'Monto con otra entidad',
    decree: null,
    entityCode: null,
    allowedSituations: ['CAREER', 'VOLUNTEER'],
    seniorityRequiredFor: ['VOLUNTEER']
  },
  GENDARMERIA: {
    key: 'GENDARMERIA',
    displayName: 'Gendarmería Nacional',
    portalName: 'UTAC / administración',
    portalHost: null,
    quotaFieldLabel: 'Monto disponible según Decreto 14/12',
    decree: '14/12',
    entityCode: '400571',
    allowedSituations: ['CAREER'],
    seniorityRequiredFor: []
  },
  PREFECTURA: {
    key: 'PREFECTURA',
    displayName: 'Prefectura Naval Argentina',
    portalName: 'Administración / sistema de afectaciones',
    portalHost: null,
    quotaFieldLabel: 'Monto disponible según Decreto 14/12',
    decree: '14/12',
    entityCode: '400571',
    allowedSituations: ['CAREER'],
    seniorityRequiredFor: []
  }
};

const ALIASES: Record<string, ForceKey> = {
  EJERCITO: 'EJERCITO',
  EJERCITOARGENTINO: 'EJERCITO',
  ARMADA: 'ARMADA',
  ARMADAARGENTINA: 'ARMADA',
  GENDARMERIA: 'GENDARMERIA',
  GENDARMERIANACIONAL: 'GENDARMERIA',
  PREFECTURA: 'PREFECTURA',
  PREFECTURANAVAL: 'PREFECTURA',
  PREFECTURANAVALARGENTINA: 'PREFECTURA'
};

function normalizedKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

export function normalizeForce(value: string): ForceKey | null {
  return ALIASES[normalizedKey(value)] ?? null;
}

export function forceConfig(value: string | ForceKey): ForceConfig | null {
  const key = value in FORCE_CONFIG ? value as ForceKey : normalizeForce(value);
  return key ? FORCE_CONFIG[key] : null;
}

export function isSituationAllowed(force: ForceKey, situation: PersonnelSituation): boolean {
  return FORCE_CONFIG[force].allowedSituations.includes(situation);
}

export function requiresSeniority(force: ForceKey, situation: PersonnelSituation): boolean {
  return FORCE_CONFIG[force].seniorityRequiredFor.includes(situation);
}
