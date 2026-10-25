'use client';

import { use } from 'react';
import { AllocationDetail } from '@/components/requests/AllocationDetail';

export default function AllocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AllocationDetail id={id} />;
}
