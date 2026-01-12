import { BadRequestException } from '@nestjs/common';

const E164 = /^\+?[1-9]\d{7,14}$/;
const EG_MOBILE_E164 = /^\+20\d{10}$/;

export function normalizePhoneToE164(phone: unknown, defaultCountry = 'EG'): string {
  const trimmed = String(phone ?? '').trim();
  if (!trimmed) {
    throw new BadRequestException('Invalid phone');
  }

  if (E164.test(trimmed)) {
    const normalized = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
    if (defaultCountry === 'EG' && normalized.startsWith('+20') && !EG_MOBILE_E164.test(normalized)) {
      throw new BadRequestException('Invalid phone');
    }
    return normalized;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');

  if (E164.test(`+${digitsOnly}`)) {
    return `+${digitsOnly}`;
  }

  if (defaultCountry === 'EG') {
    // Common local formats: 01XXXXXXXXX or 1XXXXXXXXX
    const withoutLeadingZeros = digitsOnly.replace(/^0+/, '');
    if (/^1\d{9}$/.test(withoutLeadingZeros)) {
      return `+20${withoutLeadingZeros}`;
    }
  }

  throw new BadRequestException('Invalid phone');
}

export function normalizePhoneToE164OrNull(phone?: string | null, defaultCountry = 'EG'): string | null {
  if (phone === undefined || phone === null) return null;
  const trimmed = String(phone).trim();
  if (!trimmed) return null;
  return normalizePhoneToE164(trimmed, defaultCountry);
}
