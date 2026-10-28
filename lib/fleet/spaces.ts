import type { SpaceView } from '@/types';

/**
 * Civic Spaces booking policy (spec 09). Pure functions only — the ops layer owns
 * transactions and authorization. All times are stored UTC; operating hours are
 * interpreted in IST (UTC+05:30, no DST), the platform's authoritative timezone.
 */

const IST_OFFSET_MIN = 330;

/** Shift a UTC instant into the matching IST wall-clock instant (fixed offset — safe arithmetic). */
export function toIstWallClock(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MIN * 60_000);
}

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function dayKeyFor(date: Date): DayKey {
  return DAY_KEYS[toIstWallClock(date).getUTCDay()];
}

export function hoursBetween(startAt: Date, endAt: Date): number {
  return (endAt.getTime() - startAt.getTime()) / 3_600_000;
}

function parseHhMm(value: string): { h: number; m: number } {
  const [h, m] = value.split(':').map((x) => parseInt(x, 10));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

function minutesOfDayIst(date: Date): number {
  const ist = toIstWallClock(date);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

export interface OperatingWindow {
  openMin: number;
  closeMin: number;
}

export function operatingWindowFor(space: Pick<SpaceView, 'operatingHours'>, day: DayKey): OperatingWindow | null {
  const hours = (space.operatingHours ?? {}) as Partial<Record<DayKey, [string, string]>>;
  const window = hours[day];
  if (!window || window.length !== 2) return null;
  const open = parseHhMm(window[0]);
  const close = parseHhMm(window[1]);
  return { openMin: open.h * 60 + open.m, closeMin: close.h * 60 + close.m };
}

export type BookingPolicyRejection =
  | 'SPACE_NOT_BOOKABLE'
  | 'OUTSIDE_OPERATING_HOURS'
  | 'DURATION_TOO_SHORT'
  | 'DURATION_TOO_LONG'
  | 'TOO_EARLY'
  | 'IN_THE_PAST'
  | 'MULTI_DAY_UNSUPPORTED'
  | 'CAPACITY_EXCEEDED';

/** Pure policy check for a requested booking window (spec: operating hours, duration, window, capacity). */
export function bookingPolicyRejection(
  space: Pick<SpaceView, 'operationalState' | 'operatingHours' | 'minBookingHours' | 'maxBookingHours' | 'bookingLeadDays' | 'capacity'>,
  startAt: Date,
  endAt: Date,
  now: Date,
  attendees?: number | null
): BookingPolicyRejection | null {
  if (space.operationalState === 'RESTRICTED' || space.operationalState === 'RETIRED') return 'SPACE_NOT_BOOKABLE';
  if (startAt.getTime() <= now.getTime()) return 'IN_THE_PAST';
  if (endAt.getTime() <= startAt.getTime()) return 'DURATION_TOO_SHORT';

  const startDay = dayKeyFor(startAt);
  const endDay = dayKeyFor(new Date(endAt.getTime() - 60_000)); // an 21:00 end is the close of the start day
  if (startDay !== endDay) return 'MULTI_DAY_UNSUPPORTED';

  const hours = hoursBetween(startAt, endAt);
  if (hours < space.minBookingHours) return 'DURATION_TOO_SHORT';
  if (hours > space.maxBookingHours) return 'DURATION_TOO_LONG';

  const window = operatingWindowFor(space, startDay);
  if (!window) return 'OUTSIDE_OPERATING_HOURS';
  const startMin = minutesOfDayIst(startAt);
  const endMin = minutesOfDayIst(endAt);
  if (startMin < window.openMin || endMin > window.closeMin || endMin <= startMin) return 'OUTSIDE_OPERATING_HOURS';

  const maxStart = now.getTime() + Math.max(space.bookingLeadDays, 0) * 86_400_000;
  if (startAt.getTime() > maxStart) return 'TOO_EARLY';

  if (attendees != null && space.capacity > 0 && attendees > space.capacity) return 'CAPACITY_EXCEEDED';
  return null;
}

export type SlotState = 'available' | 'pending approval' | 'booked' | 'blocked' | 'maintenance';

export interface SlotOverlap {
  status: 'PENDING' | 'CONFIRMED';
  startAt: Date;
  endAt: Date;
}

/** Spec 09 slot state: available | pending approval | booked | blocked | maintenance (text, not colour only). */
export function slotStateFor(
  space: Pick<SpaceView, 'operationalState' | 'operatingHours'>,
  overlappingBookings: SlotOverlap[],
  blockingMaintenance: boolean,
  at: Date
): SlotState {
  if (space.operationalState === 'RESTRICTED') return 'blocked';
  if (space.operationalState === 'RETIRED') return 'blocked';
  if (blockingMaintenance) return 'maintenance';
  if (overlappingBookings.some((b) => b.status === 'CONFIRMED' && b.startAt <= at && b.endAt > at)) return 'booked';
  if (overlappingBookings.some((b) => b.status === 'PENDING' && b.startAt <= at && b.endAt > at)) return 'pending approval';
  const window = operatingWindowFor(space, dayKeyFor(at));
  if (!window) return 'blocked';
  const min = minutesOfDayIst(at);
  if (min < window.openMin || min >= window.closeMin) return 'blocked';
  return 'available';
}

/** Whole days since the last booking (CONFIRMED/COMPLETED) ended; null if never booked or a booking is live. */
export function spaceIdleDays(lastBookingEnd: Date | null, busyNow: boolean, now: Date): number | null {
  if (!lastBookingEnd || busyNow) return null;
  return Math.max(0, Math.floor((now.getTime() - lastBookingEnd.getTime()) / 86_400_000));
}

export const SPACE_STATE_LABEL: Record<string, string> = {
  AVAILABLE: 'Available',
  IDLE: 'Idle',
  RESTRICTED: 'Restricted',
  RETIRED: 'Retired'
};

export const SPACE_BOOKING_STATE_LABEL: Record<string, string> = {
  upcoming: 'Upcoming',
  pending: 'Pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected'
};
