'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';

// Client-only: maplibre-gl touches window/document and must not run on the server.
const LiveMap = dynamic(() => import('@/components/vehicles/LiveMap').then((m) => m.LiveMap), {
  ssr: false,
  loading: () => (
    <div className="veh-map-page" aria-busy="true" aria-label="Loading live map">
      <Skeleton height="100%" />
    </div>
  ),
});

export default function VehiclesMapPage() {
  return <LiveMap />;
}
