import { prisma } from '@/lib/db/prisma';

export interface SecurityEventDetail {
  ip: string;
  userAgent?: string;
  device?: string;
  browser?: string;
  os?: string;
  path?: string;
  method?: string;
  username?: string;
  reason?: string;
  attemptCount?: number;
  threatType?: 'brute_force' | 'dos_burst' | 'csrf_violation' | 'unauthorized_probe';
  [key: string]: unknown;
}

// In-memory rate limiting and brute force tracking.
interface RequestRecord {
  timestamps: number[];
  failedLogins: number[];
}
const ipRequestTracker = new Map<string, RequestRecord>();

// Clean up tracker every 10 minutes to prevent memory leak.
setInterval(() => {
  const now = Date.now();
  const twoMinutesAgo = now - 120_000;
  for (const [ip, record] of ipRequestTracker.entries()) {
    record.timestamps = record.timestamps.filter((t) => t > twoMinutesAgo);
    record.failedLogins = record.failedLogins.filter((t) => t > twoMinutesAgo);
    if (record.timestamps.length === 0 && record.failedLogins.length === 0) {
      ipRequestTracker.delete(ip);
    }
  }
}, 600_000).unref?.();

export function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false;
  const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6 = /^(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:|^:(?::[0-9a-fA-F]{1,4}){1,7}$|^[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*::(?:[0-9a-fA-F]{1,4})*$/i;
  return ipv4.test(ip) || ipv6.test(ip) || ip === '::1';
}

export function getClientIp(headers: Headers): string {
  const vercelIp = headers.get('x-vercel-forwarded-for');
  if (vercelIp) {
    const first = vercelIp.split(',')[0].trim();
    if (isValidIp(first)) return first;
  }
  if (headers.get('cf-ray')) {
    const cfIp = headers.get('cf-connecting-ip');
    if (cfIp && isValidIp(cfIp.trim())) return cfIp.trim();
  }
  if (!process.env.VERCEL) {
    const realIp = headers.get('x-real-ip');
    if (realIp && isValidIp(realIp.trim())) return realIp.trim();
    const forwardedFor = headers.get('x-forwarded-for');
    if (forwardedFor) {
      const candidates = forwardedFor.split(',').map((s) => s.trim()).filter(isValidIp);
      if (candidates.length > 0) return candidates[0];
    }
  }
  return '127.0.0.1';
}

export function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };

  let browser = 'Other Browser';
  if (/edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/chrome\//i.test(ua)) browser = 'Google Chrome';
  else if (/firefox\//i.test(ua)) browser = 'Mozilla Firefox';
  else if (/safari\//i.test(ua)) browser = 'Apple Safari';
  else if (/curl\//i.test(ua)) browser = 'cURL Tool';
  else if (/python/i.test(ua)) browser = 'Python Script';

  let os = 'Unknown OS';
  if (/windows nt 10/i.test(ua)) os = 'Windows 10/11';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  const device = /mobile|iphone|android/i.test(ua) ? 'Mobile Device' : 'Desktop / PC';
  return { browser, os, device };
}

export function checkSecurityThreats(
  ip: string,
  isFailedLogin = false
): {
  isBruteForce: boolean;
  isDosBurst: boolean;
  throttleDelayMs: number;
  recentRequestsCount: number;
  recentFailedCount: number;
} {
  const now = Date.now();
  const fiveSecondsAgo = now - 5000;
  const tenMinutesAgo = now - 600_000;

  let record = ipRequestTracker.get(ip);
  if (!record) {
    record = { timestamps: [], failedLogins: [] };
    ipRequestTracker.set(ip, record);
  }

  record.timestamps.push(now);
  if (isFailedLogin) record.failedLogins.push(now);

  record.timestamps = record.timestamps.filter((t) => t >= fiveSecondsAgo);
  record.failedLogins = record.failedLogins.filter((t) => t >= tenMinutesAgo);

  const requestsLast5Sec = record.timestamps.length;
  const failedLast10Min = record.failedLogins.length;

  const isDosBurst = requestsLast5Sec > 25;
  const isBruteForce = failedLast10Min >= 10;

  let throttleDelayMs = 0;
  if (failedLast10Min >= 7) throttleDelayMs = 2000;
  else if (failedLast10Min >= 4) throttleDelayMs = 1000;
  else if (failedLast10Min >= 2) throttleDelayMs = 300;

  return {
    isBruteForce,
    isDosBurst,
    throttleDelayMs,
    recentRequestsCount: requestsLast5Sec,
    recentFailedCount: failedLast10Min
  };
}

export function resetSecurityThreats(ip: string): void {
  ipRequestTracker.delete(ip);
}

/**
 * Records a security event to BackendEvent. Deliberately does NOT call any third-party
 * IP geolocation service (privacy): only the raw client IP and parsed user-agent are stored.
 */
export async function recordSecurityEvent(params: {
  action: string;
  level: 'info' | 'warn' | 'error' | 'critical';
  status: 'succeeded' | 'failed' | 'blocked';
  message: string;
  headers?: Headers;
  ip?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const rawHeaders = params.headers;
    const ip = params.ip || (rawHeaders ? getClientIp(rawHeaders) : '127.0.0.1');
    const uaString = rawHeaders?.get('user-agent') || (params.details?.userAgent as string) || '';
    const { browser, os, device } = parseUserAgent(uaString);

    const mergedDetails: SecurityEventDetail = {
      ip,
      userAgent: uaString,
      device: `${device} (${os})`,
      browser,
      os,
      ...(params.details || {})
    };

    await prisma.backendEvent.create({
      data: {
        operationId: crypto.randomUUID(),
        level: params.level,
        category: 'security',
        action: params.action,
        status: params.status,
        message: params.message,
        details: mergedDetails as unknown as import('@prisma/client').Prisma.InputJsonValue,
        createdAt: new Date()
      }
    });
  } catch (err) {
    console.warn('[SecurityTracker] Could not write security event:', err);
  }
}
