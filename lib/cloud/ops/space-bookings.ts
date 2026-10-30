import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser, SpaceBookingView, SpaceView } from '@/types';
import type { SpaceBookingInputParsed, SpaceBookingActionParsed, SpaceBookingSearchParsed } from '@/lib/validation/schemas';
import { writeAudit } from '@/lib/cloud/audit';
import { DomainError } from '@/lib/cloud/errors';
import { CLOUD_CACHE_TAGS, invalidateCloudData } from '@/lib/cloud/cached-queries';
import { mapSpaceBooking } from '@/lib/cloud/mappers';
import { nextSpaceBookingCode } from '@/lib/cloud/codes';
import { orgTree } from '@/lib/auth/scope';
import { bookingPolicyRejection, hoursBetween } from '@/lib/fleet/spaces';
import { loadSpaceSettings } from '@/lib/cloud/ops/space-settings';
import { notify } from '@/lib/cloud/notifications';

function invalidate() {
  invalidateCloudData(CLOUD_CACHE_TAGS.fleet, CLOUD_CACHE_TAGS.ops, CLOUD_CACHE_TAGS.all);
}

const LIVE_STATUSES: string[] = ['PENDING', 'CONFIRMED'];

function isOverlapViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.message.includes('space_booking_no_overlap');
}

async function loadBooking(id: string) {
  const booking = await prisma.spaceBooking.findUnique({ where: { id }, include: { space: { select: { name: true, assetCode: true } } } });
  if (!booking) throw new DomainError('Booking not found.', 404);
  return booking;
}

/**
 * Server-side availability revalidation (spec 09): a slot is free only when no live
 * booking overlaps and no booking-blocking maintenance window overlaps.
 */
async function assertSlotFree(tx: Prisma.TransactionClient, spaceId: string, startAt: Date, endAt: Date, ignoreBookingId?: string): Promise<void> {
  const overlap = await tx.spaceBooking.findFirst({
    where: { spaceId, status: { in: LIVE_STATUSES }, id: ignoreBookingId ? { not: ignoreBookingId } : undefined, startAt: { lt: endAt }, endAt: { gt: startAt } },
    select: { bookingCode: true }
  });
  if (overlap) throw new DomainError(`That slot was just taken by booking ${overlap.bookingCode}.`, 409);
  // Maintenance windows are open-ended until resolved: any unresolved blocking ticket blocks all future slots.
  const blocking = await tx.spaceMaintenance.findFirst({
    where: { spaceId, status: { in: ['OPEN', 'IN_PROGRESS'] }, blocksBooking: true },
    select: { title: true }
  });
  if (blocking) throw new DomainError(`Space is under maintenance (${blocking.title}).`, 409);
}

