import { normalizePhoneToE164 } from '../../common/utils/phone.util';

export function toWhatsappRecipient(phone: string) {
  const e164 = normalizePhoneToE164(phone);
  return { e164, waId: e164.replace(/^\+/, '') };
}

export function normalizeWhatsappInbound(from: string) {
  return normalizePhoneToE164(from);
}
