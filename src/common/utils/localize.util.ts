export type LangCode = 'en' | 'ar';

const LANG_SET: ReadonlySet<LangCode> = new Set(['en', 'ar']);

export function normalizeLang(value: unknown): LangCode | undefined {
  const inputs = Array.isArray(value) ? value : [value];
  const parts = inputs
    .flatMap((candidate) => {
      if (candidate === undefined || candidate === null) return [];
      if (typeof candidate === 'string') {
        return candidate.split(',').map((part) => part.trim()).filter(Boolean);
      }
      return [String(candidate).trim()];
    })
    .filter(Boolean);

  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (LANG_SET.has(normalized as LangCode)) {
      return normalized as LangCode;
    }
  }
  return undefined;
}

export function localize(name: string, nameAr?: string | null, lang?: LangCode): string {
  if (lang === 'ar' && nameAr) {
    return nameAr;
  }
  return name;
}
