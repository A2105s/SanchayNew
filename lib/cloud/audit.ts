import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { AuditEntryView } from '@/types';

// Serialisation lock key for the audit hash chain (arbitrary stable 64-bit-ish int).
const AUDIT_LOCK_KEY = 710428;

export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILED';

export interface AuditInput {
  entityType: string;
  entityId: string;
  action: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  performedBy: string;
  performedByRole?: string | null;
  organizationId?: string | null;
  correlationId?: string | null;
  outcome?: AuditOutcome;
  reason?: string | null;
}

type TxClient = Prisma.TransactionClient;

/** Generates a correlation id grouping every audit row written by one request/command. */
export function newCorrelationId(): string {
  return randomUUID();
}

function canonicalPayload(parts: {
  prevHash: string | null;
  seq: number;
  entityType: string;
  entityId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  performedBy: string;
  performedByRole: string | null;
  organizationId: string | null;
  correlationId: string | null;
  outcome: string;
  performedAtIso: string;
}): string {
  return [
    parts.prevHash ?? '',
    String(parts.seq),
    parts.entityType,
    parts.entityId,
    parts.action,
    parts.oldValue ?? '',
    parts.newValue ?? '',
    parts.performedBy,
    parts.performedByRole ?? '',
    parts.organizationId ?? '',
    parts.correlationId ?? '',
    parts.outcome,
    parts.performedAtIso
  ].join('|');
}

function computeHash(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Appends a tamper-evident audit row. The hash chain is serialised with a Postgres
 * transaction-scoped advisory lock so concurrent writers cannot interleave seq/hash.
 *
 * Accepts either the base prisma client or an existing transaction client. When given the
 * base client it opens its own transaction; when given a tx client it joins the caller's
 * transaction (the advisory lock is still taken, held until that transaction commits).
 *
 * The DB trigger (prisma/post-push.sql) rejects any UPDATE/DELETE of AuditLog, so the
 * ledger is append-only at the database level - nothing in code may rewrite history.
 */
export async function writeAudit(
  client: typeof prisma | TxClient,
  input: AuditInput
): Promise<AuditEntryView> {
  const run = async (tx: TxClient): Promise<AuditEntryView> => {
    // Serialise appenders for the duration of the transaction.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;

    const prev = await tx.auditLog.findFirst({
      orderBy: { seq: 'desc' },
      select: { seq: true, hash: true }
    });

    const prevHash = prev?.hash ?? null;
    const performedAt = new Date();
    const outcome: AuditOutcome = input.outcome ?? 'SUCCESS';

    // The append-only trigger blocks UPDATE/DELETE on AuditLog, so the hash must be
    // written in the single INSERT. Reserve the autoincrement seq up front so the hash
    // can be computed before the row exists.
    const seqRows = await tx.$queryRaw<Array<{ seq: bigint }>>(
      Prisma.sql`SELECT nextval(pg_get_serial_sequence('"AuditLog"', 'seq')) AS seq`
    );
    const seq = Number(seqRows[0].seq);

    const hash = computeHash(
      canonicalPayload({
        prevHash,
        seq,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        oldValue: input.oldValue ?? null,
        newValue: input.newValue ?? null,
        performedBy: input.performedBy,
        performedByRole: input.performedByRole ?? null,
        organizationId: input.organizationId ?? null,
        correlationId: input.correlationId ?? null,
        outcome,
        performedAtIso: performedAt.toISOString()
      })
    );

    const created = await tx.auditLog.create({
      data: {
        seq,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        fieldName: input.fieldName ?? null,
        oldValue: input.oldValue ?? null,
        newValue: input.newValue ?? null,
        performedBy: input.performedBy,
        performedByRole: input.performedByRole ?? null,
        organizationId: input.organizationId ?? null,
        correlationId: input.correlationId ?? null,
        outcome,
        performedAt,
        reason: input.reason ?? null,
        prevHash,
        hash
      }
    });

    return mapRow(created);
  };

  if (isTransactionClient(client)) {
    return run(client);
  }
  return (client as typeof prisma).$transaction((tx) => run(tx));
}

function mapRow(row: {
  id: string;
  seq: number;
  entityType: string;
  entityId: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  performedBy: string;
  performedByRole: string | null;
  organizationId: string | null;
  correlationId: string | null;
  outcome: string;
  performedAt: Date;
  reason: string | null;
  prevHash: string | null;
  hash: string | null;
}): AuditEntryView {
  return {
    id: row.id,
    seq: row.seq,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    fieldName: row.fieldName,
    oldValue: row.oldValue,
    newValue: row.newValue,
    performedBy: row.performedBy,
    performedByRole: row.performedByRole,
    organizationId: row.organizationId,
    correlationId: row.correlationId,
    outcome: row.outcome as AuditEntryView['outcome'],
    performedAt: row.performedAt.toISOString(),
    reason: row.reason,
    prevHash: row.prevHash,
    hash: row.hash
  };
}

function isTransactionClient(client: typeof prisma | TxClient): client is TxClient {
  // The base PrismaClient exposes $transaction; a tx client does not.
  return typeof (client as { $transaction?: unknown }).$transaction !== 'function';
}

export interface AuditVerifyResult {
  ok: boolean;
  checked: number;
  brokenAtSeq: number | null;
}

/**
 * Recomputes the hash chain for the most recent `limit` rows (in seq order) and reports
 * the first seq where the stored hash or prevHash linkage diverges.
 */
export async function verifyAuditChain(limit = 500): Promise<AuditVerifyResult> {
  const take = Math.max(1, Math.min(5000, Math.floor(limit)));
  const recent = await prisma.auditLog.findMany({
    orderBy: { seq: 'desc' },
    take
  });
  const rows = recent.slice().reverse(); // ascending seq

  let checked = 0;
  let expectedPrevHash: string | null = rows.length ? rows[0].prevHash : null;

  for (const row of rows) {
    checked += 1;

    // prevHash must match the previous row's hash within the window.
    if (row.prevHash !== expectedPrevHash) {
      return { ok: false, checked, brokenAtSeq: row.seq };
    }

    const recomputed = computeHash(
      canonicalPayload({
        prevHash: row.prevHash,
        seq: row.seq,
        entityType: row.entityType,
        entityId: row.entityId,
        action: row.action,
        oldValue: row.oldValue,
        newValue: row.newValue,
        performedBy: row.performedBy,
        performedByRole: row.performedByRole,
        organizationId: row.organizationId,
        correlationId: row.correlationId,
        outcome: row.outcome,
        performedAtIso: row.performedAt.toISOString()
      })
    );

    if (recomputed !== row.hash) {
      return { ok: false, checked, brokenAtSeq: row.seq };
    }

    expectedPrevHash = row.hash;
  }

  return { ok: true, checked, brokenAtSeq: null };
}
