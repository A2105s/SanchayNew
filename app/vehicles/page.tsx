'use client';

import { Suspense } from 'react';
import { VehicleRegistry } from '@/components/vehicles/VehicleRegistry';
import VehiclesLoading from './loading';

export default function VehiclesPage() {
  return (
    <Suspense fallback={<VehiclesLoading />}>
      <VehicleRegistry />
    </Suspense>
  );
}
