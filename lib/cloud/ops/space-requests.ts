import 'server-only';

import { prisma } from '@/lib/db/prisma';
import type { SessionUser, SpaceRequestView } from '@/types';
import type { SpaceRequestInputParsed, SpaceRequestActionParsed } from '@/lib/validation/schemas';
import { writeAudit } from '@/lib/cloud/audit';
import { DomainError } from '@/lib/cloud/errors';
import { CLOUD_CACHE_TAGS, invalidateCloudData } from '@/lib/cloud/cached-queries';
import { mapSpaceRequest } from '@/lib/cloud/mappers';
import { nextSpaceCode } from '@/lib/cloud/codes';
import { orgTree } from '@/lib/auth/scope';
import { spaceFieldSchema } from '@/lib/validation/schemas';
import { notify } from '@/lib/cloud/notifications';

function invalidate() {
  invalidateCloudData(CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.ops, CLOUD_CACHE_TAGS.all);
}

/** Reviewers act only on requests whose space (or, for REGISTER, requester org) is inside their org tree. */
async function assertReviewScope(user: SessionUser, spaceOrganizationId: string | null, requesterOrgId: string | null): Promise<void> {
  const tree = await orgTree(user);
  if (tree === null) return; // platform admin
  const target = spaceOrganizationId ?? requesterOrgId;
  if (!target || !tree.includes(target)) {
    throw new DomainError('This request is outside your organization scope.', 403);
  }
}

export async function submitSpaceRequest(user: SessionUser, input: SpaceRequestInputParsed, correlationId: string): Promise<SpaceRequestView> {
  if (!user.organizationId) throw new DomainError('Your account is not attached to an organization.', 403);
  if (input.type === 'UPDATE' && !input.spaceId) throw new DomainError('An update request must name the space to update.', 400);

  if (input.type === 'UPDATE') {
    const space = await prisma.space.findUnique({ where: { id: input.spaceId as string }, select: { organizationId: true } });
    if (!space) throw new DomainError('Space not found.', 404);
    if (space.organizationId !== user.organizationId) throw new DomainError('You can only request updates for spaces of your own organization.', 403);
    const openDuplicate = await prisma.spaceRequest.findFirst({
      where: { spaceId: input.spaceId, type: 'UPDATE', status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      select: { id: true }
    });
    if (openDuplicate) throw new DomainError('An update request for this space is already under review.', 409);
  }

  const row = await prisma.$transaction(async (tx) => {
    const targetOrg = input.type === 'UPDATE' && input.spaceId
      ? (await tx.space.findUnique({ where: { id: input.spaceId }, select: { organizationId: true } }))?.organizationId ?? user.organizationId
      : user.organizationId;

    const created = await tx.spaceRequest.create({
      data: { type: input.type, spaceId: input.spaceId ?? null, requestedBy: user.username, payload: input.payload },
      include: { space: { select: { name: true } } }
    });
    await writeAudit(tx, { entityType: 'SpaceRequest', entityId: created.id, action: input.type === 'REGISTER' ? 'SpaceRegisterRequested' : 'SpaceUpdateRequested', newValue: input.type, performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId });

    if (targetOrg) {
      await notify({
        eventKey: `space_request:${created.id}:SUBMITTED`,
        kind: 'SPACE_REQUEST_SUBMITTED',
        title: `New space ${input.type.toLowerCase()} request`,
        body: `Space request by ${user.username} requires review.`,
        href: '/spaces/requests',
        recipientOrgId: targetOrg,
        recipientRole: 'DEPT_OFFICER'
      }, tx);
    }

    return created;
  });
  invalidate();
  return mapSpaceRequest(row);
}

export async function listSpaceRequests(user: SessionUser, scope: 'mine' | 'review'): Promise<{ requests: SpaceRequestView[]; total: number }> {
  const where =
    scope === 'mine'
      ? { requestedBy: user.username }
      : await (async () => {
          const tree = await orgTree(user);
          if (tree === null) return {};
          // Review scope: requests on own-org spaces, plus own-org REGISTER requests
          return { OR: [{ space: { organizationId: { in: tree } } }, { spaceId: null, requestedBy: { in: await requesterUsernames(tree) } }] };
        })();
  const [rows, total] = await Promise.all([
    prisma.spaceRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include: { space: { select: { name: true } } } }),
    prisma.spaceRequest.count({ where })
  ]);
  return { requests: rows.map(mapSpaceRequest), total };
}

async function requesterUsernames(orgIds: string[]): Promise<string[]> {
  const ops = await prisma.operator.findMany({ where: { organizationId: { in: orgIds } }, select: { username: true } });
  return ops.map((o) => o.username);
}

