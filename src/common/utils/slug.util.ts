export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
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
