import * as path from 'path';
import * as fs from 'fs/promises';
import { lookup as mimeLookup } from 'mime-types';

const UPLOADS_DIR = process.env.UPLOADS_DIR || 'uploads';
const LOCAL_BASE = (process.env.LOCAL_UPLOADS_BASE_URL || '/uploads').replace(/\/$/, '');
const DRIVER = (process.env.UPLOADS_DRIVER || 's3').toLowerCase();

function isDataUrl(url?: string | null): boolean {
  return !!url && url.startsWith('data:');
}

function extractRelativePath(url: string): string | null {
  if (!url) return null;
  // Exact match with configured base
  if (LOCAL_BASE && url.startsWith(LOCAL_BASE + '/')) {
    return url.substring(LOCAL_BASE.length + 1);
  }
  // Contains /uploads/ segment
  const seg = '/uploads/';
  const idx = url.indexOf(seg);
  if (idx >= 0) {
    return url.substring(idx + seg.length);
  }
  // Already looks relative
  if (!/^https?:\/\//i.test(url) && !url.startsWith('data:')) return url.replace(/^\/+/, '');
  return null;
}

export async function toBase64DataUrl(imageUrl?: string | null): Promise<string | undefined> {
  if (!imageUrl) return undefined;
  if (isDataUrl(imageUrl)) return imageUrl;
  if (DRIVER !== 'local') return imageUrl; // Only convert automatically for local driver

  const rel = extractRelativePath(imageUrl);
  if (!rel) return imageUrl;

  const filePath = path.resolve(process.cwd(), UPLOADS_DIR, rel);
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const mime = (mimeLookup(ext) || 'application/octet-stream') as string;
    const b64 = buf.toString('base64');
    return `data:${mime};base64,${b64}`;
  } catch {
    // If file missing or unreadable, fall back to original URL
    return imageUrl;
  }
}