export async function createSpaceBooking(user: SessionUser, input: SpaceBookingInputParsed, correlationId: string): Promise<SpaceBookingView> {
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const now = new Date();

  const booking = await prisma.$transaction(async (tx) => {
    const space = await tx.space.findUnique({ where: { id: input.spaceId } });
    if (!space) throw new DomainError('Space not found.', 404);

    const rejection = bookingPolicyRejection({
      operationalState: space.operationalState as SpaceView['operationalState'],
      operatingHours: (space.operatingHours ?? {}) as never,
      minBookingHours: space.minBookingHours,
      maxBookingHours: space.maxBookingHours,
      bookingLeadDays: space.bookingLeadDays,
      capacity: space.capacity
    }, startAt, endAt, now, input.attendees ?? null);
    if (rejection) {
      throw new DomainError(`Booking rejected by policy: ${rejection.replaceAll('_', ' ').toLowerCase()}.`, 422);
    }

    await assertSlotFree(tx, space.id, startAt, endAt);

    const settings = await loadSpaceSettings();
    const autoConfirm = settings.approvalThresholdHours > 0 && hoursBetween(startAt, endAt) <= settings.approvalThresholdHours;
    const row = await tx.spaceBooking.create({
      data: {
        bookingCode: await nextSpaceBookingCode(tx),
        spaceId: space.id,
        requestedBy: user.username,
        requestedForOrgId: input.requestedForOrgId ?? user.organizationId ?? null,
        purpose: input.purpose,
        attendees: input.attendees ?? null,
        startAt,
        endAt,
        status: autoConfirm ? 'CONFIRMED' : 'PENDING',
        approvedBy: autoConfirm ? `auto ≤${settings.approvalThresholdHours}h` : null,
        approvedAt: autoConfirm ? new Date() : null
      },
      include: { space: { select: { name: true, assetCode: true } } }
    });
    await writeAudit(tx, { entityType: 'SpaceBooking', entityId: row.id, action: 'SpaceBookingCreated', newValue: row.bookingCode, performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId, reason: `${space.assetCode} ${startAt.toISOString()} → ${endAt.toISOString()}` });

    if (autoConfirm) {
      await notify({
        eventKey: `space_booking:${row.id}:CONFIRMED`,
        kind: 'SPACE_BOOKING_CONFIRMED',
        title: 'Space booking auto-confirmed',
        body: `Booking ${row.bookingCode} for ${space.name} has been confirmed.`,
        href: '/spaces/bookings',
        recipientUsername: user.username
      }, tx);
    } else {
      await notify({
        eventKey: `space_booking:${row.id}:PENDING`,
        kind: 'SPACE_BOOKING_PENDING',
        title: 'New space booking request',
        body: `Booking ${row.bookingCode} requested by ${user.username} for ${space.name} (${input.attendees ?? 'unspecified'} attendees).`,
        href: '/spaces/bookings',
        recipientOrgId: space.organizationId,
        recipientRole: 'DEPT_OFFICER'
      }, tx);
    }

    return row;
  }, { timeout: 20000, maxWait: 10000 }).catch((error) => {
    if (isOverlapViolation(error)) throw new DomainError('That slot was just taken by another request. Pick a different time.', 409);
    throw error;
  });

  invalidate();
  return mapSpaceBooking(booking);
}

/** Reviewers see bookings for spaces inside their org tree; requesters only their own. */
async function assertCanReview(user: SessionUser, spaceOrganizationId: string, requestedBy: string): Promise<void> {
  if (requestedBy === user.username) throw new DomainError('You cannot review your own booking.', 403);
  const tree = await orgTree(user);
  if (tree !== null && !tree.includes(spaceOrganizationId)) {
    throw new DomainError('This booking belongs to another organization.', 403);
  }
}

