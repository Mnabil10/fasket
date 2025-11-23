"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeLang = normalizeLang;
exports.localize = localize;
const LANG_SET = new Set(['en', 'ar']);
function normalizeLang(value) {
    const inputs = Array.isArray(value) ? value : [value];
    const parts = inputs
        .flatMap((candidate) => {
        if (candidate === undefined || candidate === null)
            return [];
        if (typeof candidate === 'string') {
            return candidate.split(',').map((part) => part.trim()).filter(Boolean);
        }
        return [String(candidate).trim()];
    })
        .filter(Boolean);
    for (const part of parts) {
        const normalized = part.toLowerCase();
        if (LANG_SET.has(normalized)) {
            return normalized;
        }
    }
    return undefined;
}
function localize(name, nameAr, lang) {
    if (lang === 'ar' && nameAr) {
        return nameAr;
    }
    return name;
}
//# sourceMappingURL=localize.util.js.map