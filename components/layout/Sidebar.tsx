'use client';

import { Fragment, useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LoaderCircle, LogOut, X } from 'lucide-react';
import type { Role } from '@/types';
import { canAny, type Permission } from '@/lib/client/permissions';
import { useFleet } from '@/components/providers/FleetProvider';
import { useActiveModule, setModuleCookie } from '@/lib/client/useModule';
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

import {
  SPACES_HREFS,
  SHARED_HREFS,
  VEHICLES_GROUPS,
  SPACES_GROUPS,
  NAV_ROUTE_ITEMS,
  type NavRouteItem
} from '@/lib/navigation/routes';

export { SPACES_HREFS, SHARED_HREFS, VEHICLES_GROUPS, SPACES_GROUPS };

type IconComponent = ComponentType<AnimatedIconProps>;

export interface NavItem extends NavRouteItem {
  icon: IconComponent;
}

const ICONS: Record<string, IconComponent> = {
  '/dashboard': AnimatedDashboard,
  '/vehicles': AnimatedCar,
  '/vehicles/discover': AnimatedSearch,
  '/vehicles/map': AnimatedMap,
  '/requests': AnimatedClipboard,
  '/allocations': AnimatedKey,
  '/operations': AnimatedActivity,
  '/stations': AnimatedBuilding,
  '/transfers': AnimatedTransfer,
  '/compliance': AnimatedShieldCheck,
  '/maintenance': AnimatedWrench,
  '/idle': AnimatedClock,
  '/incidents': AnimatedSiren,
  '/iot': AnimatedRadio,
  '/spaces': AnimatedLayout,
  '/spaces/bookings': AnimatedClipboard,
  '/spaces/requests': AnimatedLedger,
  '/spaces/settings': AnimatedGear,
  '/reports': AnimatedBarChart,
  '/audit': AnimatedLedger,
  '/settings': AnimatedGear,
  '/station': AnimatedBuilding
};

/** Navigation per BUILD_CONTRACT sidebar order with unified Fleet and Spaces access. */
export const NAV_ITEMS: NavItem[] = NAV_ROUTE_ITEMS.map((item) => ({
  ...item,
  icon: ICONS[item.href] ?? AnimatedDashboard
}));

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
  const router = useRouter();
  const pathname = usePathname();
  const { me } = useFleet();
  const activeModule = useActiveModule(pathname);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

  const items = useMemo(() => {
    const role = me?.role ?? null;
    return NAV_ITEMS.filter((item) => {
      if (activeModule === 'spaces') {
        // Strictly Spaces navigation items (/spaces, /spaces/bookings, /spaces/requests, /spaces/settings, plus /reports, /audit, /settings)
        if (!SPACES_HREFS.has(item.href) && !SHARED_HREFS.has(item.href)) return false;
      } else {
        // activeModule === 'vehicles': hide all space-specific links
        if (SPACES_HREFS.has(item.href)) return false;
        if (item.showIfStation && !me?.stationId) return false;
        if (role === 'FIELD_STAFF' && !FIELD_STAFF_HREFS.has(item.href)) return false;
      }
      if (item.requiresAny && !canAny(role, item.requiresAny)) return false;
      return true;
    });
  }, [me, activeModule]);

  const activeGroups = activeModule === 'spaces' ? SPACES_GROUPS : VEHICLES_GROUPS;

  // Group the permitted items under headings (a heading only shows when at least one of its items is visible).
  const grouped = useMemo(() => {
    const out: { item: NavItem; heading: string | null }[] = [];
    for (const group of activeGroups) {
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
  }, [items, activeGroups]);

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

      <div className="sidebar__modules" role="tablist" aria-label="Active module">
        <button
          type="button"
          role="tab"
          aria-selected={activeModule === 'vehicles'}
          className={`sidebar__module ${activeModule === 'vehicles' ? 'sidebar__module--active' : ''}`}
          onClick={() => {
            setModuleCookie('vehicles');
            onMobileClose();
            onNavigate('/dashboard');
            router.push('/dashboard');
          }}
        >
          Fleet
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeModule === 'spaces'}
          className={`sidebar__module ${activeModule === 'spaces' ? 'sidebar__module--active' : ''}`}
          onClick={() => {
            setModuleCookie('spaces');
            onMobileClose();
            onNavigate('/spaces');
            router.push('/spaces');
          }}
        >
          Spaces
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
