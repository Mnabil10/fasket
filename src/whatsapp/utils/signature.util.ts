import { createHmac, timingSafeEqual } from 'crypto';

export function verifyWhatsappSignature(secret: string, rawBody: string, signatureHeader?: string) {
  if (!secret || !rawBody || !signatureHeader) return false;
  const trimmed = signatureHeader.trim();
  const parts = trimmed.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') return false;
  const provided = parts[1];
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}
