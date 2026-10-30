import type { Permission, Role } from '@/types';

export type { Permission } from '@/types';

/**
 * The full list of permissions understood by the backend. Kept in sync with the
 * `Permission` union in `types/index.ts` (source of truth).
 */
export const ALL_PERMISSIONS: readonly Permission[] = [
  'fleet.read',
  'vehicle.register',
  'vehicle.edit',
  'vehicle.delete',
  'eligibility.verify',
  'restriction.manage',
  'maintenance.write',
  'trip.write',
  'incident.write',
  'request.create',
  'request.review',
  'handover.record',
  'return.record',
  'return.inspect',
  'extension.decide',
  'transfer.create',
  'transfer.review',
  'device.manage',
  'document.read',
  'document.write',
  'audit.read',
  'report.read',
  'export',
  'space.manage',
  'space.book',
  'space.review',
  'settings.manage',
  'operators.manage'
];

/**
 * Authoritative permission matrix (spec files 13, 18, 19 and the build contract).
 *
 * Scope qualifiers (own tree / own station / verifier must differ from submitter /
 * transfer.review only as source station / never own request unless settings.allowSelfApproval)
 * are NOT expressible here - they are enforced in `lib/auth/scope.ts` and the domain
 * services. `can()` only answers "does this role hold the capability at all".
 *
 * ADMIN is a PLATFORM administrator: it can configure the platform, manage operators and
 * devices, and read aggregates/audit, but it explicitly cannot approve requests, verify
 * eligibility, record handovers/returns, or read documents.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: [
    'fleet.read',
    'vehicle.register',
    'vehicle.edit',
    'vehicle.delete',
    'eligibility.verify',
    'restriction.manage',
    'maintenance.write',
    'trip.write',
    'incident.write',
    'request.create',
    'request.review',
    'handover.record',
    'return.record',
    'return.inspect',
    'extension.decide',
    'transfer.create',
    'transfer.review',
    'device.manage',
    'document.read',
    'document.write',
    'space.manage',
    'space.book',
    'space.review',
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
    'space.manage',
    'space.book',
    'space.review',
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
    'handover.record',
    'return.record',
    'return.inspect',
    'extension.decide',
    'transfer.create',
    'transfer.review',
    'document.read',
    'space.manage',
    'space.book',
    'space.review',
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

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Roles that can decide a request (approver roles). ADMIN and ORG_ADMIN can also approve. */
export function isApproverRole(role: Role): boolean {
  return role === 'DEPT_OFFICER' || role === 'ADMIN' || role === 'ORG_ADMIN';
}
