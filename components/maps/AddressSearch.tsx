'use client';

import { useEffect, useId, useState } from 'react';
import { AlertTriangle, Loader2, Search } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { GEO_ATTRIBUTION, type GeoPlace, type GeoSearchResult } from '@/lib/integrations/mapbox/types';

/**
 * Address field with typeahead suggestions.
 *
 * Shared by the vehicles module (trip start/end location, last known position, incident site)
 * and the spaces module (asset address): it knows nothing about vehicles or spaces, only about
 * a text value plus an optional confirmed coordinate.
 *
 * Design rules baked in:
 *  - Suggestions are suggestions. Free text is always allowed; selecting one only *offers*
 *    the coordinates, and the caller decides what to do with them.
 *  - If the provider is not configured, unconfigured, rate-limited or failing, this degrades to
 *    a plain text input with a short reason. It never blocks a form.
 *  - The Mapbox token never reaches the browser: lookups go through /api/integrations/geo/*.
 */

type LookupState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'results'; places: GeoPlace[]; attribution?: string }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'disabled'; message: string };

export interface AddressSearchProps {
  /** Current free-text value (controlled). */
  value: string;
  /** Fired on every keystroke and when a suggestion is chosen. */
  onChange: (value: string) => void;
  /** Fired only when the operator confirms a suggestion. */
  onPlace?: (place: GeoPlace) => void;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** Bias suggestions toward a point (e.g. the operator's city). */
  proximity?: { lat: number; lng: number } | null;
  disabled?: boolean;
}

export function AddressSearch({
  value,
  onChange,
  onPlace,
  label = 'Address',
  hint,
  error,
  required,
  placeholder = 'Search an address or landmark',
  ariaLabel,
  proximity,
  disabled
}: AddressSearchProps) {
  const inputId = useId();
  const listId = `${inputId}-options`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [state, setState] = useState<LookupState>({ kind: 'idle' });

  // Primitive deps: a new proximity object identity every render must not restart the timer.
  const proximityLat = proximity?.lat ?? null;
  const proximityLng = proximity?.lng ?? null;

  useEffect(() => {
    if (!open || !dirty) return;
    const query = value.trim();
    // Nothing to search yet; the panel is hidden by `showPanel` until the query is long enough.
    if (query.length < 2) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setState({ kind: 'loading' });
      try {
        const params = new URLSearchParams({ q: query, limit: '5' });
        if (proximityLat !== null && proximityLng !== null) {
          params.set('proximity', `${proximityLng},${proximityLat}`);
        }
        const data = await api.get<GeoSearchResult & { attribution?: string }>(
          `/api/integrations/geo/search?${params.toString()}`
        );
        if (cancelled) return;

        if (!data.configured) {
          setState({
            kind: 'disabled',
            message: 'Address lookup is not configured on this server. Type the address manually.'
          });
          return;
        }
        setState(
          data.places.length > 0
            ? { kind: 'results', places: data.places, attribution: data.attribution }
            : { kind: 'empty' }
        );
      } catch (lookupError) {
        if (cancelled) return;
        const message =
          lookupError instanceof ApiError
            ? lookupError.message
            : 'Address lookup failed. You can still type the address manually.';
        setState({ kind: 'error', message });
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, open, dirty, proximityLat, proximityLng]);

  const options = state.kind === 'results' ? state.places : [];

  function pick(place: GeoPlace) {
    setOpen(false);
    setDirty(false);
    setActiveIndex(-1);
    setState({ kind: 'idle' });
    onChange(place.address);
    onPlace?.(place);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === 'Enter' && open && activeIndex >= 0 && options[activeIndex]) {
      event.preventDefault();
      pick(options[activeIndex]);
    }
  }

  const showPanel = open && dirty && value.trim().length >= 2 && state.kind !== 'idle';
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field address-search">
      <label htmlFor={inputId}>
        {label}
        {required ? (
          <span aria-hidden="true" style={{ color: 'var(--color-danger)' }}>
            {' '}
            *
          </span>
        ) : null}
      </label>

      <div className="address-search__control">
        <Search size={15} aria-hidden="true" className="address-search__icon" />
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel ?? label}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listId : undefined}
          aria-activedescendant={
            showPanel && activeIndex >= 0 && options[activeIndex] ? `${inputId}-option-${activeIndex}` : undefined
          }
          onChange={(event) => {
            setDirty(true);
            setOpen(true);
            setActiveIndex(-1);
            onChange(event.target.value);
          }}
          onFocus={() => {
            if (value.trim().length >= 2) setOpen(true);
          }}
          onBlur={() => {
            // Let an option's mousedown land before the list disappears.
            setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={handleKeyDown}
        />
        {state.kind === 'loading' ? (
          <Loader2 size={15} className="address-search__spinner" aria-hidden="true" />
        ) : null}
      </div>

      {hint && !error ? (
        <small id={hintId} className="field__hint" style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>
          {hint}
        </small>
      ) : null}
      {error ? (
        <small id={errorId} className="field__error" style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
          {error}
        </small>
      ) : null}

      {showPanel ? (
        <div className="address-search__panel">
          {state.kind === 'results' ? (
            <ul id={listId} role="listbox" aria-label={ariaLabel ?? `${label} suggestions`} className="address-search__list">
              {state.places.map((place, index) => (
                <li
                  key={place.id}
                  id={`${inputId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`address-search__option${index === activeIndex ? ' address-search__option--active' : ''}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(place);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="address-search__option-name">{place.name}</span>
                  <span className="address-search__option-address">{place.address}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {state.kind === 'empty' ? (
            <p className="address-search__status">No matching address. Try a landmark, ward or road name.</p>
          ) : null}

          {state.kind === 'loading' ? <p className="address-search__status">Searching addresses…</p> : null}

          {state.kind === 'error' || state.kind === 'disabled' ? (
            <p className="address-search__status address-search__status--warn" role="status">
              <AlertTriangle size={13} aria-hidden="true" /> {state.message}
            </p>
          ) : null}

          {state.kind === 'results' ? (
            <p className="address-search__attribution">{state.attribution || GEO_ATTRIBUTION}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
