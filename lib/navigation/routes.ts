import type { Permission } from '@/types';

export interface NavRouteItem {
  href: string;
  label: string;
  requiresAny?: Permission[];
  showIfStation?: boolean;
  badge?: string;
}

export const SPACES_HREFS = new Set(['/spaces', '/spaces/bookings', '/spaces/requests', '/spaces/settings']);
export const SHARED_HREFS = new Set(['/reports', '/audit', '/settings']);

export const NAV_ROUTE_ITEMS: NavRouteItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/vehicles', label: 'Fleet', requiresAny: ['fleet.read'] },
  { href: '/vehicles/discover', label: 'Discover', requiresAny: ['request.create', 'fleet.read'] },
  { href: '/vehicles/map', label: 'Live map', requiresAny: ['fleet.read'] },
  {
    href: '/requests',
    label: 'Requests',
    requiresAny: ['request.create', 'request.review', 'fleet.read']
  },
  {
    href: '/allocations',
    label: 'Allocations',
    requiresAny: ['handover.record', 'return.record', 'request.review', 'fleet.read']
  },
  { href: '/operations', label: 'Operations', requiresAny: ['fleet.read', 'report.read'] },
  { href: '/stations', label: 'Stations', requiresAny: ['fleet.read'] },
  { href: '/transfers', label: 'Transfers', requiresAny: ['transfer.create', 'transfer.review'] },
  { href: '/compliance', label: 'Compliance', requiresAny: ['fleet.read'] },
  { href: '/maintenance', label: 'Maintenance', requiresAny: ['maintenance.write', 'fleet.read'] },
  { href: '/idle', label: 'Idle & reuse', requiresAny: ['fleet.read'] },
  { href: '/incidents', label: 'Incidents' },
  { href: '/iot', label: 'IoT hub', requiresAny: ['device.manage', 'fleet.read'] },
  { href: '/spaces', label: 'Spaces', requiresAny: ['space.manage', 'space.book', 'space.review'] },
  { href: '/spaces/bookings', label: 'Space bookings', requiresAny: ['space.manage', 'space.book'] },
  { href: '/spaces/requests', label: 'Space requests', requiresAny: ['space.manage', 'space.review'] },
  { href: '/spaces/settings', label: 'Booking policy', requiresAny: ['space.manage'] },
  { href: '/reports', label: 'Reports', requiresAny: ['report.read'] },
  { href: '/audit', label: 'Audit', requiresAny: ['audit.read'] },
  { href: '/settings', label: 'Settings' },
  { href: '/station', label: 'My station', showIfStation: true }
];

export const VEHICLES_GROUPS: { id: string; heading: string | null; hrefs: string[] }[] = [
  { id: 'overview', heading: null, hrefs: ['/dashboard'] },
  { id: 'fleet', heading: 'Fleet', hrefs: ['/vehicles', '/vehicles/discover', '/vehicles/map', '/stations'] },
  { id: 'requests', heading: 'Requests', hrefs: ['/requests', '/allocations', '/transfers'] },
  { id: 'oversight', heading: 'Oversight', hrefs: ['/operations', '/compliance', '/maintenance', '/idle', '/incidents', '/iot'] },
  { id: 'insights', heading: 'Insights', hrefs: ['/reports', '/audit'] },
  { id: 'more', heading: 'More', hrefs: ['/settings', '/station'] }
];

export const SPACES_GROUPS: { id: string; heading: string | null; hrefs: string[] }[] = [
  { id: 'spaces', heading: 'Spaces', hrefs: ['/spaces', '/spaces/bookings', '/spaces/requests', '/spaces/settings'] },
  { id: 'insights', heading: 'Insights', hrefs: ['/reports', '/audit'] },
  { id: 'more', heading: 'More', hrefs: ['/settings'] }
];

