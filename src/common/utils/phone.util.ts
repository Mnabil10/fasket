import { BadRequestException } from '@nestjs/common';

const E164 = /^\+?[1-9]\d{7,14}$/;

export function normalizePhoneToE164(phone: string, defaultCountry = 'EG'): string {
  const trimmed = (phone || '').trim();
  if (!trimmed) {
    throw new BadRequestException('Invalid phone');
  }

  if (E164.test(trimmed)) {
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
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