export async function applySpaceRequestAction(user: SessionUser, id: string, action: SpaceRequestActionParsed, correlationId: string): Promise<SpaceRequestView> {
  const request = await prisma.spaceRequest.findUnique({ where: { id }, include: { space: { select: { name: true, organizationId: true } } } });
  if (!request) throw new DomainError('Request not found.', 404);

  if (action.type === 'withdraw') {
    if (request.requestedBy !== user.username) throw new DomainError('Only the requester can withdraw this request.', 403);
    if (request.status !== 'SUBMITTED' && request.status !== 'UNDER_REVIEW' && request.status !== 'NEEDS_INFO') {
      throw new DomainError(`A ${request.status.toLowerCase()} request cannot be withdrawn.`, 409);
    }
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.spaceRequest.update({ where: { id }, data: { status: 'WITHDRAWN' }, include: { space: { select: { name: true } } } });
      await writeAudit(tx, { entityType: 'SpaceRequest', entityId: id, action: 'SpaceRequestWithdrawn', fieldName: 'status', oldValue: request.status, newValue: 'WITHDRAWN', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId });
      return updated;
    });
    invalidate();
    return mapSpaceRequest(row);
  }

  // Reviewer actions — separation of duties: never review your own request.
  if (request.requestedBy === user.username) throw new DomainError('You cannot review your own request.', 403);
  await assertReviewScope(user, request.space?.organizationId ?? null, (await prisma.operator.findUnique({ where: { username: request.requestedBy }, select: { organizationId: true } }))?.organizationId ?? null);

  if (action.type === 'startReview') {
    if (request.status !== 'SUBMITTED' && request.status !== 'NEEDS_INFO') throw new DomainError(`Cannot start review from ${request.status}.`, 409);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.spaceRequest.update({ where: { id }, data: { status: 'UNDER_REVIEW' }, include: { space: { select: { name: true } } } });
      await writeAudit(tx, { entityType: 'SpaceRequest', entityId: id, action: 'SpaceRequestReviewStarted', fieldName: 'status', oldValue: request.status, newValue: 'UNDER_REVIEW', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId });
      await notify({
        eventKey: `space_request:${id}:UNDER_REVIEW`,
        kind: 'SPACE_REQUEST_UNDER_REVIEW',
        title: 'Space request under review',
        body: `Your space request is being reviewed by ${user.username}.`,
        href: '/spaces/requests',
        recipientUsername: request.requestedBy
      }, tx);
      return updated;
    });
    invalidate();
    return mapSpaceRequest(row);
  }
  if (action.type === 'requestInfo') {
    if (request.status !== 'SUBMITTED' && request.status !== 'UNDER_REVIEW') throw new DomainError(`Cannot request information at ${request.status}.`, 409);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.spaceRequest.update({ where: { id }, data: { status: 'NEEDS_INFO', infoRequestReason: action.reason }, include: { space: { select: { name: true } } } });
      await writeAudit(tx, { entityType: 'SpaceRequest', entityId: id, action: 'SpaceRequestInfoRequested', fieldName: 'status', oldValue: request.status, newValue: 'NEEDS_INFO', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId, reason: action.reason });
      await notify({
        eventKey: `space_request:${id}:NEEDS_INFO:${Date.now()}`,
        kind: 'SPACE_REQUEST_NEEDS_INFO',
        title: 'Information requested on space request',
        body: `Reviewer requested details: ${action.reason}`,
        href: '/spaces/requests',
        recipientUsername: request.requestedBy
      }, tx);
      return updated;
    });
    invalidate();
    return mapSpaceRequest(row);
  }
  if (action.type === 'reject') {
    if (request.status !== 'SUBMITTED' && request.status !== 'UNDER_REVIEW' && request.status !== 'NEEDS_INFO') throw new DomainError(`Cannot reject at ${request.status}.`, 409);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.spaceRequest.update({ where: { id }, data: { status: 'REJECTED', reviewNote: action.reason, reviewedBy: user.username, reviewedAt: new Date() }, include: { space: { select: { name: true } } } });
      await writeAudit(tx, { entityType: 'SpaceRequest', entityId: id, action: 'SpaceRequestRejected', fieldName: 'status', oldValue: request.status, newValue: 'REJECTED', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId, reason: action.reason });
      await notify({
        eventKey: `space_request:${id}:REJECTED`,
        kind: 'SPACE_REQUEST_REJECTED',
        title: 'Space request rejected',
        body: `Your space request was rejected: ${action.reason}`,
        href: '/spaces/requests',
        recipientUsername: request.requestedBy
      }, tx);
      return updated;
    });
    invalidate();
    return mapSpaceRequest(row);
  }

  // approve — validated, transactional, idempotent apply to the canonical record.
  // Stored payloads are JSON and are re-validated here: never trust persisted proposal values.
  if (request.appliedAt) throw new DomainError('This request was already applied.', 409);
  if (request.status === 'APPROVED') throw new DomainError('Request already approved.', 409);
  const payload = spaceFieldSchema.parse(request.payload);

  if (request.type === 'REGISTER') {
    const requester = await prisma.operator.findUnique({ where: { username: request.requestedBy }, select: { organizationId: true } });
    if (!requester?.organizationId) throw new DomainError('The requester no longer has an organization to attach this space to.', 409);
    await prisma.$transaction(async (tx) => {
      const created = await tx.space.create({
        data: {
          assetCode: await nextSpaceCode(tx),
          organizationId: requester.organizationId as string,
          name: payload.name,
          category: payload.category,
          buildingOrCampus: payload.buildingOrCampus ?? null,
          addressLine: payload.addressLine ?? null,
          district: payload.district ?? null,
          lat: payload.lat ?? null,
          lng: payload.lng ?? null,
          capacity: payload.capacity,
          areaSqft: payload.areaSqft ?? null,
          operationalState: payload.operationalState ?? 'IDLE',
          description: payload.description ?? null,
          managerName: payload.managerName ?? null,
          contactOfficerName: payload.contactOfficerName ?? null,
          contactPhone: payload.contactPhone ?? null,
          amenities: payload.amenities ?? [],
          accessibility: payload.accessibility ?? [],
          operatingHours: payload.operatingHours ?? {},
          minBookingHours: payload.minBookingHours ?? 1,
          maxBookingHours: payload.maxBookingHours ?? 8,
          bookingLeadDays: payload.bookingLeadDays ?? 7,
          notes: payload.notes ?? null,
          createdBy: request.requestedBy
        }
      });
      await tx.spaceRequest.update({ where: { id }, data: { status: 'APPROVED', reviewNote: action.note ?? null, reviewedBy: user.username, reviewedAt: new Date(), appliedAt: new Date(), spaceId: created.id } });
      await writeAudit(tx, { entityType: 'SpaceRequest', entityId: id, action: 'SpaceRequestApproved', fieldName: 'status', oldValue: request.status, newValue: 'APPROVED', performedBy: user.username, performedByRole: user.role, organizationId: requester.organizationId, correlationId, reason: `Created ${created.assetCode}` });
      await writeAudit(tx, { entityType: 'Space', entityId: created.id, action: 'SpaceRegistered', newValue: created.assetCode, performedBy: user.username, performedByRole: user.role, organizationId: requester.organizationId, correlationId, reason: `Via request ${id}` });
      await notify({
        eventKey: `space_request:${id}:APPROVED`,
        kind: 'SPACE_REQUEST_APPROVED',
        title: 'Space registration approved',
        body: `Space "${payload.name}" has been approved and registered (${created.assetCode}).`,
        href: `/spaces/${created.id}`,
        recipientUsername: request.requestedBy
      }, tx);
      return created;
    }, { timeout: 15000, maxWait: 5000 });
    invalidate();
    const row = await prisma.spaceRequest.findUniqueOrThrow({ where: { id }, include: { space: { select: { name: true } } } });
    return mapSpaceRequest(row);
  }

  // UPDATE — apply the re-validated whitelist fields only
  const spaceId = request.spaceId as string;
  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space) throw new DomainError('The space this request points at no longer exists.', 404);
  const before = { name: space.name, capacity: space.capacity, operationalState: space.operationalState };
  const applied = await prisma.$transaction(async (tx) => {
    await tx.space.update({ where: { id: spaceId }, data: payload });
    const updated = await tx.spaceRequest.update({ where: { id }, data: { status: 'APPROVED', reviewNote: action.note ?? null, reviewedBy: user.username, reviewedAt: new Date(), appliedAt: new Date() }, include: { space: { select: { name: true } } } });
    await writeAudit(tx, { entityType: 'SpaceRequest', entityId: id, action: 'SpaceRequestApproved', fieldName: 'status', oldValue: request.status, newValue: 'APPROVED', performedBy: user.username, performedByRole: user.role, organizationId: space.organizationId, correlationId, reason: `Applied update to ${space.assetCode}` });
    await writeAudit(tx, { entityType: 'Space', entityId: spaceId, action: 'SpaceUpdatedViaRequest', oldValue: before as never, newValue: payload as never, performedBy: user.username, performedByRole: user.role, organizationId: space.organizationId, correlationId, reason: `Request ${id}` });
    await notify({
      eventKey: `space_request:${id}:APPROVED`,
      kind: 'SPACE_REQUEST_APPROVED',
      title: 'Space update approved',
      body: `Requested updates for "${space.name}" have been approved and applied.`,
      href: `/spaces/${spaceId}`,
      recipientUsername: request.requestedBy
    }, tx);
    return updated;
  }, { timeout: 15000, maxWait: 5000 });
  invalidate();
  return mapSpaceRequest(applied);
}
