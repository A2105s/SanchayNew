'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterVehiclePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/vehicles?register=1');
  }, [router]);

  return (
    <div style={{ padding: '3rem', textAlign: 'center', minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p className="text-muted" style={{ fontSize: '0.92rem' }}>Opening vehicle registration wizard…</p>
    </div>
  );
}

