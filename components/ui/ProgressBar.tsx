type ProgressTone = 'brand' | 'success' | 'warning' | 'danger';

interface ProgressBarProps {
  value: number; // 0..100
  tone?: ProgressTone;
  ariaLabel?: string;
}

const TONE_COLOR: Record<ProgressTone, string> = {
  brand: 'linear-gradient(90deg, var(--color-brand), #23b6c1)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)'
};

export function ProgressBar({ value, tone = 'brand', ariaLabel }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <span style={{ width: `${clamped}%`, background: TONE_COLOR[tone] }} />
    </div>
  );
}
