const CREDENTIAL_LABEL = '(?:usuario|user|contrase(?:n|ñ)a|clave|password|pin)';
const LABELED_SECRET = new RegExp(`(${CREDENTIAL_LABEL}\\s*[:=\\-]\\s*)([^\\s,;]+)`, 'giu');
const SHARING_INTENT = new RegExp(
  `\\b(?:mi|el|la)?\\s*${CREDENTIAL_LABEL}\\s*(?:es|:|=|-)`,
  'iu'
);

export const CREDENTIAL_SAFETY_REPLY =
  'Por seguridad, nunca compartas usuarios, claves ni contraseñas de SIAF, Haberes 2.0, ARCA u otros portales. CityCred no te las va a pedir. Hacé el trámite directamente desde el portal oficial y, si necesitás ayuda, te explicamos los pasos sin acceder a tu cuenta.';

export function looksLikeCredentialSharing(text: string): boolean {
  return SHARING_INTENT.test(text) || LABELED_SECRET.test(text);
}

export function redactCredentialValues(text: string): string {
  LABELED_SECRET.lastIndex = 0;
  return text.replace(LABELED_SECRET, '$1[OCULTO]');
}

export function protectInboundText(text: string): {
  safeText: string;
  blocked: boolean;
  reply: string | null;
} {
  const blocked = looksLikeCredentialSharing(text);
  return {
    safeText: blocked ? redactCredentialValues(text) : text,
    blocked,
    reply: blocked ? CREDENTIAL_SAFETY_REPLY : null
  };
}
