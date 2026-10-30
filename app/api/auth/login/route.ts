import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  getAdminPassword,
  getAdminUsername,
  isPasswordAuthConfigured,
  timingSafeEqualString,
  type SessionInput
} from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
import { checkSecurityThreats, getClientIp, recordSecurityEvent, resetSecurityThreats } from '@/lib/security/tracker';
import type { Role } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const threats = checkSecurityThreats(ip, false);

  if (threats.isDosBurst) {
    void recordSecurityEvent({
      action: 'dos_rate_limit_tripped',
      level: 'critical',
      status: 'blocked',
      message: `DoS rate-limit triggered (${threats.recentRequestsCount} requests in 5s) on login endpoint`,
      headers: request.headers,
      ip,
      details: { threatType: 'dos_burst', recentRequestsCount: threats.recentRequestsCount, path: '/api/auth/login' }
    });
    return NextResponse.json({ success: false, error: 'Too many rapid requests. Please wait a moment.' }, { status: 429 });
  }

  if (threats.isBruteForce) {
    void recordSecurityEvent({
      action: 'brute_force_blocked',
      level: 'critical',
      status: 'blocked',
      message: `Login request blocked: IP ${ip} temporarily locked out (${threats.recentFailedCount} failed attempts)`,
      headers: request.headers,
      ip,
      details: { threatType: 'brute_force', failedCount: threats.recentFailedCount, path: '/api/auth/login' }
    });
    return NextResponse.json(
      { success: false, error: 'Temporarily locked due to excessive failed login attempts (10+). Please wait 10 minutes.' },
      { status: 429 }
    );
  }

  // Progressive throttle to slow credential stuffing without locking out legitimate operators.
  if (threats.throttleDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, threats.throttleDelayMs));
  }

  try {
    if (!isPasswordAuthConfigured()) {
      return NextResponse.json({ success: false, error: 'Authentication is not configured on this server.' }, { status: 503 });
    }

    const credentials = await readCredentials(request);
    if (!credentials) {
      void recordSecurityEvent({
        action: 'login_failed',
        level: 'warn',
        status: 'failed',
        message: 'Malformed or empty login credentials submitted',
        headers: request.headers,
        ip,
        details: { reason: 'Malformed request body', path: '/api/auth/login' }
      });
      return NextResponse.json({ success: false, error: 'Enter a valid username and password.' }, { status: 400 });
    }

    const session = await authenticate(credentials.username, credentials.password);

    if (session) {
      resetSecurityThreats(ip);

      // Best-effort lastLoginAt bump for real operators (skip the env bootstrap admin).
      if (session.source === 'operator') {
        prisma.operator
          .updateMany({ where: { username: session.input.username }, data: { lastLoginAt: new Date() } })
          .catch(() => undefined);
      }

      const token = await createSessionToken(session.input);
      const response = NextResponse.json({
        success: true,
        data: {
          username: session.input.username,
          displayName: session.input.displayName,
          role: session.input.role,
          organizationId: session.input.organizationId,
          stationId: session.input.stationId
        }
      });
      response.cookies.set(SESSION_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE_SECONDS
      });

      void recordSecurityEvent({
        action: 'login_success',
        level: 'info',
        status: 'succeeded',
        message: `Operator "${credentials.username}" authenticated successfully`,
        headers: request.headers,
        ip,
        details: { username: credentials.username, role: session.input.role, path: '/api/auth/login' }
      });
      return response;
    }

    const failureThreats = checkSecurityThreats(ip, true);
    void recordSecurityEvent({
      action: 'login_failed',
      level: failureThreats.isBruteForce ? 'critical' : 'warn',
      status: 'failed',
      message: `Failed login attempt for username "${credentials.username}" (Attempt #${failureThreats.recentFailedCount})`,
      headers: request.headers,
      ip,
      details: {
        username: credentials.username,
        reason: 'Invalid username or password',
        attemptCount: failureThreats.recentFailedCount,
        threatType: failureThreats.isBruteForce ? 'brute_force' : undefined,
        path: '/api/auth/login'
      }
    });

    return NextResponse.json({ success: false, error: 'Invalid username or password.' }, { status: 401 });
  } catch (error) {
    console.error('[auth/login]', error);
    return NextResponse.json({ success: false, error: 'Request parsing failed.' }, { status: 400 });
  }
}

type AuthOutcome = { source: 'operator' | 'bootstrap' | 'station'; input: SessionInput };

/**
 * Operators in the DB take precedence; when no matching active operator exists, we fall
 * back to the bootstrap env admin (useful before any operator rows have been seeded).
 */
async function authenticate(username: string, password: string): Promise<AuthOutcome | null> {
  const operator = await prisma.operator.findUnique({ where: { username } }).catch(() => null);
  if (operator) {
    if (!operator.active) return null;
    const valid = await verifyPassword(password, operator.passwordHash);
    if (!valid) return null;
    return {
      source: 'operator',
      input: {
        username: operator.username,
        displayName: operator.displayName,
        role: operator.role as Role,
        organizationId: operator.organizationId ?? null,
        stationId: operator.stationId ?? null
      }
    };
  }

  // Support police station authentication for any station in the directory
  if (username.startsWith('station.') || username.startsWith('ps.')) {
    const slug = username.replace(/^(station|ps)\./i, '').toLowerCase();
    const station = await prisma.station.findFirst({
      where: {
        OR: [
          { code: slug },
          { code: `${slug}-police-station` },
          { id: slug },
          { id: `${slug}-police-station` }
        ]
      }
    }).catch(() => null);

    if (station) {
      const demoPass = 'Sanchay@Demo1';
      const validDemo = timingSafeEqualString(password, demoPass);
      const adminPass = getAdminPassword();
      const validAdmin = adminPass ? timingSafeEqualString(password, adminPass) : false;

      if (validDemo || validAdmin) {
        return {
          source: 'station',
          input: {
            username,
            displayName: station.inchargeName ? `${station.inchargeName} (${station.name})` : station.name,
            role: 'STATION_OFFICER' as Role,
            organizationId: station.organizationId ?? null,
            stationId: station.id
          }
        };
      }
    }
  }

  const adminUser = getAdminUsername();
  const adminPass = getAdminPassword();
  if (adminUser && adminPass) {
    const validUsername = timingSafeEqualString(username, adminUser);
    const validPassword = timingSafeEqualString(password, adminPass);
    if (validUsername && validPassword) {
      return {
        source: 'bootstrap',
        input: { username: adminUser, displayName: 'Administrator', role: 'ADMIN', organizationId: null, stationId: null }
      };
    }
  }

  return null;
}

async function readCredentials(request: Request): Promise<{ username: string; password: string } | null> {
  const body = (await request.json()) as { username?: unknown; password?: unknown };
  if (typeof body.username !== 'string' || typeof body.password !== 'string') return null;
  const username = body.username.trim();
  const password = body.password;
  if (!username || !password || username.length > 120 || password.length > 200) return null;
  return { username, password };
}
