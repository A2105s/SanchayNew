import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';
import { mapOperator } from '@/lib/cloud/mappers';
import { operatorInputSchema } from '@/lib/validation/schemas';
import { writeAudit } from '@/lib/cloud/audit';
import { recordCloudEvent } from '@/lib/cloud/backend-events';
import { DomainError } from '@/lib/cloud/errors';
import { handleRouteError, ok, readJson } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireSession(request, { permission: 'operators.manage' });
  if (!auth.ok) return auth.response;

  try {
    const operators = await prisma.operator.findMany({ orderBy: { createdAt: 'asc' } });
    return ok(operators.map(mapOperator));
  } catch (error) {
    return handleRouteError('cloud/operators:get', error);
  }
}

export async function POST(request: Request) {
  const auth = await requireSession(request, { permission: 'operators.manage' });
  if (!auth.ok) return auth.response;

  try {
    const body = await readJson(request);
    const input = operatorInputSchema.parse(body);

    const existing = await prisma.operator.findUnique({ where: { username: input.username } });
    if (existing) throw new DomainError(`Username "${input.username}" is already taken.`, 409);

    if (input.stationId) {
      const station = await prisma.station.findUnique({ where: { id: input.stationId } });
      if (!station) throw new DomainError('Assigned station not found.', 404);
    }
    if (input.organizationId) {
      const org = await prisma.organization.findUnique({ where: { id: input.organizationId } });
      if (!org) throw new DomainError('Assigned organization not found.', 404);
    }

    const passwordHash = await hashPassword(input.password);
    const operator = await prisma.$transaction(async (tx) => {
      const created = await tx.operator.create({
        data: {
          username: input.username,
          displayName: input.displayName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          role: input.role,
          organizationId: input.organizationId ?? null,
          stationId: input.stationId ?? null,
          passwordHash,
          active: true
        }
      });
      await writeAudit(tx, {
        entityType: 'Operator',
        entityId: created.id,
        action: 'OperatorCreated',
        newValue: `${created.username} (${created.role})`,
        performedBy: auth.user.username,
        performedByRole: auth.user.role,
        reason: 'Operator created'
      });
      return created;
    });

    await recordCloudEvent({ level: 'info', category: 'operators', action: 'create-operator', status: 'succeeded', message: 'Operator created.', details: { operatorId: operator.id } });
    return ok(mapOperator(operator));
  } catch (error) {
    return handleRouteError('cloud/operators:post', error);
  }
}
