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
  for (const areaLength of [4, 3, 2]) {
    const markerIndex = areaLength;
    if (national.slice(markerIndex, markerIndex + 2) !== '15') continue;
    const subscriber = national.slice(markerIndex + 2);
    if (subscriber.length >= 6 && subscriber.length <= 8) {
      return `${national.slice(0, markerIndex)}${subscriber}`;
    }
  }
  return national;
}
