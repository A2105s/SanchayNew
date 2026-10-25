'use client';

import { Suspense } from 'react';
import { AllocationList } from '@/components/requests/AllocationList';

export default function AllocationsPage() {
  return (
    <Suspense fallback={<div className="page" aria-busy="true" />}>
      <AllocationList />
    </Suspense>
  );
}
