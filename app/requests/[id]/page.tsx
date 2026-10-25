'use client';

import { use } from 'react';
import { RequestDetail } from '@/components/requests/RequestDetail';

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequestDetail id={id} />;
}
