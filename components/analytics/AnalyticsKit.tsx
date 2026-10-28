import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';
import { PanelHeader } from '@/components/shared/PanelHeader';

/**
 * Shared analytics presentation primitives.
 * Every analytics screen (overview + engineer drill-down) composes these so
 * cards, KPIs, charts, legends and empty states stay visually uniform.
 * Styles live in app/analytics.css under the `an-` prefix.
 */

export type KpiTone = 'brand' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';

/* ──────────────────────────────────────────────────────────────
   Period-over-period delta
   ────────────────────────────────────────────────────────────── */

export interface DeltaInfo {
  direction: 'up' | 'down' | 'flat' | 'new';
  label: string;
  description: string;
}

export function buildDelta(current: number, previous: number): DeltaInfo {
  if (previous <= 0 && current <= 0) {
    return { direction: 'flat', label: '0%', description: 'No change' };
  }
  if (previous <= 0) {
    return { direction: 'new', label: 'New', description: 'New activity compared with the previous period' };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) {
    return { direction: 'flat', label: '0%', description: 'No change' };
  }
  const magnitude = Math.abs(pct).toLocaleString('en-IN');
  return pct > 0
    ? { direction: 'up', label: `${magnitude}%`, description: `Up ${magnitude} percent` }
    : { direction: 'down', label: `${magnitude}%`, description: `Down ${magnitude} percent` };
}

