export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function ensureSlug(input?: string, fallback?: string) {
  const base = input && input.trim().length ? input : fallback;
  if (!base) return undefined;
  return slugify(base);
}
