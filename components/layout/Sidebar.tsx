'use client';

import { Fragment, useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LoaderCircle, LogOut, X } from 'lucide-react';
import type { Role } from '@/types';
import { canAny, type Permission } from '@/lib/client/permissions';
import { useFleet } from '@/components/providers/FleetProvider';
import { useActiveModule } from '@/lib/client/useModule';
import type { AnimatedIconProps } from '@/components/ui/AnimatedIcons';
import {
  AnimatedDashboard,
  AnimatedCar,
  AnimatedMap,
  AnimatedBuilding,
  AnimatedTransfer,
  AnimatedClipboard,
  AnimatedShieldCheck,
  AnimatedWrench,
  AnimatedClock,
  AnimatedSiren,
  AnimatedRadio,
  AnimatedBarChart,
  AnimatedLedger,
  AnimatedGear,
  AnimatedLayout,
  AnimatedSearch,
  AnimatedKey,
  AnimatedActivity
} from '@/components/ui/AnimatedIcons';

type IconComponent = ComponentType<AnimatedIconProps>;

interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
  /** Visible to any of these permissions (OR). Undefined = always visible when authenticated. */
  requiresAny?: Permission[];
  /** Only visible when the signed-in operator has a station attached. */
  showIfStation?: boolean;
  /** Which module this entry belongs to; 'shared' shows in both. */
  domain?: 'vehicles' | 'spaces' | 'shared';
  badge?: string;
}

/** Navigation per BUILD_CONTRACT sidebar order. */
const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: AnimatedDashboard },
  { href: '/vehicles', label: 'Fleet', icon: AnimatedCar, requiresAny: ['fleet.read'] },
  { href: '/vehicles/discover', label: 'Discover', icon: AnimatedSearch, requiresAny: ['request.create', 'fleet.read'] },
  { href: '/vehicles/map', label: 'Live map', icon: AnimatedMap, requiresAny: ['fleet.read'] },
  {
    href: '/requests',
    label: 'Requests',
    icon: AnimatedClipboard,
    requiresAny: ['request.create', 'request.review', 'fleet.read']
  },
  {
    href: '/allocations',
    label: 'Allocations',
    icon: AnimatedKey,
    requiresAny: ['handover.record', 'return.record', 'request.review', 'fleet.read']
  },
  { href: '/operations', label: 'Operations', icon: AnimatedActivity, requiresAny: ['fleet.read', 'report.read'] },
  { href: '/stations', label: 'Stations', icon: AnimatedBuilding, requiresAny: ['fleet.read'] },
  { href: '/transfers', label: 'Transfers', icon: AnimatedTransfer, requiresAny: ['transfer.create', 'transfer.review'] },
  { href: '/compliance', label: 'Compliance', icon: AnimatedShieldCheck, requiresAny: ['fleet.read'] },
  { href: '/maintenance', label: 'Maintenance', icon: AnimatedWrench, requiresAny: ['maintenance.write', 'fleet.read'] },
  { href: '/idle', label: 'Idle & reuse', icon: AnimatedClock, requiresAny: ['fleet.read'] },
  { href: '/incidents', label: 'Incidents', icon: AnimatedSiren },
  { href: '/iot', label: 'IoT hub', icon: AnimatedRadio, requiresAny: ['device.manage', 'fleet.read'] },
  { href: '/station', label: 'My station', icon: AnimatedBuilding, showIfStation: true },
  { href: '/reports', label: 'Reports', icon: AnimatedBarChart, requiresAny: ['report.read'] },
  { href: '/audit', label: 'Audit', icon: AnimatedLedger, requiresAny: ['audit.read'], domain: 'shared' },
  { href: '/settings', label: 'Settings', icon: AnimatedGear, requiresAny: ['settings.manage'], domain: 'shared' },
  { href: '/spaces', label: 'Spaces', icon: AnimatedLayout, requiresAny: ['fleet.read'], domain: 'spaces' },
  { href: '/spaces/bookings', label: 'Space bookings', icon: AnimatedClipboard, requiresAny: ['space.book', 'fleet.read'], domain: 'spaces' },
  { href: '/spaces/requests', label: 'Space requests', icon: AnimatedLedger, requiresAny: ['space.book', 'fleet.read'], domain: 'spaces' },
  { href: '/spaces/settings', label: 'Booking policy', icon: AnimatedGear, requiresAny: ['settings.manage'], domain: 'spaces' }
];