export function DeltaChip({ delta }: { delta: DeltaInfo }) {
  const Icon = delta.direction === 'down' ? ArrowDownRight : delta.direction === 'flat' ? Minus : ArrowUpRight;
  return (
    <span className={`an-delta an-delta--${delta.direction}`}>
      <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
      <span aria-hidden="true">{delta.label}</span>
      <span className="sr-only">{delta.description}</span>
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────
   KPI card
   ────────────────────────────────────────────────────────────── */

export function KpiCard({
  label,
  value,
  tone = 'brand',
  hint,
  detail,
  meta,
  icon,
  href,
  delta,
  deltaCaption
}: {
  label: string;
  value: ReactNode;
  tone?: KpiTone;
  /** Bold secondary line under the value. */
  hint?: string;
  /** Muted tertiary line. */
  detail?: string;
  /** Small status chip shown opposite the label. */
  meta?: string;
  /** Optional leading or trailing icon */
  icon?: ReactNode;
  /** Makes the whole card a link. */
  href?: string;
  delta?: DeltaInfo;
  deltaCaption?: string;
}) {
  const content = (
    <>
      <header className="an-kpi__head">
        <span className="an-kpi__label">{label}</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          {meta ? <span className="an-kpi__meta">{meta}</span> : null}
          {icon ? <span className="an-kpi__icon" style={{ opacity: 0.85, display: 'inline-flex' }}>{icon}</span> : null}
        </div>
      </header>
      <strong className="an-kpi__value">{value}</strong>
      {hint ? <span className="an-kpi__hint">{hint}</span> : null}
      {detail ? <small className="an-kpi__detail">{detail}</small> : null}
      {delta ? (
        <footer className="an-kpi__foot">
          <DeltaChip delta={delta} />
          {deltaCaption ? <span className="an-kpi__caption">{deltaCaption}</span> : null}
        </footer>
      ) : null}
    </>
  );

  const className = `an-kpi an-kpi--${tone}`;
  return href ? (
    <Link href={href} className={`${className} is-link`}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}

/* ──────────────────────────────────────────────────────────────
   Layout helpers
   ────────────────────────────────────────────────────────────── */

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="an-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h2 className="an-section__title">{title}</h2>
        {description ? <span className="an-section__desc">{description}</span> : null}
      </div>
      {action}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  footer,
  children,
  className = ''
}: {
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel an-card ${className}`.trim()}>
      <PanelHeader title={title} subtitle={subtitle} />
      <div className="an-card__body">{children}</div>
      {footer ? <div className="an-card__footer">{footer}</div> : null}
    </section>
  );
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="an-link">
      <span>{children}</span>
      <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="an-empty" role="status">
      <span>{label}</span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Ranked list (horizontal bars)
   ────────────────────────────────────────────────────────────── */

export interface RankedListItem {
  label: string;
  count: number;
  /** 0–100 bar width. */
  percent: number;
  /** Secondary line under the label. */
  detail?: string;
  /** Muted figure beside the count (e.g. a percentage). */
  meta?: string;
  /** Accent colour for the bar and dot marker. */
  color?: string;
  /** 'dot' replaces the rank number with a coloured dot (for categorical lists). */
  marker?: 'index' | 'dot';
  onSelect?: () => void;
  selectLabel?: string;
  href?: string;
}

export function RankedList({
  items,
  emptyLabel,
  limit,
  moreLabel
}: {
  items: RankedListItem[];
  emptyLabel: string;
  limit?: number;
  moreLabel?: string;
}) {
  if (!items.length) return <EmptyState label={emptyLabel} />;

  const visible = typeof limit === 'number' ? items.slice(0, limit) : items;
  const hidden = items.length - visible.length;

  return (
    <>
      <ol className="an-rank">
        {visible.map((item, index) => {
          const style = item.color ? ({ '--an-rank-color': item.color } as CSSProperties) : undefined;
          const isDot = item.marker === 'dot';
          const body = isDot ? (
            <>
              <div className="an-rank__header">
                <span className="an-rank__label">
                  <strong title={item.label}>{item.label}</strong>
                  {item.detail ? <small>{item.detail}</small> : null}
                </span>
                <span className="an-rank__value">
                  <b>{item.count.toLocaleString('en-IN')}</b>
                  {item.meta ? <small>{item.meta}</small> : null}
                </span>
              </div>
              <div className="an-rank__bar-row">
                <span className="an-rank__dot" aria-hidden="true" />
                <div className="an-rank__bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, item.percent))}%` }} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="an-rank__top">
                <span className="an-rank__idx" aria-hidden="true">{index + 1}</span>
                <span className="an-rank__label">
                  <strong title={item.label}>{item.label}</strong>
                  {item.detail ? <small>{item.detail}</small> : null}
                </span>
                <span className="an-rank__value">
                  <b>{item.count.toLocaleString('en-IN')}</b>
                  {item.meta ? <small>{item.meta}</small> : null}
                </span>
              </div>
              <div className="an-rank__bar" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(100, item.percent))}%` }} />
              </div>
            </>
          );

          const isInteractive = Boolean(item.href || item.onSelect);
          const rowClassName = `an-rank__row${isDot ? ' an-rank__row--dot' : ''}${isInteractive ? ' is-interactive' : ''}`;

          return (
            <li key={item.label} style={style}>
              {item.href ? (
                <Link
                  href={item.href}
                  className={rowClassName}
                  aria-label={item.selectLabel ?? `Open ${item.label}`}
                >
                  {body}
                </Link>
              ) : item.onSelect ? (
                <button
                  type="button"
                  className={rowClassName}
                  onClick={item.onSelect}
                  aria-label={item.selectLabel ?? `Open ${item.label}`}
                >
                  {body}
                </button>
              ) : (
                <div className={rowClassName}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      {hidden > 0 ? <p className="an-rank__more">{moreLabel ?? `+${hidden} more`}</p> : null}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────
   Donut chart with legend
   ────────────────────────────────────────────────────────────── */

export interface DonutDatum {
  label: string;
  count: number;
  color: string;
  href?: string;
}

const OTHERS_COLOR = '#9ca3af';

export function DonutChart({
  data,
  centerLabel = 'Total',
  maxSlices = 6,
  emptyLabel = 'No data in this period.'
}: {
  data: DonutDatum[];
  centerLabel?: string;
  maxSlices?: number;
  emptyLabel?: string;
}) {
  const positive = data.filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  const total = positive.reduce((sum, item) => sum + item.count, 0);
  if (!total) return <EmptyState label={emptyLabel} />;

  let slices = positive;
  if (positive.length > maxSlices) {
    const head = positive.slice(0, maxSlices - 1);
    const tail = positive.slice(maxSlices - 1);
    slices = [...head, { label: 'Others', count: tail.reduce((sum, item) => sum + item.count, 0), color: OTHERS_COLOR }];
  }

  const gap = slices.length > 1 ? 0.8 : 0;
  const arcs = slices.map((slice, index) => {
    const share = (slice.count / total) * 100;
    const start = (slices.slice(0, index).reduce((sum, item) => sum + item.count, 0) / total) * 100;
    return { ...slice, share, start, dash: Math.max(share - gap, 0.2) };
  });

  return (
    <div className="an-donut">
      <div className="an-donut__chart" role="img" aria-label={`${centerLabel}: ${total}. ${arcs.map((arc) => `${arc.label} ${Math.round(arc.share)} percent`).join(', ')}`}>
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <g transform="rotate(-90 18 18)">
            <circle className="an-donut__track" cx="18" cy="18" r="15.9155" />
            {arcs.map((arc) => (
              <circle
                key={arc.label}
                className="an-donut__arc"
                cx="18"
                cy="18"
                r="15.9155"
                pathLength={100}
                stroke={arc.color}
                strokeDasharray={`${arc.dash} ${100 - arc.dash}`}
                strokeDashoffset={-arc.start}
              >
                <title>{`${arc.label}: ${arc.count} (${Math.round(arc.share)}%)`}</title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="an-donut__center">
          <strong>{total.toLocaleString('en-IN')}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>

      <ul className="an-legend">
        {arcs.map((arc) => {
          const content = (
            <>
              <span className="an-legend__swatch" style={{ background: arc.color }} aria-hidden="true" />
              <span className="an-legend__label" title={arc.label}>{arc.label}</span>
              <b>{arc.count.toLocaleString('en-IN')}</b>
              <small>{Math.round(arc.share)}%</small>
            </>
          );
          return (
            <li key={arc.label}>
              {arc.href ? (
                <Link href={arc.href} className="an-legend__link" title={`View ${arc.label} in master log`}>
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Daily column chart with axis, gridlines and tooltips
   ────────────────────────────────────────────────────────────── */

export interface TrendPoint {
  dateStr: string;
  displayLabel: string;
  subLabel?: string;
  count: number;
}

function parseTrendLabel(displayLabel: string, subLabel?: string): { date: string; day?: string; fullLabel: string } {
  if (subLabel) {
    return {
      date: displayLabel,
      day: subLabel,
      fullLabel: `${subLabel} ${displayLabel}`
    };
  }
  const parts = displayLabel.trim().split(/\s+/);
  if (parts.length === 2) {
    // If format is "Sun 11/10" (Day Date)
    if (/^[A-Za-z]+$/.test(parts[0]) && /[\d/]/.test(parts[1])) {
      return {
        date: parts[1],
        day: parts[0],
        fullLabel: displayLabel
      };
    }
    // If format is "11/10 Sun" (Date Day)
    if (/[\d/]/.test(parts[0]) && /^[A-Za-z]+$/.test(parts[1])) {
      return {
        date: parts[0],
        day: parts[1],
        fullLabel: displayLabel
      };
    }
  }
  return {
    date: displayLabel,
    fullLabel: displayLabel
  };
}

function niceScale(maxValue: number) {
  if (maxValue <= 0) return { max: 4, ticks: [0, 1, 2, 3, 4] };
  const rough = Math.max(1, Math.ceil(maxValue / 4));
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 3, 4, 5, 6, 8, 10].map((m) => m * pow).find((candidate) => candidate >= rough) ?? rough;
  return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

export function BarTrend({
  data,
  unitSingular = 'visit',
  unitPlural = 'visits',
  periodLabel
}: {
  data: TrendPoint[];
  unitSingular?: string;
  unitPlural?: string;
  periodLabel: string;
}) {
  const counts = data.map((point) => point.count);
  const total = counts.reduce((sum, value) => sum + value, 0);
  const peakValue = Math.max(0, ...counts);
  const peakPoint = data.find((point) => point.count === peakValue && peakValue > 0);
  const average = data.length ? total / data.length : 0;
  const { max, ticks } = niceScale(peakValue);
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const gap = data.length > 60 ? 1 : data.length > 30 ? 2 : 4;
  const unit = (n: number) => (n === 1 ? unitSingular : unitPlural);

  return (
    <div className="an-trend">
      <dl className="an-trend__stats">
        <div>
          <dt>Total</dt>
          <dd>{total.toLocaleString('en-IN')} <small>{unit(total)}</small></dd>
        </div>
        <div>
          <dt>Daily average</dt>
          <dd>{average.toLocaleString('en-IN', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</dd>
        </div>
        <div>
          <dt>Peak day</dt>
          <dd>
            {peakValue.toLocaleString('en-IN')}
            {peakPoint ? (
              <small> on {parseTrendLabel(peakPoint.displayLabel, peakPoint.subLabel).fullLabel}</small>
            ) : null}
          </dd>
        </div>
      </dl>

      <div
        className="an-trend__plot"
        role="img"
        aria-label={`Daily ${unitPlural} for ${periodLabel}. Total ${total}, peak ${peakValue}.`}
      >
        <div className="an-trend__area">
          {ticks.map((tick) => (
            <div className="an-trend__line" key={tick} style={{ bottom: `${(tick / max) * 100}%` }}>
              <span>{tick}</span>
            </div>
          ))}
          <div className="an-trend__cols" style={{ gap: `${gap}px` }}>
            {data.map((point, index) => {
              const edge = index < 3 ? 'is-start' : index > data.length - 4 ? 'is-end' : '';
              const labelInfo = parseTrendLabel(point.displayLabel, point.subLabel);
              return (
                <div className={`an-trend__col ${edge}`.trim()} key={point.dateStr}>
                  {point.count > 0 ? (
                    <span
                      className="an-trend__bar"
                      style={{ height: `${(point.count / max) * 100}%`, maxWidth: data.length <= 14 ? 40 : undefined }}
                    />
                  ) : (
                    <span className="an-trend__bar an-trend__bar--zero" />
                  )}
                  <span className="an-trend__tip" style={{ bottom: `calc(${(point.count / max) * 100}% + 8px)` }}>
                    <strong>{point.count}</strong> {unit(point.count)}
                    <small>{labelInfo.fullLabel}</small>
                  </span>
                  {index % labelEvery === 0 ? (
                    <span className="an-trend__x">
                      <span className="an-trend__x-date">{labelInfo.date}</span>
                      {labelInfo.day && <span className="an-trend__x-day">{labelInfo.day}</span>}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <table className="sr-only">
        <caption>{`Daily ${unitPlural} for ${periodLabel}`}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{unitPlural}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.dateStr}>
              <th scope="row">{parseTrendLabel(point.displayLabel, point.subLabel).fullLabel}</th>
              <td>{point.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Loading skeleton
   ────────────────────────────────────────────────────────────── */

export function AnalyticsSkeleton() {
  return (
    <div className="an-skeleton" aria-busy="true" aria-label="Loading analytics">
      <div className="an-skeleton__row an-skeleton__row--kpi">
        {[0, 1, 2, 3].map((i) => (
          <div className="an-skeleton__block an-skeleton__block--kpi" key={i} />
        ))}
      </div>
      <div className="an-skeleton__row an-skeleton__row--main">
        <div className="an-skeleton__block an-skeleton__block--card" />
        <div className="an-skeleton__block an-skeleton__block--card" />
      </div>
    </div>
  );
}
