import 'server-only';

import { prisma } from '@/lib/db/prisma';
import type { Organization, Prisma, Vehicle } from '@prisma/client';
import type { SessionUser } from '@/types';

type TxClient = Prisma.TransactionClient | typeof prisma;

/**
 * Resolves the set of organization ids visible to a user: their organization plus every
 * descendant in the hierarchy. ADMIN sees all organizations (returns null = "unbounded").
 * A user with no organization sees only an empty set (fail closed).
 */
export async function orgTree(user: SessionUser, tx: TxClient = prisma): Promise<string[] | null> {
  if (user.role === 'ADMIN') return null; // unbounded (platform scope)
  if (!user.organizationId) return [];
  return descendantOrgIds(user.organizationId, tx);
}

/** Returns the id plus all transitive descendant org ids (inclusive). */
export async function descendantOrgIds(rootId: string, tx: TxClient = prisma): Promise<string[]> {
  const all = await tx.organization.findMany({ select: { id: true, parentId: true } });
  const childrenByParent = new Map<string, string[]>();
  for (const org of all) {
    if (!org.parentId) continue;
    const list = childrenByParent.get(org.parentId) ?? [];
    list.push(org.id);
    childrenByParent.set(org.parentId, list);
  }
  const result: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    for (const child of childrenByParent.get(id) ?? []) stack.push(child);
  }
  return result;
}

/** The parent organization id of an org, or null at the root. */
export async function parentOrgId(orgId: string, tx: TxClient = prisma): Promise<string | null> {
  const org = await tx.organization.findUnique({ where: { id: orgId }, select: { parentId: true } });
  return org?.parentId ?? null;
}

/** True when `orgId` is inside the caller's own organization tree. */
export async function isOwnOrg(user: SessionUser, orgId: string, tx: TxClient = prisma): Promise<boolean> {
  const tree = await orgTree(user, tx);
  if (tree === null) return true; // ADMIN
  return tree.includes(orgId);
}

/**
 * A vehicle is DISCOVERABLE cross-org only when it is a verified, eligible, active
 * government-fleet vehicle. Everything else owned by another org is invisible (so existence
 * is not revealed). Own-org vehicles are always visible to their org tree.
 */
export function isDiscoverable(v: Pick<Vehicle, 'ownershipCategory' | 'eligibilityState' | 'operationalStatus'>): boolean {
  return (
    v.ownershipCategory === 'GOVERNMENT_FLEET' &&
    v.eligibilityState === 'ELIGIBLE' &&
    v.operationalStatus === 'ACTIVE'
  );
}

/** Whether a user can see a vehicle at all (own tree OR cross-org discoverable). */
export function canSeeVehicle(
  user: SessionUser,
  ownTreeOrgIds: string[] | null,
  v: Pick<Vehicle, 'organizationId' | 'ownershipCategory' | 'eligibilityState' | 'operationalStatus'>
): { visible: boolean; isOwn: boolean } {
  const isOwn = ownTreeOrgIds === null || ownTreeOrgIds.includes(v.organizationId);
  if (isOwn) return { visible: true, isOwn: true };
  return { visible: isDiscoverable(v), isOwn: false };
}

// ---------------------------------------------------------------------------
// Masking helpers (spec 14/17: limit fields disclosed across org boundaries)
// ---------------------------------------------------------------------------

/**
 * Masks a registration/normalized identifier as `MP07-**-1234`: keeps the leading region
 * group and the trailing group, masking the middle. Falls back to masking the middle of
 * the raw string when the expected shape is absent.
 */
export function maskRegistration(registration: string): string {
  const parts = registration.split('-');
  if (parts.length >= 3) {
    const head = parts[0];
    const tail = parts[parts.length - 1];
    return `${head}-**-${tail}`;
  }
  const trimmed = registration.replace(/\s+/gu, '');
  if (trimmed.length <= 4) return '****';
  const head = trimmed.slice(0, Math.min(4, trimmed.length - 4));
  const tail = trimmed.slice(-4);
  return `${head}-**-${tail}`;
}

/** Coarsens a coordinate to ~1.1km precision (2 decimal places) for cross-org display. */
export function coarsenCoordinate(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

export interface Position {
  lat: number | null;
  lng: number | null;
}

/** Returns a coarse position for foreign callers; exact position only for the owning org. */
export function positionFor(isOwn: boolean, pos: Position): Position {
  if (isOwn) return pos;
  return { lat: coarsenCoordinate(pos.lat), lng: coarsenCoordinate(pos.lng) };
}

/** A short organization label map by id (for building view labels). */
export async function orgNameMap(tx: TxClient = prisma): Promise<Map<string, string>> {
  const orgs = await tx.organization.findMany({ select: { id: true, name: true } });
  return new Map(orgs.map((o: Pick<Organization, 'id' | 'name'>) => [o.id, o.name]));
}
