import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Local development only: use the session-mode connection (DIRECT_URL, port 5432).
 * Production keeps DATABASE_URL (transaction pooler), the right choice for serverless.
 * The dev pool is capped so hot-reloads cannot exhaust the session pooler.
 */
function resolveDevDatasourceUrl(): string | undefined {
  if (process.env.NODE_ENV !== 'development') return undefined;
  const direct = process.env.DIRECT_URL;
  if (!direct) return undefined;
  if (direct.includes('connection_limit=')) return direct;
  return `${direct}${direct.includes('?') ? '&' : '?'}connection_limit=5`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolveDevDatasourceUrl(),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
