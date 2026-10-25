import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';
import { mapOperator } from '@/lib/cloud/mappers';
import { operatorActionSchema } from '@/lib/validation/schemas';
import { writeAudit } from '@/lib/cloud/audit';
import { recordCloudEvent } from '@/lib/cloud/backend-events';
import { DomainError } from '@/lib/cloud/errors';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(request, { permission: 'operators.manage' });
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    const body = await readJson(request);
    const action = operatorActionSchema.parse(body);

    const operator = await prisma.operator.findUnique({ where: { id } });
    if (!operator) throw new DomainError('Operator not found.', 404);

    if (action.type === 'delete') {
      if (operator.username === auth.user.username) {
        throw new DomainError('You cannot delete your own operator account.', 409);
      }
      await prisma.$transaction(async (tx) => {
        await tx.operator.delete({ where: { id } });
        await writeAudit(tx, {
          entityType: 'Operator',
          entityId: id,
          action: 'OperatorDeleted',
          oldValue: operator.username,
          performedBy: auth.user.username,
          performedByRole: auth.user.role,
          reason: 'Operator deleted'
        });
      });
      await recordCloudEvent({ level: 'info', category: 'operators', action: 'delete-operator', status: 'succeeded', message: 'Operator deleted.', details: { operatorId: id } });
      return ok({ id, deleted: true });
    }

    const data: Record<string, unknown> = {};
    let auditAction = 'OperatorUpdated';

    switch (action.type) {
      case 'update':
        if (action.displayName !== undefined) data.displayName = action.displayName;
        if (action.email !== undefined) data.email = action.email ?? null;
        if (action.phone !== undefined) data.phone = action.phone ?? null;
        if (action.role !== undefined) data.role = action.role;
        if (action.organizationId !== undefined) {
          if (action.organizationId) {
            const org = await prisma.organization.findUnique({ where: { id: action.organizationId } });
            if (!org) throw new DomainError('Assigned organization not found.', 404);
          }
          data.organizationId = action.organizationId ?? null;
        }
        if (action.stationId !== undefined) {
          if (action.stationId) {
            const station = await prisma.station.findUnique({ where: { id: action.stationId } });
            if (!station) throw new DomainError('Assigned station not found.', 404);
          }
          data.stationId = action.stationId ?? null;
        }
        break;
      case 'setActive':
        if (!action.active && operator.username === auth.user.username) {
          throw new DomainError('You cannot deactivate your own operator account.', 409);
        }
        data.active = action.active;
        auditAction = action.active ? 'OperatorActivated' : 'OperatorDeactivated';
        break;
      case 'resetPassword':
        data.passwordHash = await hashPassword(action.password);
        auditAction = 'OperatorPasswordReset';
        break;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.operator.update({ where: { id }, data });
      await writeAudit(tx, {
        entityType: 'Operator',
        entityId: id,
        action: auditAction,
        performedBy: auth.user.username,
        performedByRole: auth.user.role
      });
      return result;
    });

    await recordCloudEvent({ level: 'info', category: 'operators', action: `operator-${action.type}`, status: 'succeeded', message: 'Operator updated.', details: { operatorId: id } });
    return ok(mapOperator(updated));
  } catch (error) {
    return handleRouteError('cloud/operators/[id]/actions', error);
  }
}
