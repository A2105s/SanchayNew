import { Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="page stack" aria-busy="true" aria-label="Loading">
      <div className="cluster" style={{ justifyContent: 'space-between' }}>
        <Skeleton height={32} width={240} />
        <Skeleton height={36} width={140} />
      </div>
      <div className="metric-grid">
        <Skeleton height={96} />
        <Skeleton height={96} />
        <Skeleton height={96} />
        <Skeleton height={96} />
      </div>
      <Skeleton height={320} />
    </div>
  );
}
