export type LangCode = 'en' | 'ar';
export declare function normalizeLang(value: unknown): LangCode | undefined;
export declare function localize(name: string, nameAr?: string | null, lang?: LangCode): string;
