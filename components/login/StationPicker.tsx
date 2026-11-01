'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, Search, Check } from 'lucide-react';

export interface StationOption {
  username: string;
  station: string;
}

/**
 * Searchable station dropdown for the login page — a styled listbox, not the
 * native <select> (which renders unthemed and overflows the login card).
 */
export function StationPicker({
  stations,
  value,
  onSelect,
}: {
  stations: StationOption[];
  value: string | null;
  onSelect: (option: StationOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedStation, setSelectedStation] = useState<StationOption | null>(() => {
    if (!value) return null;
    return stations.find((s) => s.username === value || s.station === value) ?? null;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Synchronize whenever value or stations prop changes
  useEffect(() => {
    if (value) {
      const match = stations.find((s) => s.username === value || s.station === value) ?? null;
      setSelectedStation(match);
    } else {
      setSelectedStation(null);
    }
  }, [value, stations]);

  const active = selectedStation ?? (value ? stations.find((s) => s.username === value || s.station === value) ?? null : null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter(
      (s) => s.station.toLowerCase().includes(q) || s.username.toLowerCase().includes(q)
    );
  }, [stations, query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [open]);

  // When dropdown opens, clear search query and focus search box
  useEffect(() => {
    if (open) {
      setQuery('');
      const timer = setTimeout(() => {
        searchRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  function toggle() {
    setOpen((o) => !o);
  }

  function handleSelect(s: StationOption) {
    setSelectedStation(s);
    onSelect(s);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="station-picker" ref={containerRef} data-no-translate="true">
      <button
        type="button"
        className="station-picker__control"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Building2 size={16} aria-hidden="true" />
        <span className={active ? '' : 'station-picker__placeholder'}>
          {active ? active.station : 'Choose your police station…'}
        </span>
        <ChevronDown
          size={16}
          className={open ? 'station-picker__chevron station-picker__chevron--open' : 'station-picker__chevron'}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="station-picker__panel" role="listbox" aria-label="Police stations">
          <div className="station-picker__search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              name="station_filter_term"
              id="station_filter_term"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-1p-ignore="true"
              data-lpignore="true"
              value={query}
              onChange={(e) => {
                const val = e.target.value;
                // If browser autofills saved 'admin' credential, silently suppress it
                if (val.trim().toLowerCase() === 'admin' && !stations.some((s) => s.username === 'admin')) {
                  setQuery('');
                  if (searchRef.current) searchRef.current.value = '';
                  return;
                }
                setQuery(val);
              }}
              placeholder="Search station…"
              aria-label="Search stations"
            />
          </div>
          <div className="station-picker__list">
            {filtered.length === 0 ? (
              <div className="station-picker__empty">No station matches “{query}”.</div>
            ) : null}
            {filtered.map((s) => {
              const isSelected = active?.username === s.username || active?.station === s.station;
              return (
                <button
                  key={s.username}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`station-picker__option ${isSelected ? 'station-picker__option--active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(s);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(s);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '9px 14px',
                    background: isSelected ? 'var(--color-bg-tertiary)' : 'transparent',
                    border: 'none',
                    color: 'var(--color-text-primary)',
                    font: 'inherit',
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxSizing: 'border-box',
                  }}
                >
                  <span style={{ fontWeight: isSelected ? 600 : 400 }}>{s.station}</span>
                  {isSelected ? <Check size={14} aria-hidden="true" style={{ color: 'var(--color-brand)' }} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
