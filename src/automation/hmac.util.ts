import { createHmac, timingSafeEqual } from 'crypto';

export interface HmacHeaders {
  signature: string;
  timestamp: number;
}

export function signAutomationPayload(secret: string, timestamp: number, body: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifyAutomationSignature(secret: string, headers: HmacHeaders, body: string, toleranceSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - headers.timestamp) > toleranceSeconds) {
    return false;
  }
  const expected = signAutomationPayload(secret, headers.timestamp, body);
  try {
    return timingSafeEqual(Buffer.from(headers.signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
