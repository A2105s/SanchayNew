'use client';

import { Button } from '@/components/ui/Button';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page">
      <div className="empty-state">
        <p className="empty-state__label">Something went wrong</p>
        <p className="empty-state__hint">This screen could not load. You can try again, or return to the dashboard.</p>
        <details className="error-details">
          <summary>Technical details</summary>
          <code>{error.message}</code>
        </details>
        <div className="empty-state__action">
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </div>
  );
}
