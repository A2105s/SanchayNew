import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Role, SessionUser } from '@/types';
import { can, type Permission } from '@/lib/auth/roles';

export const SESSION_COOKIE_NAME = 'sanchay-session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h

export interface SessionPayload {
  sub: string; // username
  name: string; // display name
  role: Role;
  organizationId: string | null;
  stationId: string | null;
  iat: number;
  exp: number;
  nonce: string;
}

export type SessionInput = {
  username: string;
  displayName: string;
  role: Role;
  organizationId: string | null;
  stationId: string | null;
};

export type RequireSessionResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

function getCookieFromHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

// ---------------------------------------------------------------------------
// Env bootstrap admin
// ---------------------------------------------------------------------------

export function getAdminUsername(): string {
  return process.env.SANCHAY_ADMIN_USERNAME ?? '';
}

export function getAdminPassword(): string {
  return process.env.SANCHAY_ADMIN_PASSWORD ?? '';
}

export function getAuthSecret(): string {
  return process.env.SANCHAY_AUTH_SECRET ?? process.env.AUTH_SECRET ?? '';
}

export function isPasswordAuthConfigured(): boolean {
  return Boolean(getAuthSecret());
}

export function isBootstrapAdminConfigured(): boolean {
  return Boolean(getAdminUsername() && getAdminPassword() && getAuthSecret());
}

export function timingSafeEqualString(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Token create / verify
// ---------------------------------------------------------------------------

export async function createSessionToken(input: SessionInput): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: input.username,
    name: input.displayName,
    role: input.role,
    organizationId: input.organizationId,
    stationId: input.stationId,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
    nonce: crypto.randomUUID()
  };
  const encodedPayload = base64UrlEncodeText(JSON.stringify(payload));
  const signature = await sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function isValidPayload(payload: Partial<SessionPayload>): payload is SessionPayload {
  const now = Math.floor(Date.now() / 1000);
  return (
    typeof payload.sub === 'string' &&
    typeof payload.name === 'string' &&
    typeof payload.role === 'string' &&
    typeof payload.exp === 'number' &&
    payload.exp > now
  );
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  return (await getSessionPayload(token)) !== null;
}

export async function getSessionPayload(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature || token.split('.').length !== 2) return null;
  try {
    const expectedSignature = await sign(encodedPayload);
    if (!timingSafeEqualString(providedSignature, expectedSignature)) return null;
    const payload = JSON.parse(base64UrlDecodeText(encodedPayload)) as Partial<SessionPayload>;
    return isValidPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

function payloadToUser(payload: SessionPayload): SessionUser {
  return {
    username: payload.sub,
    displayName: payload.name,
    role: payload.role,
    organizationId: payload.organizationId ?? null,
    stationId: payload.stationId ?? null
  };
}

export async function getSessionTokenFromRequest(request?: Request | NextRequest): Promise<string | undefined> {
  let token: string | undefined;
  if (request) {
    if ('cookies' in request && typeof (request as NextRequest).cookies?.get === 'function') {
      token = (request as NextRequest).cookies.get(SESSION_COOKIE_NAME)?.value;
    }
    if (!token && request.headers) {
      token = getCookieFromHeader(request.headers.get('cookie'), SESSION_COOKIE_NAME);
    }
  }
  if (!token) {
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      // AsyncLocalStorage context not available
    }
  }
  return token;
}

/**
 * Primary API-route guard. Validates the session and (optionally) a permission.
 * Returns a clean discriminated union used everywhere:
 *   const auth = await requireSession(request, { permission: 'fleet.write' });
 *   if (!auth.ok) return auth.response;
 *   // auth.user is a SessionUser
 */
export async function requireSession(
  request?: Request | NextRequest,
  options?: { permission?: Permission }
): Promise<RequireSessionResult> {
  const token = await getSessionTokenFromRequest(request);
  const payload = await getSessionPayload(token);

  if (!payload) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Authentication required. Session invalid or expired.' },
        { status: 401 }
      )
    };
  }

  const user = payloadToUser(payload);

  if (options?.permission && !can(user.role, options.permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'You do not have permission to perform this action.' },
        { status: 403 }
      )
    };
  }

  return { ok: true, user };
}

/** For server components: resolve the current user from cookies, or null. */
export async function getSessionUserFromCookies(): Promise<SessionUser | null> {
  const token = await getSessionTokenFromRequest();
  const payload = await getSessionPayload(token);
  return payload ? payloadToUser(payload) : null;
}

// ---------------------------------------------------------------------------
// HMAC helpers (Web Crypto, edge-compatible)
// ---------------------------------------------------------------------------

async function sign(value: string): Promise<string> {
  const secret = getAuthSecret();
  if (!secret) throw new Error('Authentication secret is not configured.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function base64UrlEncodeText(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function base64UrlDecodeText(value: string): string {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
