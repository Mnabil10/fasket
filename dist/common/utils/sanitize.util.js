"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanString = cleanString;
exports.cleanNullableString = cleanNullableString;
exports.deepSanitize = deepSanitize;
const sanitizeHtml = require("sanitize-html");
const DEFAULT_SANITIZE_OPTIONS = {
    allowedTags: [],
    allowedAttributes: {},
};
function cleanString(value, opts) {
    if (typeof value !== 'string')
        return value;
    let next = value.trim();
    if (!next)
        return '';
    next = sanitizeHtml(next, DEFAULT_SANITIZE_OPTIONS);
    if (opts?.lowerCase) {
        next = next.toLowerCase();
    }
    if (opts?.maxLength && next.length > opts.maxLength) {
        next = next.slice(0, opts.maxLength);
    }
    return next;
}
function cleanNullableString(value, opts) {
    const cleaned = cleanString(value, opts);
    return typeof cleaned === 'string' && cleaned.length > 0 ? cleaned : undefined;
}
function deepSanitize(input) {
    if (Array.isArray(input)) {
        return input.map((item) => deepSanitize(item));
    }
    if (input && typeof input === 'object') {
        return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, deepSanitize(value)]));
    }
    if (typeof input === 'string') {
        return cleanString(input);
    }
    return input;
}
//# sourceMappingURL=sanitize.util.js.map