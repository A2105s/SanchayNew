import type { ReactNode } from 'react';

export interface TimelineEntry {
  id: string;
  title: string;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  who?: string | null;
  when?: string | null;
  comment?: string | null;
  children?: ReactNode;
}

/**
 * Vertical timeline for approval / decision steps (spec 16). Shows who, when and
 * the decision comment for each step.
 */
export function Timeline({ entries, emptyLabel = 'No activity yet.' }: { entries: TimelineEntry[]; emptyLabel?: string }) {
  if (!entries.length) {
    return <p className="timeline__empty">{emptyLabel}</p>;
  }
  return (
    <ol className="timeline">
      {entries.map((entry) => (
        <li key={entry.id} className={`timeline__item timeline__item--${entry.tone ?? 'neutral'}`}>
          <span className="timeline__dot" aria-hidden="true" />
          <div className="timeline__content">
            <div className="timeline__head">
              <span className="timeline__title">{entry.title}</span>
              {entry.when ? <span className="timeline__when">{entry.when}</span> : null}
            </div>
            {entry.who ? <span className="timeline__who">{entry.who}</span> : null}
            {entry.comment ? <p className="timeline__comment">{entry.comment}</p> : null}
            {entry.children}
          </div>
        </li>
      ))}
    </ol>
  );
}
