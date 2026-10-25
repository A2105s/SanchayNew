import type { ReactNode } from 'react';

interface PanelHeaderProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PanelHeader({ icon, title, subtitle, action }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <div className="panel-header__title">
        {icon ? <span className="panel-header__icon">{icon}</span> : null}
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="panel-header__action">{action}</div> : null}
    </div>
  );
}
