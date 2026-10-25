import Link from 'next/link';
import type { ReactNode } from 'react';

type MetricTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

interface MetricTileProps {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: MetricTone;
  href?: string;
  icon?: ReactNode;
}

export function MetricTile({ label, value, detail, tone = 'brand', href, icon }: MetricTileProps) {
  const railClass = tone === 'brand' ? 'metric-tile__rail' : `metric-tile__rail metric-tile__rail--${tone}`;
  const content = (
    <>
      <span className={railClass} aria-hidden="true" />
      <div className="metric-tile__label-row">
        <span className="metric-tile__label">{label}</span>
        {icon ? <span className="metric-tile__icon">{icon}</span> : null}
      </div>
      <span className="metric-tile__value mono">{value}</span>
      {detail ? <span className="metric-tile__detail">{detail}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="metric-tile">
        {content}
      </Link>
    );
  }
  return <article className="metric-tile">{content}</article>;
}
