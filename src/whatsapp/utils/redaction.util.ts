export function maskPhone(value?: string) {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length <= 6) return '***';
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-3)}`;
}

export function snippet(value?: string, max = 160) {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

const OTP_CONTEXT =
  /(otp|passcode|code|reset|token|\u0631\u0645\u0632|\u0643\u0648\u062f|\u062a\u062d\u0642\u0642|\u062a\u0623\u0643\u064a\u062f|\u0627\u0639\u0627\u062f\u0629|\u0625\u0639\u0627\u062f\u0629|\u0645\u0631\u0648\u0631)/i;

export function redactSensitiveText(value?: string) {
  if (!value) return '';
  if (!OTP_CONTEXT.test(value)) return value;
  const redactedDigits = value.replace(/\b\d{4,8}\b/g, '***');
  return redactedDigits.replace(/[A-Za-z0-9_-]{12,}/g, '***');
}
