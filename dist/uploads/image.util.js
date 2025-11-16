"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBase64DataUrl = void 0;
exports.toPublicImageUrl = toPublicImageUrl;
const uploads_config_1 = require("./uploads.config");
const LOCAL_BASE_URL = (0, uploads_config_1.getLocalUploadsBaseUrl)();
const LOCAL_PATH_PREFIX = (0, uploads_config_1.getLocalUploadsPathPrefix)();
const DRIVER = (process.env.UPLOADS_DRIVER || 's3').toLowerCase();
function extractRelativePath(url) {
    if (!url)
        return null;
    if (LOCAL_BASE_URL && url.startsWith(LOCAL_BASE_URL + '/')) {
        return url.substring(LOCAL_BASE_URL.length + 1);
    }
    if (LOCAL_PATH_PREFIX && url.includes(`${LOCAL_PATH_PREFIX}/`)) {
        const idx = url.indexOf(`${LOCAL_PATH_PREFIX}/`);
        return url.substring(idx + LOCAL_PATH_PREFIX.length + 1);
    }
    if (!/^https?:\/\//i.test(url) && !url.startsWith('data:'))
        return url.replace(/^\/+/, '');
    return null;
}
function isHttpUrl(url) {
    return /^https?:\/\//i.test(url);
}
async function toPublicImageUrl(imageUrl) {
    if (!imageUrl)
        return undefined;
    if (imageUrl.startsWith('data:') || isHttpUrl(imageUrl))
        return imageUrl;
    const rel = extractRelativePath(imageUrl);
    if (!rel)
        return imageUrl;
    if (DRIVER === 'local') {
        const base = LOCAL_BASE_URL.endsWith('/') ? LOCAL_BASE_URL : `${LOCAL_BASE_URL}/`;
        return `${base}${rel}`.replace(/(?<!:)\/+/g, '/');
    }
    return imageUrl.startsWith('/') ? imageUrl : `/${rel}`;
}
exports.toBase64DataUrl = toPublicImageUrl;
//# sourceMappingURL=image.util.js.map