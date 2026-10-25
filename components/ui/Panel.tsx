import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  bleed?: boolean;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, icon, action, bleed = false, className = '', children }: PanelProps) {
  const hasHeader = Boolean(title || subtitle || icon || action);
  return (
    <section className={`panel${bleed ? ' panel--bleed' : ''} ${className}`.trim()}>
      {hasHeader ? (
        <div className="panel-header">
          <div className="panel-header__title">
            {icon ? <span className="panel-header__icon">{icon}</span> : null}
            <div>
              {title ? <h2>{title}</h2> : null}
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </div>
          {action ? <div className="panel-header__action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