export async function applySpaceBookingAction(user: SessionUser, id: string, action: SpaceBookingActionParsed, correlationId: string): Promise<SpaceBookingView> {
  const current = await loadBooking(id);

  const updated = await prisma.$transaction(async (tx) => {
    if (action.type === 'approve') {
      if (current.status !== 'PENDING') throw new DomainError(`Only pending bookings can be approved (this one is ${current.status}).`, 409);
      await assertCanReview(user, (await tx.space.findUniqueOrThrow({ where: { id: current.spaceId }, select: { organizationId: true } })).organizationId, current.requestedBy);
      await assertSlotFree(tx, current.spaceId, current.startAt, current.endAt, current.id);
      const row = await tx.spaceBooking.update({ where: { id }, data: { status: 'CONFIRMED', approvedBy: user.username, approvedAt: new Date(), reviewNote: action.note ?? null }, include: { space: { select: { name: true, assetCode: true } } } });
      await writeAudit(tx, { entityType: 'SpaceBooking', entityId: id, action: 'SpaceBookingApproved', fieldName: 'status', oldValue: 'PENDING', newValue: 'CONFIRMED', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId });
      await notify({
        eventKey: `space_booking:${id}:APPROVED`,
        kind: 'SPACE_BOOKING_APPROVED',
        title: 'Space booking confirmed',
        body: `Booking ${row.bookingCode} for ${row.space.name} has been approved.${action.note ? ` Note: ${action.note}` : ''}`,
        href: '/spaces/bookings',
        recipientUsername: current.requestedBy
      }, tx);
      return row;
    }
    if (action.type === 'reject') {
      if (current.status !== 'PENDING') throw new DomainError(`Only pending bookings can be rejected (this one is ${current.status}).`, 409);
      await assertCanReview(user, (await tx.space.findUniqueOrThrow({ where: { id: current.spaceId }, select: { organizationId: true } })).organizationId, current.requestedBy);
      const row = await tx.spaceBooking.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: action.reason }, include: { space: { select: { name: true, assetCode: true } } } });
      await writeAudit(tx, { entityType: 'SpaceBooking', entityId: id, action: 'SpaceBookingRejected', fieldName: 'status', oldValue: 'PENDING', newValue: 'REJECTED', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId, reason: action.reason });
      await notify({
        eventKey: `space_booking:${id}:REJECTED`,
        kind: 'SPACE_BOOKING_REJECTED',
        title: 'Space booking rejected',
        body: `Booking ${row.bookingCode} for ${row.space.name} was rejected: ${action.reason}`,
        href: '/spaces/bookings',
        recipientUsername: current.requestedBy
      }, tx);
      return row;
    }
    if (action.type === 'cancel') {
      if (current.status !== 'PENDING' && current.status !== 'CONFIRMED') throw new DomainError(`A ${current.status.toLowerCase()} booking cannot be cancelled.`, 409);
      const mayCancel = current.requestedBy === user.username || (await canReviewSilent(user, current.spaceId));
      if (!mayCancel) throw new DomainError('Only the requester or a reviewing officer can cancel this booking.', 403);
      const row = await tx.spaceBooking.update({ where: { id }, data: { status: 'CANCELLED', cancelledBy: user.username, cancelledAt: new Date(), cancellationReason: action.reason }, include: { space: { select: { name: true, assetCode: true } } } });
      await writeAudit(tx, { entityType: 'SpaceBooking', entityId: id, action: 'SpaceBookingCancelled', fieldName: 'status', oldValue: current.status, newValue: 'CANCELLED', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId, reason: action.reason });

      const cancelledByRequester = current.requestedBy === user.username;
      if (cancelledByRequester) {
        const spaceOrg = (await tx.space.findUnique({ where: { id: current.spaceId }, select: { organizationId: true } }))?.organizationId;
        if (spaceOrg) {
          await notify({
            eventKey: `space_booking:${id}:CANCELLED:${Date.now()}`,
            kind: 'SPACE_BOOKING_CANCELLED',
            title: 'Space booking cancelled',
            body: `Booking ${row.bookingCode} for ${row.space.name} was cancelled by ${user.username}.${action.reason ? ` Reason: ${action.reason}` : ''}`,
            href: '/spaces/bookings',
            recipientOrgId: spaceOrg,
            recipientRole: 'DEPT_OFFICER'
          }, tx);
        }
      } else {
        await notify({
          eventKey: `space_booking:${id}:CANCELLED_BY_ADMIN:${Date.now()}`,
          kind: 'SPACE_BOOKING_CANCELLED',
          title: 'Space booking cancelled',
          body: `Booking ${row.bookingCode} for ${row.space.name} was cancelled: ${action.reason}`,
          href: '/spaces/bookings',
          recipientUsername: current.requestedBy
        }, tx);
      }

      return row;
    }
    if (action.type === 'relocate') {
      await assertCanReview(user, (await tx.space.findUniqueOrThrow({ where: { id: current.spaceId }, select: { organizationId: true } })).organizationId, current.requestedBy);
      const newSpace = await tx.space.findUnique({ where: { id: action.targetSpaceId } });
      if (!newSpace) throw new DomainError('Target space not found.', 404);
      await assertSlotFree(tx, newSpace.id, current.startAt, current.endAt, current.id);
      const note = action.reason ? `Relocated from ${current.space.name}: ${action.reason}` : `Relocated from ${current.space.name}`;
      const row = await tx.spaceBooking.update({
        where: { id },
        data: { spaceId: newSpace.id, reviewNote: note },
        include: { space: { select: { name: true, assetCode: true } } }
      });
      await writeAudit(tx, { entityType: 'SpaceBooking', entityId: id, action: 'SpaceBookingRelocated', fieldName: 'spaceId', oldValue: current.spaceId, newValue: newSpace.id, performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId, reason: action.reason ?? `Relocated from ${current.space.name} to ${newSpace.name}` });
      await notify({
        eventKey: `space_booking:${id}:RELOCATED:${Date.now()}`,
        kind: 'SPACE_BOOKING_RELOCATED',
        title: 'Space booking relocated',
        body: `Booking ${row.bookingCode} was relocated to ${newSpace.name} (${newSpace.assetCode}).${action.reason ? ` Reason: ${action.reason}` : ''}`,
        href: '/spaces/bookings',
        recipientUsername: current.requestedBy
      }, tx);
      return row;
    }
    // complete
    if (current.status !== 'CONFIRMED') throw new DomainError(`Only confirmed bookings can be completed (this one is ${current.status}).`, 409);
    await assertCanReview(user, (await tx.space.findUniqueOrThrow({ where: { id: current.spaceId }, select: { organizationId: true } })).organizationId, current.requestedBy);
    const row = await tx.spaceBooking.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date(), reviewNote: action.note ?? current.reviewNote }, include: { space: { select: { name: true, assetCode: true } } } });
    await writeAudit(tx, { entityType: 'SpaceBooking', entityId: id, action: 'SpaceBookingCompleted', fieldName: 'status', oldValue: 'CONFIRMED', newValue: 'COMPLETED', performedBy: user.username, performedByRole: user.role, organizationId: user.organizationId, correlationId });
    return row;
  }, { timeout: 20000, maxWait: 10000 }).catch((error) => {
    if (isOverlapViolation(error)) throw new DomainError('That slot conflicts with another confirmed booking.', 409);
    throw error;
  });

  invalidate();
  return mapSpaceBooking(updated);
}

