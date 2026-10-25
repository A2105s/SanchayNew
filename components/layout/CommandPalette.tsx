'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Car, CornerDownLeft, LayoutDashboard, Search } from 'lucide-react';
import { useFleet } from '@/components/providers/FleetProvider';
import { CLASS_LABEL, SECTOR_LABEL } from '@/lib/fleet/format';

interface PageEntry {
  href: string;
  label: string;
}

const PAGES: PageEntry[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/vehicles', label: 'Fleet registry' },
  { href: '/vehicles/discover', label: 'Discover vehicles' },
  { href: '/vehicles/map', label: 'Live map' },
  { href: '/requests', label: 'Requests' },
  { href: '/allocations', label: 'Allocations' },
  { href: '/operations', label: 'Operations' },
  { href: '/stations', label: 'Stations' },
  { href: '/transfers', label: 'Transfers' },
  { href: '/compliance', label: 'Compliance' },
  { href: '/maintenance', label: 'Maintenance' },
  { href: '/idle', label: 'Idle & reuse' },
  { href: '/incidents', label: 'Incidents' },
  { href: '/iot', label: 'IoT hub' },
  { href: '/reports', label: 'Reports' },
  { href: '/audit', label: 'Audit' },
  { href: '/settings', label: 'Settings' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/spaces', label: 'Spaces' }
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface Result {
  kind: 'page' | 'vehicle';
  href: string;
  label: string;
  meta?: string;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { snapshot } = useFleet();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after paint.
      const id = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const pageMatches = PAGES.filter((p) => !q || p.label.toLowerCase().includes(q)).map<Result>((p) => ({
      kind: 'page',
      href: p.href,
      label: p.label
    }));

    let vehicleMatches: Result[] = [];
    if (q && snapshot) {
      vehicleMatches = snapshot.vehicles
        .filter((v) => {
          const hay = [v.registrationNumber, v.displayName, v.driverName ?? '', v.assetCode]
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        })
        .slice(0, 8)
        .map<Result>((v) => ({
          kind: 'vehicle',
          href: `/vehicles/${v.id}`,
          label: `${v.registrationNumber} · ${v.displayName}`,
          meta: `${CLASS_LABEL[v.vehicleClass]} · ${SECTOR_LABEL[v.sector]}`
        }));
    }

    return [...pageMatches, ...vehicleMatches];
  }, [query, snapshot]);

  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results, active]);

  function go(result: Result | undefined) {
    if (!result) return;
    onClose();
    router.push(result.href);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  if (!mounted || !open || typeof document === 'undefined') return null;

  const pageResults = results.filter((r) => r.kind === 'page');
  const vehicleResults = results.filter((r) => r.kind === 'vehicle');

  return createPortal(
    <div
      className="cmdk-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk__search">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Search pages or vehicles by registration, name, driver…"
            aria-label="Command palette search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="cmdk__results">
          {results.length === 0 ? (
            <p className="cmdk__empty">No matches for “{query}”.</p>
          ) : (
            <>
              {pageResults.length > 0 ? <div className="cmdk__group-label">Pages</div> : null}
              {pageResults.map((result) => {
                const idx = results.indexOf(result);
                return (
                  <button
                    key={result.href}
                    type="button"
                    className={`cmdk__item ${idx === active ? 'is-active' : ''}`.trim()}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(result)}
                  >
                    <span className="cmdk__item-icon">
                      <LayoutDashboard size={16} aria-hidden="true" />
                    </span>
                    <span>{result.label}</span>
                  </button>
                );
              })}

              {vehicleResults.length > 0 ? <div className="cmdk__group-label">Vehicles</div> : null}
              {vehicleResults.map((result) => {
                const idx = results.indexOf(result);
                return (
                  <button
                    key={result.href}
                    type="button"
                    className={`cmdk__item ${idx === active ? 'is-active' : ''}`.trim()}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(result)}
                  >
                    <span className="cmdk__item-icon">
                      <Car size={16} aria-hidden="true" />
                    </span>
                    <span>{result.label}</span>
                    {result.meta ? <span className="cmdk__item-meta">{result.meta}</span> : null}
                  </button>
                );
              })}
            </>
          )}
        </div>
        <div className="cmdk__foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>
              <CornerDownLeft size={10} aria-hidden="true" />
            </kbd>{' '}
            open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
