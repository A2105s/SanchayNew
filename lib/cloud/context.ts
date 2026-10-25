import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { can, type Permission } from '@/lib/auth/roles';
import { newCorrelationId, writeAudit } from '@/lib/cloud/audit';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/types';

export type AuthedContext =
  | { ok: true; user: SessionUser; correlationId: string }
  | { ok: false; response: NextResponse };

/**
 * Validates the session and (optionally) a permission. On a denied privileged attempt it
 * writes an append-only AuditLog row with outcome DENIED before returning 403.
 * Generates a correlationId used for every audit row written during this request/command.
 */
export async function requirePermission(
  request: Request | NextRequest,
  permission?: Permission,
  deniedEntity?: { entityType: string; entityId: string }
): Promise<AuthedContext> {
  const auth = await requireSession(request);
  if (!auth.ok) return { ok: false, response: auth.response };

  const correlationId = newCorrelationId();

  if (permission && !can(auth.user.role, permission)) {
    // Record the denied attempt (best-effort; never block the 403 on an audit failure).
    try {
      await writeAudit(prisma, {
        entityType: deniedEntity?.entityType ?? 'Permission',
        entityId: deniedEntity?.entityId ?? permission,
        action: 'PermissionDenied',
        performedBy: auth.user.username,
        performedByRole: auth.user.role,
        organizationId: auth.user.organizationId,
        correlationId,
        outcome: 'DENIED',
        reason: `Missing permission ${permission}`
      });
    } catch (error) {
      console.error('[context:denied-audit]', error instanceof Error ? error.message : 'unknown');
    }
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'You do not have permission to perform this action.' },
        { status: 403 }
      )
    };
  }

  return { ok: true, user: auth.user, correlationId };
}

/**
 * Records a DENIED audit row for a scope/authorization failure discovered inside a service
 * (e.g. an attempt to act outside one's org, approve one's own request, read a foreign
 * document). Best-effort; never throws.
 */
export async function auditDenied(
  user: SessionUser,
  correlationId: string,
  entityType: string,
  entityId: string,
  action: string,
  reason: string
): Promise<void> {
  try {
    await writeAudit(prisma, {
      entityType,
      entityId,
      action,
      performedBy: user.username,
      performedByRole: user.role,
      organizationId: user.organizationId,
      correlationId,
      outcome: 'DENIED',
      reason
    });
  } catch (error) {
    console.error('[context:auditDenied]', error instanceof Error ? error.message : 'unknown');
  }
}

/** Uppercase alphanumerics only - preserves original value elsewhere (spec 14). */
export function normalizeRegistration(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/gu, '');
}
