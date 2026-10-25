import type { ReactNode } from 'react';

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  segments: DonutSegment[];
  center?: ReactNode;
  size?: number;
  thickness?: number;
}

export function Donut({ segments, center, size = 140, thickness = 18 }: DonutProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  let offset = 0;

  return (
    <div className="donut" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution">
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--color-bg-tertiary)" strokeWidth={thickness} />
          {total > 0 &&
            segments.map((segment) => {
              const fraction = segment.value / total;
              const dash = fraction * circumference;
              const circle = (
                <circle
                  key={segment.label}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  strokeLinecap="butt"
                >
                  <title>{`${segment.label}: ${segment.value.toLocaleString('en-IN')}`}</title>
                </circle>
              );
              offset += dash;
              return circle;
            })}
        </svg>
        {center ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              fontWeight: 800
            }}
          >
            {center}
          </div>
        ) : null}
      </div>
      <ul className="donut__legend" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segments.map((segment) => (
          <li key={segment.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: segment.color, flexShrink: 0 }} aria-hidden="true" />
            <span className="text-muted">{segment.label}</span>
            <strong className="mono" style={{ marginLeft: 'auto' }}>{segment.value.toLocaleString('en-IN')}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
