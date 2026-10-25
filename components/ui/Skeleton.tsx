interface SkeletonProps {
  height?: number | string;
  width?: number | string;
  className?: string;
}

export function Skeleton({ height = 18, width = '100%', className = '' }: SkeletonProps) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={{ display: 'block', height, width }}
      aria-hidden="true"
    />
  );
}
