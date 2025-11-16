const rawBase = (process.env.LOCAL_UPLOADS_BASE_URL || '/uploads').trim() || '/uploads';
const defaultOrigin =
  process.env.API_PUBLIC_URL ||
  process.env.APP_URL ||
  `http://localhost:${process.env.PORT || 4000}`;

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function ensureLeadingSlash(path: string) {
  if (!path.startsWith('/')) return `/${path}`;
  return path;
}

const isAbsolute = /^https?:\/\//i.test(rawBase);
const normalizedPath = stripTrailingSlash(
  ensureLeadingSlash(isAbsolute ? new URL(rawBase).pathname || '/uploads' : rawBase),
);
const localPathPrefix = normalizedPath || '/uploads';
const localBaseUrl = isAbsolute
  ? stripTrailingSlash(rawBase)
  : `${stripTrailingSlash(defaultOrigin)}${ensureLeadingSlash(rawBase)}`;

export function getLocalUploadsBaseUrl() {
  return localBaseUrl;
}

export function getLocalUploadsPathPrefix() {
  return localPathPrefix;
}
