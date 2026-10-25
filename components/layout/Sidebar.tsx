'use client';

import { useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LoaderCircle, LogOut, X } from 'lucide-react';
import type { Role } from '@/types';
import { canAny, type Permission } from '@/lib/client/permissions';
import { useFleet } from '@/components/providers/FleetProvider';
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
  { href: '/reports', label: 'Reports', icon: AnimatedBarChart, requiresAny: ['report.read'] },
  { href: '/audit', label: 'Audit', icon: AnimatedLedger, requiresAny: ['audit.read'] },
  { href: '/settings', label: 'Settings', icon: AnimatedGear, requiresAny: ['settings.manage'] },
  { href: '/spaces', label: 'Spaces', icon: AnimatedLayout, badge: 'Soon' }
];

/** FIELD_STAFF sees a reduced set: Dashboard, Fleet, Live map, Incidents. */
const FIELD_STAFF_HREFS = new Set(['/dashboard', '/vehicles', '/vehicles/map', '/incidents']);

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

export function Sidebar({ mobileOpen, onMobileClose, pendingHref, onNavigate, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const { me } = useFleet();
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

  const items = useMemo(() => {
    const role = me?.role ?? null;
    return NAV_ITEMS.filter((item) => {
      if (role === 'FIELD_STAFF' && !FIELD_STAFF_HREFS.has(item.href)) return false;
      if (item.requiresAny && !canAny(role, item.requiresAny)) return false;
      return true;
    });
  }, [me]);

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
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const pending = pendingHref === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
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
              <Icon size={18} isHovered={hoveredHref === item.href || active} />
              <span>{item.label}</span>
              {item.badge ? <span className="sidebar__nav-badge">{item.badge}</span> : null}
              {pending ? <LoaderCircle className="sidebar__nav-pending spin" size={15} aria-hidden="true" /> : null}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar__foot">
        {me ? (
          <div className="sidebar__session">
            <strong>{me.displayName}</strong>
            <span>{ROLE_LABEL[me.role]}</span>
          </div>
        ) : null}
        <button type="button" className="sidebar__logout" onClick={onLogout}>
          <LogOut size={15} aria-hidden="true" />
          <span>Log out</span>
        </button>
      </div>

      {mobileOpen ? null : null}
    </aside>
  );
}
