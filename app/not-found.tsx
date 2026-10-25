import { ButtonLink } from '@/components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="page">
      <div className="empty-state">
        <p className="empty-state__label">Page not found</p>
        <p className="empty-state__hint">The requested Sanchay screen does not exist.</p>
        <div className="empty-state__action">
          <ButtonLink href="/dashboard">Return to dashboard</ButtonLink>
        </div>
      </div>
    </div>
  );
}
