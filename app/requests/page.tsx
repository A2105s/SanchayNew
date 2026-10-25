'use client';

import { Suspense } from 'react';
import { RequestList } from '@/components/requests/RequestList';

export default function RequestsPage() {
  return (
    <Suspense fallback={<div className="page" aria-busy="true" />}>
      <RequestList />
    </Suspense>
  );
}
