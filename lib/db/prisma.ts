import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Local development only: use the session-mode connection (DIRECT_URL, port 5432).
 * Production keeps DATABASE_URL (transaction pooler), the right choice for serverless.
 * The dev pool is capped so hot-reloads cannot exhaust the session pooler.
 */
function resolveDatasourceUrl(): string | undefined {
  if (process.env.NODE_ENV === 'development') {
    const direct = process.env.DIRECT_URL;
    if (!direct) return undefined;
    if (direct.includes('connection_limit=')) return direct;
    return `${direct}${direct.includes('?') ? '&' : '?'}connection_limit=5`;
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return undefined;
  // If connection_limit=1 is present, upgrade to 10 with 20s pool_timeout to avoid starvation on parallel queries
  if (dbUrl.includes('connection_limit=1')) {
    return dbUrl.replace('connection_limit=1', 'connection_limit=10&pool_timeout=20');
  }
  return dbUrl;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolveDatasourceUrl(),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