/** Sidebar sections. Items keep their permission filtering; this only decides order and headings. */
const GROUPS: { id: string; heading: string | null; domain: 'vehicles' | 'spaces' | 'shared'; hrefs: string[] }[] = [
  { id: 'overview', heading: null, domain: 'vehicles', hrefs: ['/dashboard'] },
  { id: 'fleet', heading: 'Fleet', domain: 'vehicles', hrefs: ['/vehicles', '/vehicles/discover', '/vehicles/map', '/stations'] },
  { id: 'requests', heading: 'Requests', domain: 'vehicles', hrefs: ['/requests', '/allocations', '/transfers'] },
  { id: 'oversight', heading: 'Oversight', domain: 'vehicles', hrefs: ['/operations', '/compliance', '/maintenance', '/idle', '/incidents', '/iot'] },
  { id: 'reports-group', heading: 'Insights', domain: 'vehicles', hrefs: ['/reports'] },
  { id: 'spaces', heading: 'Spaces', domain: 'spaces', hrefs: ['/spaces', '/spaces/bookings', '/spaces/requests', '/spaces/settings'] },
  { id: 'governance', heading: 'Governance', domain: 'shared', hrefs: ['/audit'] },
  { id: 'more', heading: 'More', domain: 'shared', hrefs: ['/settings', '/station'] }
];
/** FIELD_STAFF sees a reduced set: Dashboard, Fleet, Live map, Incidents. */
const FIELD_STAFF_HREFS = new Set(['/dashboard', '/vehicles', '/vehicles/map', '/incidents', '/station']);

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Platform administrator',
  ORG_ADMIN: 'Organization admin',
  DEPT_OFFICER: 'Department officer',
  STATION_OFFICER: 'Station officer',
  FIELD_STAFF: 'Field staff',
  AUDITOR: 'Auditor'
};

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  pendingHref: string | null;
  onNavigate: (href: string) => void;
  onLogout: () => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function Sidebar({ mobileOpen, onMobileClose, pendingHref, onNavigate, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const { me } = useFleet();
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  // The module follows the login (landing-page choice), not the current path.
  const activeModule = useActiveModule(pathname);

  const items = useMemo(() => {
    const role = me?.role ?? null;
    return NAV_ITEMS.filter((item) => {
      // Untagged items belong to the vehicles module by default — they must be
      // filtered out when the operator is browsing the Spaces module.
      const domain = item.domain ?? 'vehicles';
      if (domain !== 'shared' && domain !== activeModule) return false;
      if (role === 'FIELD_STAFF' && !FIELD_STAFF_HREFS.has(item.href)) return false;
      if (item.requiresAny && !canAny(role, item.requiresAny)) return false;
      return true;
    });
  }, [me, activeModule]);

  // Group the permitted items under headings (a heading only shows when at least one of its items is visible).
  const grouped = useMemo(() => {
    const out: { item: NavItem; heading: string | null }[] = [];
    for (const group of GROUPS) {
      if (group.domain !== 'shared' && group.domain !== activeModule) continue;
      let first = true;
      for (const href of group.hrefs) {
        const item = items.find((i) => i.href === href);
        if (!item) continue;
        out.push({ item, heading: first ? group.heading : null });
        first = false;
      }
    }
    // Anything not assigned to a group (future pages) is appended so it never disappears.
    for (const item of items) if (!out.some((o) => o.item.href === item.href)) out.push({ item, heading: null });
    return out;
  }, [items, activeModule]);

  function isActive(href: string): boolean {
    if (href === '/vehicles') {
      return (
        pathname === '/vehicles' ||
        (pathname.startsWith('/vehicles/') &&
          !pathname.startsWith('/vehicles/map') &&
          !pathname.startsWith('/vehicles/discover'))
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="sidebar" id="primary-navigation" aria-label="Primary navigation">
      <div className="sidebar__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Sanchay logo" className="sidebar__logo" />
        <div className="sidebar__brand-text">
          <strong>San</strong>
          <span>chay</span>
        </div>
        <button className="sidebar__close-btn" type="button" aria-label="Close sidebar" onClick={onMobileClose}>
          <X size={18} />
        </button>
      </div>

      <nav className="sidebar__nav">
        {grouped.map(({ item, heading }) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const pending = pendingHref === item.href;
          return (
            <Fragment key={item.href}>
            {heading ? <div className="sidebar__group" aria-hidden="true">{heading}</div> : null}
            <Link
              href={item.href}
              prefetch
              title={item.label}
              className={`${active ? 'is-active' : ''} ${pending ? 'is-pending' : ''}`.trim()}
              aria-current={active ? 'page' : undefined}
              aria-busy={pending || undefined}
              onMouseEnter={() => setHoveredHref(item.href)}
              onMouseLeave={() => setHoveredHref(null)}
              onClick={(event) => {
                onMobileClose();
                if (
                  pathname !== item.href &&
                  event.button === 0 &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey
                ) {
                  onNavigate(item.href);
                }
              }}
            >
              <Icon size={18} isHovered={hoveredHref === item.href} />
              <span>{item.label}</span>
              {item.badge ? <span className="sidebar__nav-badge">{item.badge}</span> : null}
              {pending ? <LoaderCircle className="sidebar__nav-pending spin" size={15} aria-hidden="true" /> : null}
            </Link>
            </Fragment>
          );
        })}
      </nav>

      <div className="sidebar__foot">
        {me ? (
          <div className="sidebar__profile">
            {me.stationId ? (
              <Link href="/station" className="sidebar__profile-main" onClick={() => onNavigate('/station')} title="Open station profile">
                <span className="sidebar__avatar" aria-hidden="true">{initials(me.displayName)}</span>
                <span className="sidebar__profile-text">
                  <strong>{me.displayName}</strong>
                  <span>{ROLE_LABEL[me.role]}</span>
                </span>
              </Link>
            ) : (
              <div className="sidebar__profile-main">
                <span className="sidebar__avatar" aria-hidden="true">{initials(me.displayName)}</span>
                <span className="sidebar__profile-text">
                  <strong>{me.displayName}</strong>
                  <span>{ROLE_LABEL[me.role]}</span>
                </span>
              </div>
            )}
            <button type="button" className="sidebar__logout" onClick={onLogout} aria-label="Log out" title="Log out">
              <LogOut size={15} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      {mobileOpen ? null : null}
    </aside>
  );
}
