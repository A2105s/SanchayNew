export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

export function StatusDot({
  tone = 'neutral',
  label,
  pulse = false
}: {
  tone?: StatusTone;
  label?: string;
  pulse?: boolean;
}) {
  return (
    <span className="status-dot-wrap" title={label}>
      <span className={`status-dot status-dot--${tone}${pulse ? ' status-dot--pulse' : ''}`} aria-hidden="true" />
      {label ? <span className="status-dot__label">{label}</span> : null}
    </span>
  );
}
