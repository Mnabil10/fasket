"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = slugify;
exports.ensureSlug = ensureSlug;
function slugify(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}
function ensureSlug(input, fallback) {
    const base = input && input.trim().length ? input : fallback;
    if (!base)
        return undefined;
    return slugify(base);
}
//# sourceMappingURL=slug.util.js.map