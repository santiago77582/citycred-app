import { AppError } from '../errors/AppError.js';

/**
 * Normaliza números argentinos al formato que espera WhatsApp: 549 + área + abonado.
 * También acepta números internacionales que ya comienzan con código de país.
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const explicitInternational = trimmed.startsWith('+') || trimmed.startsWith('00');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) throw new AppError('El teléfono está vacío', 400);

  if (trimmed.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('549') && digits.length >= 12 && digits.length <= 14) {
    return digits;
  }

  if (digits.startsWith('54')) {
    const national = digits.slice(2).replace(/^0/, '');
    const withoutLocal15 = removeArgentinaLocal15(national);
    return `549${withoutLocal15}`;
  }

  if (explicitInternational && digits.length >= 8 && digits.length <= 15) return digits;

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
    return `549${removeArgentinaLocal15(digits)}`;
  }

  if (digits.length >= 10 && digits.length <= 11) {
    return `549${removeArgentinaLocal15(digits)}`;
  }

  if (digits.length >= 8 && digits.length <= 15) return digits;

  throw new AppError('El teléfono no tiene un formato válido', 400);
}

function removeArgentinaLocal15(national: string): string {
  // El único indicativo argentino de dos dígitos es 11. Probar cualquier
  // prefijo de dos dígitos confundía, por ejemplo, 0291 555-1111 con un
  // supuesto indicativo 29 seguido del prefijo móvil 15.
  const areaLengths = national.startsWith('11') ? [4, 3, 2] : [4, 3];
  for (const areaLength of areaLengths) {
    const markerIndex = areaLength;
    if (national.slice(markerIndex, markerIndex + 2) !== '15') continue;
    const subscriber = national.slice(markerIndex + 2);
    if (subscriber.length >= 6 && subscriber.length <= 8) {
      return `${national.slice(0, markerIndex)}${subscriber}`;
    }
  }
  return national;
}