async function canReviewSilent(user: SessionUser, spaceId: string): Promise<boolean> {
  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { organizationId: true } });
  if (!space) return false;
  try {
    await assertCanReview(user, space.organizationId, '');
    return true;
  } catch {
    return false;
  }
}

export async function listSpaceBookings(user: SessionUser, filters: SpaceBookingSearchParsed): Promise<{ bookings: SpaceBookingView[]; total: number }> {
  const and: Prisma.SpaceBookingWhereInput[] = [];
  if (filters.scope === 'mine') {
    and.push({ requestedBy: user.username });
  } else if (filters.scope === 'review') {
    const tree = await orgTree(user);
    if (tree === null) {
      // platform admin sees all pending/reviewable
    } else {
      and.push({ space: { organizationId: { in: tree } } });
    }
  } else if (filters.scope === 'space' && filters.spaceId) {
    and.push({ spaceId: filters.spaceId });
  }
  const now = new Date();
  if (filters.bucket === 'upcoming') and.push({ status: 'CONFIRMED', startAt: { gt: now } });
  if (filters.bucket === 'pending') and.push({ status: 'PENDING' });
  if (filters.bucket === 'completed') and.push({ status: 'COMPLETED' });
  if (filters.bucket === 'cancelled') and.push({ status: 'CANCELLED' });
  if (filters.bucket === 'rejected') and.push({ status: 'REJECTED' });

  const where: Prisma.SpaceBookingWhereInput = and.length ? { AND: and } : {};
  const [rows, total] = await Promise.all([
    prisma.spaceBooking.findMany({ where, orderBy: { startAt: 'desc' }, take: 200, include: { space: { select: { name: true, assetCode: true } } } }),
    prisma.spaceBooking.count({ where })
  ]);
  return { bookings: rows.map(mapSpaceBooking), total };
}

/** Slots for the booking calendar (spec 09): live bookings of one space in a window. */
export async function spaceCalendar(user: SessionUser, spaceId: string, fromISO: string, toISO: string): Promise<{ bookings: SpaceBookingView[]; blocked: boolean }> {
  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { organizationId: true } });
  if (!space) throw new DomainError('Space not found.', 404);
  const tree = await orgTree(user);
  if (tree !== null && !tree.includes(space.organizationId)) throw new DomainError('This space belongs to another organization.', 403);
  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw new DomainError('Invalid calendar window.', 400);
  const [rows, blocking] = await Promise.all([
    prisma.spaceBooking.findMany({ where: { spaceId, status: { in: LIVE_STATUSES }, startAt: { lt: to }, endAt: { gt: from } }, orderBy: { startAt: 'asc' }, include: { space: { select: { name: true, assetCode: true } } } }),
    prisma.spaceMaintenance.findFirst({ where: { spaceId, status: { in: ['OPEN', 'IN_PROGRESS'] }, blocksBooking: true }, select: { id: true } })
  ]);
  return { bookings: rows.map(mapSpaceBooking), blocked: blocking != null };
}
