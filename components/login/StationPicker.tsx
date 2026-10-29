'use client';

import { useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, Search, Check } from 'lucide-react';

export interface StationOption {
  username: string;
  station: string;
}

/**
 * Searchable station dropdown for the login page — a styled listbox, not the
 * native <select> (which renders unthemed and overflows the login card).
 */
export function StationPicker({ stations, value, onSelect }: { stations: StationOption[]; value: string | null; onSelect: (option: StationOption) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = stations.find((s) => s.username === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter((s) => s.station.toLowerCase().includes(q) || s.username.toLowerCase().includes(q));
  }, [stations, query]);

  function toggle() {
    setOpen((o) => {
      if (!o) {
        setQuery('');
        // focus the search box once it mounts
        setTimeout(() => searchRef.current?.focus(), 0);
      }
      return !o;
    });
  }

  return (
    <div className="station-picker">
      <button type="button" className="station-picker__control" onClick={toggle} aria-expanded={open} aria-haspopup="listbox" disabled={false}>
        <Building2 size={16} aria-hidden="true" />
        <span className={selected ? '' : 'station-picker__placeholder'}>{selected ? selected.station : 'Choose your police station…'}</span>
        <ChevronDown size={16} className={open ? 'station-picker__chevron station-picker__chevron--open' : 'station-picker__chevron'} aria-hidden="true" />
      </button>

      {open ? (
        <div className="station-picker__panel" role="listbox" aria-label="Police stations">
          <div className="station-picker__search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search station…"
              aria-label="Search stations"
            />
          </div>
          <div className="station-picker__list">
            {filtered.length === 0 ? <div className="station-picker__empty">No station matches “{query}”.</div> : null}
            {filtered.map((s) => (
              <button
                key={s.username}
                type="button"
                role="option"
                aria-selected={selected?.username === s.username}
                className={selected?.username === s.username ? 'station-picker__option station-picker__option--active' : 'station-picker__option'}
                onClick={() => { onSelect(s); setOpen(false); }}
              >
                <span>{s.station}</span>
                {selected?.username === s.username ? <Check size={14} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
