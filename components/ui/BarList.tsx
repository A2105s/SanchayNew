interface BarItem {
  label: string;
  value: number;
  detail?: string;
}

interface BarListProps {
  items: BarItem[];
  tone?: 'brand' | 'success' | 'warning' | 'danger';
}

const TONE_FILL: Record<NonNullable<BarListProps['tone']>, string> = {
  brand: 'var(--color-brand-subtle)',
  success: 'var(--color-success-bg)',
  warning: 'var(--color-warning-bg)',
  danger: 'var(--color-danger-bg)'
};

export function BarList({ items, tone = 'brand' }: BarListProps) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="bar-list">
      {items.map((item) => {
        const pct = Math.round((item.value / max) * 100);
        return (
          <li key={item.label} className="bar-list__item">
            <span className="bar-list__fill" style={{ width: `${pct}%`, background: TONE_FILL[tone] }} aria-hidden="true" />
            <span className="bar-list__label">{item.label}</span>
            <span className="bar-list__value mono">
              {item.value.toLocaleString('en-IN')}
              {item.detail ? <small className="bar-list__detail"> {item.detail}</small> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
