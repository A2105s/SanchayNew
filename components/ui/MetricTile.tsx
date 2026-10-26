import type { ReactNode } from 'react';
import { KpiCard, type KpiTone } from '@/components/analytics/AnalyticsKit';

export type MetricTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export interface MetricTileProps {
  label: string;
  value: ReactNode;
  detail?: string;
  hint?: string;
  tone?: MetricTone;
  href?: string;
  icon?: ReactNode;
  meta?: string;
}

/**
 * MetricTile component unified with the Dashboard KpiCard design.
 * Renders the same sleek typography, colored uppercase header, tabular nums,
 * and subtle card elevation as seen on Dashboard and EasyLife.
 */
export function MetricTile({
  label,
  value,
  detail,
  hint,
  tone = 'brand',
  href,
  icon,
  meta
}: MetricTileProps) {
  return (
    <KpiCard
      label={label}
      value={value}
      tone={tone as KpiTone}
      hint={hint}
      detail={detail}
      icon={icon}
      meta={meta}
      href={href}
    />
  );
}
