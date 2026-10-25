import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageTitleProps {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  back?: { href: string; label: string };
}

export function PageTitle({ eyebrow, title, description, action, back }: PageTitleProps) {
  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      {back ? (
        <div className="detail-back-link">
          <Link href={back.href} className="detail-back-button">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{back.label}</span>
          </Link>
        </div>
      ) : null}
      <header className="page-title">
        <div className="page-title__copy">
          {eyebrow ? <span className="page-title__eyebrow">{eyebrow}</span> : null}
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="page-title__action">{action}</div> : null}
      </header>
    </div>
  );
}
