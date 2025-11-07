"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBase64DataUrl = toBase64DataUrl;
const path = require("path");
const fs = require("fs/promises");
const mime_types_1 = require("mime-types");
const UPLOADS_DIR = process.env.UPLOADS_DIR || 'uploads';
const LOCAL_BASE = (process.env.LOCAL_UPLOADS_BASE_URL || '/uploads').replace(/\/$/, '');
const DRIVER = (process.env.UPLOADS_DRIVER || 's3').toLowerCase();
function isDataUrl(url) {
    return !!url && url.startsWith('data:');
}
function extractRelativePath(url) {
    if (!url)
        return null;
    if (LOCAL_BASE && url.startsWith(LOCAL_BASE + '/')) {
        return url.substring(LOCAL_BASE.length + 1);
    }
    const seg = '/uploads/';
    const idx = url.indexOf(seg);
    if (idx >= 0) {
        return url.substring(idx + seg.length);
    }
    if (!/^https?:\/\//i.test(url) && !url.startsWith('data:'))
        return url.replace(/^\/+/, '');
    return null;
}
async function toBase64DataUrl(imageUrl) {
    if (!imageUrl)
        return undefined;
    if (isDataUrl(imageUrl))
        return imageUrl;
    if (DRIVER !== 'local')
        return imageUrl;
    const rel = extractRelativePath(imageUrl);
    if (!rel)
        return imageUrl;
    const filePath = path.resolve(process.cwd(), UPLOADS_DIR, rel);
    try {
        const buf = await fs.readFile(filePath);
        const ext = path.extname(filePath);
        const mime = ((0, mime_types_1.lookup)(ext) || 'application/octet-stream');
        const b64 = buf.toString('base64');
        return `data:${mime};base64,${b64}`;
    }
    catch {
        return imageUrl;
    }
}
//# sourceMappingURL=image.util.js.map