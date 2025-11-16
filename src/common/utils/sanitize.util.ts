import sanitizeHtml = require('sanitize-html');

const DEFAULT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

export function cleanString(value: unknown, opts?: { lowerCase?: boolean; maxLength?: number }) {
  if (typeof value !== 'string') return value as unknown;
  let next = value.trim();
  if (!next) return '';
  next = sanitizeHtml(next, DEFAULT_SANITIZE_OPTIONS);
  if (opts?.lowerCase) {
    next = next.toLowerCase();
  }
  if (opts?.maxLength && next.length > opts.maxLength) {
    next = next.slice(0, opts.maxLength);
  }
  return next;
}

export function cleanNullableString(value: unknown, opts?: { lowerCase?: boolean; maxLength?: number }) {
  const cleaned = cleanString(value, opts);
  return typeof cleaned === 'string' && cleaned.length > 0 ? cleaned : undefined;
}

export function deepSanitize(input: any): any {
  if (Array.isArray(input)) {
    return input.map((item) => deepSanitize(item));
  }
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, deepSanitize(value)]),
    );
  }
  if (typeof input === 'string') {
    return cleanString(input);
  }
  return input;
}
