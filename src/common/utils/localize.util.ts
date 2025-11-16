export function localize(
  name: string,
  nameAr?: string | null,
  lang?: 'en' | 'ar',
): string {
  if (lang === 'ar' && nameAr) {
    return nameAr;
  }
  return name;
}
