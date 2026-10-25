import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { recordSecurityEvent } from '@/lib/security/tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const response = NextResponse.json({ success: true, data: { loggedOut: true } });

  void recordSecurityEvent({
    action: 'logout',
    level: 'info',
    status: 'succeeded',
    message: 'Operator logged out, session terminated',
    headers: request.headers,
    details: { path: '/api/auth/logout' }
  });

  response.cookies.set(SESSION_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0
  });

  return response;
}
