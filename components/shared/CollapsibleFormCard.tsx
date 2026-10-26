'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleFormCardProps {
  /** Stable DOM id, also used by scrollToFormCard(). */
  id: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Always visible below the header (e.g. success / validation toast), even when collapsed. */
  notice?: ReactNode;
  children: ReactNode;
}

/**
 * Horizontal, collapsible form card for rarely used data-entry forms.
 * Collapsed by default so the table below stays the focus of the page.
 */
export function CollapsibleFormCard({ id, icon, title, subtitle, open, onOpenChange, notice, children }: CollapsibleFormCardProps) {
  const bodyId = `${id}-body`;

  return (
    <section className={`panel form-card ${open ? 'is-open' : ''}`.trim()} id={id}>
      <button
        type="button"
        className="form-card__header"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onOpenChange(!open)}
      >
        <span className="panel-header__icon" aria-hidden="true">{icon}</span>
        <span className="form-card__title">
          <strong>{title}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </span>
        <span className="form-card__toggle">
          <span>{open ? 'Hide form' : 'Show form'}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </button>
      {notice ? <div className="form-card__notice">{notice}</div> : null}
      {open ? (
        <div className="form-card__body" id={bodyId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** Scroll a form card into view after it opens (accounts for the sticky top bar via CSS scroll-margin). */
export function scrollToFormCard(id: string): void {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
