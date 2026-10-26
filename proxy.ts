import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import { applySupabaseSession } from '@/lib/supabase/middleware';

/** Origins the basemap needs: the configured style endpoints plus the CARTO tile/font/sprite hosts their styles reference. */
function originOf(value: string | undefined, fallback: string): string {
  try {
    return new URL(value || fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
}
const MAP_ORIGINS = [
  originOf(process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT, 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'),
  originOf(process.env.NEXT_PUBLIC_MAP_STYLE_DARK, 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'),
  'https://*.basemaps.cartocdn.com'
]
  .filter((origin, index, all) => all.indexOf(origin) === index)
  .join(' ');

export async function proxy(request: NextRequest) {
  const response = await handleRequest(request);

  // Refresh an adopted Supabase Auth session. This is a no-op unless Supabase
  // Auth cookies exist, and static assets skip it entirely.
  if (isStaticAssetPath(request.nextUrl.pathname)) return response;
  return applySupabaseSession(request, response);
}

async function handleRequest(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE_NAME);
  const { pathname } = request.nextUrl;

  // Static assets and framework internals pass through.
  if (isStaticAssetPath(pathname)) {
    return withSecurityHeaders(NextResponse.next());
  }

  // Cron-authenticated sync-job processing (handles external cron services via Bearer token, header, or query param).
  if (pathname === '/api/cloud/sync-jobs/process' && process.env.CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    const xCronSecret = request.headers.get('x-cron-secret');
    const querySecret = request.nextUrl.searchParams.get('key') || request.nextUrl.searchParams.get('secret');

    if (
      authHeader === `Bearer ${process.env.CRON_SECRET}` ||
      xCronSecret === process.env.CRON_SECRET ||
      querySecret === process.env.CRON_SECRET
    ) {
      return withSecurityHeaders(NextResponse.next());
    }
  }

  // Cross-origin guard for unsafe API methods (CSRF defense-in-depth).
  if (pathname.startsWith('/api/') && isUnsafeMethod(request.method) && !isSameOriginRequest(request)) {
    return withSecurityHeaders(
      NextResponse.json({ success: false, error: 'Cross-origin request blocked.' }, { status: 403 })
    );
  }

  // Public auth endpoints.
  if (pathname.startsWith('/api/auth/login') || pathname.startsWith('/api/auth/logout')) {
    return withSecurityHeaders(NextResponse.next());
  }

  // IoT ingest uses its own per-device key, not the cookie session.
  if (pathname.startsWith('/api/iot/ingest')) {
    return withSecurityHeaders(NextResponse.next());
  }

  // Local-storage document files are authorized by a short-lived HMAC signature in the URL,
  // not the session cookie (the signed URL is the capability).
  if (pathname.startsWith('/api/cloud/documents/file')) {
    return withSecurityHeaders(NextResponse.next());
  }

  // The landing page is public; it redirects client-side.
  if (pathname === '/') {
    return withSecurityHeaders(NextResponse.next());
  }

  const authenticated = await verifySessionToken(session?.value);
  const shouldClearSession = Boolean(session && !authenticated);

  if (!authenticated && pathname !== '/login') {
    if (pathname.startsWith('/api/')) {
      return withClearedInvalidSession(
        withSecurityHeaders(
          NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 })
        ),
        shouldClearSession
      );
    }
    const loginUrl = new URL('/login', request.url);
    return withClearedInvalidSession(withSecurityHeaders(NextResponse.redirect(loginUrl)), shouldClearSession);
  }

  if (authenticated && pathname === '/login') {
    const dashboardUrl = new URL('/dashboard', request.url);
    return withSecurityHeaders(NextResponse.redirect(dashboardUrl));
  }

  return withClearedInvalidSession(withSecurityHeaders(NextResponse.next()), shouldClearSession);
}

function isStaticAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.png' ||
    pathname === '/logo.png' ||
    pathname === '/manifest.json' ||
    pathname === '/robots.txt' ||
    pathname.startsWith('/assets') ||
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map|woff2?|ttf)$/u.test(pathname)
  );
}

function withClearedInvalidSession(response: NextResponse, shouldClear: boolean): NextResponse {
  if (!shouldClear) return response;
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0
  });
  return response;
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${MAP_ORIGINS} https://*.supabase.co https://*.supabase.in`,
    `connect-src 'self' ${MAP_ORIGINS} https://*.supabase.co https://*.supabase.in`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'"
  ];
  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
}

function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (origin) return origin === request.nextUrl.origin || isLocalDevelopmentAlias(origin, request.nextUrl.origin);

  const referer = request.headers.get('referer');
  if (!referer) return true;

  try {
    const refererOrigin = new URL(referer).origin;
    return refererOrigin === request.nextUrl.origin || isLocalDevelopmentAlias(refererOrigin, request.nextUrl.origin);
  } catch {
    return false;
  }
}

function isLocalDevelopmentAlias(leftOrigin: string, rightOrigin: string): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const left = new URL(leftOrigin);
    const right = new URL(rightOrigin);
    const leftIsLoopback = left.hostname === 'localhost' || left.hostname === '127.0.0.1' || left.hostname === '::1';
    const rightIsLoopback = right.hostname === 'localhost' || right.hostname === '127.0.0.1' || right.hostname === '::1';
    return left.protocol === right.protocol && left.port === right.port && leftIsLoopback && rightIsLoopback;
  } catch {
    return false;
  }
}

export const config = {
  matcher: ['/((?!favicon.ico).*)']
};
