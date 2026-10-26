import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface SessionCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Refreshes a Supabase Auth session (access-token rotation + cookie refresh) and
 * writes the resulting cookies and no-cache headers onto the outgoing response.
 *
 * Sanchay's own `sanchay-session` login is independent of this: when no Supabase
 * Auth cookies are present the refresh is a no-op, so this adds no work for
 * deployments that only use Supabase for Postgres and Storage.
 */
export async function applySupabaseSession(
  request: NextRequest,
  response: NextResponse
): Promise<NextResponse> {
  if (!supabaseUrl || !supabaseKey) return response;

  const cookiesToSet: SessionCookie[] = [];
  const headersToSet: Record<string, string> = {};

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies, headers) {
        cookies.forEach((cookie) => cookiesToSet.push(cookie));
        Object.assign(headersToSet, headers);
      }
    }
  });

  try {
    // Validates the current token against Supabase Auth and triggers a refresh
    // when the access token has expired.
    await supabase.auth.getUser();
  } catch {
    // A stale or malformed Supabase session must not block the request; the
    // client simply stays signed out of Supabase.
  }

  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(headersToSet).forEach(([key, value]) => response.headers.set(key, value));

  return response;
}
