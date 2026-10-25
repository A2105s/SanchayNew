'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

export interface AttnItem {
  id: string;
  tone: 'danger' | 'warning' | 'info';
  icon: ReactNode;
  title: string;
  detail: string;
  count: number;
  href: string;
  /** Informational-only rows (e.g. stale telemetry) are visually de-emphasised and never alarming. */
  informational?: boolean;
}

/** Ranked "needs attention" list used on the dashboard. */
export function AttentionList({ items }: { items: AttnItem[] }) {
  return (
    <div className="ops-attn">
      {(items ?? []).map((it) => (
        <Link key={it.id} href={it.href} className={`ops-attn-row${it.informational ? ' ops-attn-row--info' : ''}`}>
          <span className={`ops-attn-icon ops-attn-icon--${it.tone}`} aria-hidden="true">
            {it.icon}
          </span>
          <span className="ops-attn-body">
            <span className="ops-attn-title">{it.title}</span>
            <span className="ops-attn-detail">{it.detail}</span>
          </span>
          <span className="ops-attn-count">{it.count}</span>
          <ArrowRight size={15} className="text-muted" aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

export function QuickAction({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="button button--secondary" style={{ justifyContent: 'flex-start' }}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
