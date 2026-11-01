'use client';

import { type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { FleetProvider } from '@/components/providers/FleetProvider';
import { I18nProvider } from '@/lib/i18n/context';

/**
 * App-wide client providers. ToastProvider must wrap FleetProvider so that
 * data-layer consumers can raise toasts, and so useToast() is available app-wide.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <FleetProvider>{children}</FleetProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
