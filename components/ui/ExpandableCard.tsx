'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface ExpandableCardProps {
  icon: ReactNode;
  iconTone?: 'brand' | 'warning' | 'success' | 'danger';
  title: string;
  subtitle: string;
  badge?: ReactNode;
  expandLabel?: string;
  collapseLabel?: string;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  children: ReactNode;
  className?: string;
}

export function ExpandableCard({
  icon,
  iconTone = 'brand',
  title,
  subtitle,
  badge,
  expandLabel = 'Show details',
  collapseLabel = 'Hide details',
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggle,
  children,
  className = '',
}: ExpandableCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  function toggle() {
    const next = !isExpanded;
    if (controlledExpanded === undefined) {
      setInternalExpanded(next);
    }
    onToggle?.(next);
  }

  return (
    <section className={`expandable-card ${className}`.trim()}>
      <div
        className="expandable-card__header"
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <div className="expandable-card__left">
          <div className={`expandable-card__icon expandable-card__icon--${iconTone}`}>
            {icon}
          </div>
          <div className="expandable-card__info">
            <div className="cluster" style={{ gap: 8, alignItems: 'center' }}>
              <span className="expandable-card__title">{title}</span>
              {badge}
            </div>
            <p className="expandable-card__subtitle">{subtitle}</p>
          </div>
        </div>

        <div className="expandable-card__right">
          <button
            type="button"
            className="expandable-card__toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
          >
            <span>{isExpanded ? collapseLabel : expandLabel}</span>
            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="expandable-card__body">
          {children}
        </div>
      ) : null}
    </section>
  );
}
