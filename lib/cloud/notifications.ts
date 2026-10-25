import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { NotificationView } from '@/types';
import { mapNotification } from '@/lib/cloud/mappers';

type TxClient = Prisma.TransactionClient | typeof prisma;

export interface NotificationInput {
  /** Deterministic key making retries idempotent, e.g. `request:<id>:APPROVED`. */
  eventKey: string;
  kind: string;
  title: string;
  body: string;
  href?: string | null;
  recipientUsername?: string | null;
  recipientRole?: string | null;
  recipientOrgId?: string | null;
}

/**
 * Inserts a notification. Intended to be called AFTER the originating state change has
 * committed (spec 16). Idempotent via the unique `eventKey`: a duplicate insert is ignored
 * and never rolls back the committed decision.
 */
export async function notify(input: NotificationInput, tx: TxClient = prisma): Promise<void> {
  try {
    await tx.notification.create({
      data: {
        eventKey: input.eventKey,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
        recipientUsername: input.recipientUsername ?? null,
        recipientRole: input.recipientRole ?? null,
        recipientOrgId: input.recipientOrgId ?? null
      }
    });
  } catch (error) {
    // P2002 = duplicate eventKey (already delivered); safe to ignore.
    const code = (error as { code?: string }).code;
    if (code !== 'P2002') {
      console.error('[notifications:notify]', { eventKey: input.eventKey, error: code ?? 'unknown' });
    }
  }
}

/** Inserts several notifications, each idempotent by eventKey. Never throws. */
export async function notifyAll(inputs: NotificationInput[], tx: TxClient = prisma): Promise<void> {
  for (const input of inputs) {
    await notify(input, tx);
  }
}

/**
 * Notifications visible to a user: those addressed to them directly, or to their role
 * within their organization.
 */
function visibilityWhere(username: string, role: string, organizationId: string | null): Prisma.NotificationWhereInput {
  const or: Prisma.NotificationWhereInput[] = [{ recipientUsername: username }];
  if (organizationId) {
    or.push({ recipientOrgId: organizationId, recipientRole: role });
    or.push({ recipientOrgId: organizationId, recipientRole: null });
  }
  return { OR: or };
}

export async function listNotifications(
  username: string,
  role: string,
  organizationId: string | null,
  limit = 50
): Promise<NotificationView[]> {
  const rows = await prisma.notification.findMany({
    where: visibilityWhere(username, role, organizationId),
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(200, limit))
  });
  return rows.map(mapNotification);
}

export async function countUnread(username: string, role: string, organizationId: string | null): Promise<number> {
  return prisma.notification.count({
    where: { AND: [visibilityWhere(username, role, organizationId), { readAt: null }] }
  });
}

export async function markRead(
  username: string,
  role: string,
  organizationId: string | null,
  ids: string[] | 'all'
): Promise<number> {
  const base = visibilityWhere(username, role, organizationId);
  const where: Prisma.NotificationWhereInput =
    ids === 'all' ? { AND: [base, { readAt: null }] } : { AND: [base, { id: { in: ids } }, { readAt: null }] };
  const result = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  return result.count;
}
