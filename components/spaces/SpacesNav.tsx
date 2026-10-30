'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, CalendarCheck, Inbox, SlidersHorizontal } from 'lucide-react';
import { useFleet } from '@/lib/client/useFleet';

export function SpacesNav({ active }: { active: 'spaces' | 'bookings' | 'requests' | 'settings' }) {
  const { can } = useFleet();
  const canManageSettings = can('settings.manage');

  const items = [
    { id: 'spaces', label: 'All spaces', href: '/spaces', icon: Building2 },
    { id: 'bookings', label: 'Bookings & review queue', href: '/spaces/bookings', icon: CalendarCheck },
    { id: 'requests', label: 'Request center', href: '/spaces/requests', icon: Inbox },
    ...(canManageSettings
      ? [{ id: 'settings', label: 'Booking policy', href: '/spaces/settings', icon: SlidersHorizontal }]
      : [])
  ];

  return (
    <nav className="settings-tabs" aria-label="Civic spaces navigation" style={{ marginBottom: '1rem' }}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`settings-tab-btn ${isActive ? 'is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

