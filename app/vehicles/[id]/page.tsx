'use client';

import { use } from 'react';
import { VehicleDetail } from '@/components/vehicles/VehicleDetail';

export default function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <VehicleDetail id={id} />;
}
