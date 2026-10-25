import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { getAuthSecret } from '@/lib/auth/session';
import { DomainError } from '@/lib/cloud/errors';

export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

export function assertAllowedMime(mimeType: string): void {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new DomainError(`Unsupported file type "${mimeType}". Allowed: pdf, png, jpeg, webp.`, 400, 'UNSUPPORTED_MEDIA_TYPE');
  }
}

export function assertWithinSizeLimit(sizeBytes: number): void {
  if (sizeBytes > MAX_DOCUMENT_BYTES) {
    throw new DomainError(`File exceeds the ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB limit.`, 400, 'PAYLOAD_TOO_LARGE');
  }
}

/** Removes path traversal and unsafe characters; keeps a short safe basename. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/u).pop() ?? 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/gu, '_').replace(/_{2,}/gu, '_');
  return cleaned.slice(0, 80) || 'file';
}

export interface StorageDriver {
  readonly kind: 'supabase' | 'local';
  put(objectPath: string, bytes: Buffer, mimeType: string): Promise<void>;
  get(objectPath: string): Promise<Buffer>;
  remove(objectPath: string): Promise<void>;
  /** Driver that cannot itself sign (Supabase) returns null; the route builds a Supabase signed URL. */
  signedPath(objectPath: string, ttlSeconds?: number): string | null;
}

// ---------------------------------------------------------------------------
// Local filesystem driver (default when Supabase is not configured)
// ---------------------------------------------------------------------------

const LOCAL_ROOT = path.join(process.cwd(), '.local-storage');

function resolveLocal(objectPath: string): string {
  const safe = objectPath.replace(/\.\.(?:[\\/]|$)/gu, '').replace(/^[\\/]+/u, '');
  const resolved = path.join(LOCAL_ROOT, safe);
  if (!resolved.startsWith(LOCAL_ROOT)) throw new DomainError('Invalid storage path.', 400);
  return resolved;
}

class LocalStorageDriver implements StorageDriver {
  readonly kind = 'local' as const;

  async put(objectPath: string, bytes: Buffer): Promise<void> {
    const full = resolveLocal(objectPath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
  }

  async get(objectPath: string): Promise<Buffer> {
    try {
      return await readFile(resolveLocal(objectPath));
    } catch {
      throw new DomainError('Stored file not found.', 404);
    }
  }

  async remove(objectPath: string): Promise<void> {
    try {
      await unlink(resolveLocal(objectPath));
    } catch {
      // Already gone - fine.
    }
  }

  signedPath(objectPath: string, ttlSeconds = SIGNED_URL_TTL_SECONDS): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = signLocal(objectPath, exp);
    const params = new URLSearchParams({ exp: String(exp), sig });
    return `/api/cloud/documents/file?path=${encodeURIComponent(objectPath)}&${params.toString()}`;
  }
}

// ---------------------------------------------------------------------------
// Supabase Storage driver (server-side only, service-role key)
// ---------------------------------------------------------------------------

const SUPABASE_BUCKET = 'vehicle-documents';

class SupabaseStorageDriver implements StorageDriver {
  readonly kind = 'supabase' as const;
  private url: string;
  private serviceKey: string;

  constructor(url: string, serviceKey: string) {
    this.url = url.replace(/\/+$/u, '');
    this.serviceKey = serviceKey;
  }

  private endpoint(objectPath: string): string {
    return `${this.url}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`;
  }

  async put(objectPath: string, bytes: Buffer, mimeType: string): Promise<void> {
    const res = await fetch(this.endpoint(objectPath), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true'
      },
      body: new Uint8Array(bytes)
    });
    if (!res.ok) throw new DomainError(`Storage upload failed (${res.status}).`, 502);
  }

  async get(objectPath: string): Promise<Buffer> {
    const res = await fetch(this.endpoint(objectPath), {
      headers: { Authorization: `Bearer ${this.serviceKey}` }
    });
    if (!res.ok) throw new DomainError('Stored file not found.', 404);
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }

  async remove(objectPath: string): Promise<void> {
    await fetch(this.endpoint(objectPath), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.serviceKey}` }
    }).catch(() => undefined);
  }

  /** Supabase signs via its own API in the documents route; nothing to sign locally. */
  signedPath(): null {
    return null;
  }

  async createSignedUrl(objectPath: string, ttlSeconds = SIGNED_URL_TTL_SECONDS): Promise<string> {
    const res = await fetch(`${this.url}/storage/v1/object/sign/${SUPABASE_BUCKET}/${objectPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: ttlSeconds })
    });
    if (!res.ok) throw new DomainError('Could not create a signed URL.', 502);
    const body = (await res.json()) as { signedURL?: string };
    if (!body.signedURL) throw new DomainError('Signed URL missing in storage response.', 502);
    return `${this.url}/storage/v1${body.signedURL}`;
  }
}

// ---------------------------------------------------------------------------
// HMAC signing for the local-filesystem signed URLs
// ---------------------------------------------------------------------------

function signLocal(objectPath: string, exp: number): string {
  const secret = getAuthSecret();
  if (!secret) throw new DomainError('Storage signing is not configured.', 503);
  return createHmac('sha256', secret).update(`${objectPath}|${exp}`).digest('hex');
}

export function verifyLocalSignature(objectPath: string, exp: number, sig: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = signLocal(objectPath, exp);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Driver selection
// ---------------------------------------------------------------------------

let cachedDriver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (cachedDriver) return cachedDriver;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    cachedDriver = new SupabaseStorageDriver(url, serviceKey);
  } else {
    cachedDriver = new LocalStorageDriver();
  }
  return cachedDriver;
}

export { SupabaseStorageDriver };
