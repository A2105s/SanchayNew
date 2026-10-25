'use client';

import { List, LayoutGrid } from 'lucide-react';

export type ViewMode = 'table' | 'cards';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  ariaLabel?: string;
  tableLabel?: string;
  cardsLabel?: string;
  className?: string;
}

export function ViewToggle({
  value,
  onChange,
  ariaLabel = 'View layout',
  tableLabel = 'Table',
  cardsLabel = 'Cards',
  className = ''
}: ViewToggleProps) {
  return (
    <div className={`veh-viewtoggle ${className}`.trim()} role="group" aria-label={ariaLabel}>
      <button
        type="button"
        aria-pressed={value === 'table'}
        onClick={() => onChange('table')}
        title={`${tableLabel} view`}
      >
        <List size={14} aria-hidden="true" />
        <span>{tableLabel}</span>
      </button>
      <button
        type="button"
        aria-pressed={value === 'cards'}
        onClick={() => onChange('cards')}
        title={`${cardsLabel} view`}
      >
        <LayoutGrid size={14} aria-hidden="true" />
        <span>{cardsLabel}</span>
      </button>
    </div>
  );
}
