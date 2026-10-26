import { Skeleton } from '@/components/ui/Skeleton';

export default function VehiclesLoading() {
  return (
    <div className="page stack" aria-busy="true" aria-label="Loading fleet registry">
      <div className="cluster" style={{ justifyContent: 'space-between' }}>
        <Skeleton height="2.2rem" width="280px" />
        <Skeleton height="2.2rem" width="340px" />
      </div>
      <div className="an-kpis">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height="88px" />
        ))}
      </div>
      <Skeleton height="56px" />
      <div className="table-wrap">
        <Skeleton height="420px" />
      </div>
    </div>
  );
}
