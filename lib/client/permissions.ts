import type { Permission, Role } from '@/types';

/**
 * Client-side mirror of the permission matrix (authoritative check is server-side in
 * lib/auth/roles.ts). Used only to show/hide UI affordances; never for enforcement.
 *
 * Mirrors docs/BUILD_CONTRACT.md "Roles and permissions" table exactly.
 * ADMIN is a *platform* administrator: it cannot approve, verify eligibility,
 * record handovers or read documents.
 */

export type { Permission } from '@/types';

const MATRIX: Record<Role, Permission[]> = {
  ADMIN: [
    'fleet.read',
    'device.manage',
    'audit.read',
    'report.read',
    'export',
    'settings.manage',
    'operators.manage'
  ],
  ORG_ADMIN: [
    'fleet.read',
    'vehicle.register',
    'vehicle.edit',
    'eligibility.verify',
    'restriction.manage',
    'maintenance.write',
    'trip.write',
    'incident.write',
    'request.create',
    'handover.record',
    'return.record',
    'transfer.create',
    'transfer.review',
    'device.manage',
    'document.read',
    'document.write',
    'audit.read',
    'report.read',
    'export'
  ],
  DEPT_OFFICER: [
    'fleet.read',
    'restriction.manage',
    'maintenance.write',
    'trip.write',
    'incident.write',
    'request.create',
    'request.review',
    'extension.decide',
    'return.inspect',
    'handover.record',
    'return.record',
    'transfer.create',
    'transfer.review',
    'document.read',
    'audit.read',
    'report.read',
    'export'
  ],
  STATION_OFFICER: [
    'fleet.read',
    'vehicle.edit',
    'maintenance.write',
    'trip.write',
    'incident.write',
    'request.create',
    'handover.record',
    'return.record',
    'transfer.create',
    'transfer.review',
    'document.read',
    'report.read'
  ],
  FIELD_STAFF: ['fleet.read', 'trip.write', 'incident.write'],
  AUDITOR: ['fleet.read', 'document.read', 'audit.read', 'report.read', 'export']
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(permission) ?? false;
}

/** True when the role has any of the listed permissions. */
export function canAny(role: Role | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}
