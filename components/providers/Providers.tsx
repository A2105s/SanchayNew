'use client';

import { type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { FleetProvider } from '@/components/providers/FleetProvider';

/**
 * App-wide client providers. ToastProvider must wrap FleetProvider so that
 * data-layer consumers can raise toasts, and so useToast() is available app-wide.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <FleetProvider>{children}</FleetProvider>
    </ToastProvider>
  );
}
