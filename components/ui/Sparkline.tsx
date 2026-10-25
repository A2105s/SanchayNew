type SparkTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE_STROKE: Record<SparkTone, string> = {
  brand: 'var(--color-brand)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  neutral: 'var(--color-text-muted)'
};

interface SparklineProps {
  values: number[];
  tone?: SparkTone;
  width?: number;
  height?: number;
  ariaLabel?: string;
}

export function Sparkline({ values, tone = 'brand', width = 120, height = 32, ariaLabel }: SparklineProps) {
  if (!values.length) {
    return <svg width={width} height={height} role="img" aria-label={ariaLabel ?? 'No data'} />;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;

  const points = values.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const stroke = TONE_STROKE[tone];
  const areaPath = `M0,${height} L${points.join(' L')} L${width},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel ?? 'Trend'}>
      <path d={areaPath} fill={stroke} opacity={0.12} />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
