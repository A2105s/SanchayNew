'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy, Minus, Plus } from 'lucide-react';
import { copyText } from './shared';

export interface TimelineStep {
  label: string;
  time?: string | null;
  state: 'done' | 'active' | 'pending' | 'rejected';
  detail?: string;
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="ops-timeline">
      {steps.map((s, i) => (
        <div className="ops-tl-step" key={i}>
          <div className={`ops-tl-dot ops-tl-dot--${s.state === 'pending' ? '' : s.state}`.trim()} />
          <div className="ops-tl-body">
            <span className="ops-tl-label">{s.label}</span>
            {s.time ? <span className="ops-tl-time">{s.time}</span> : null}
            {s.detail ? <span className="ops-tl-time">{s.detail}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  ariaLabel?: string;
}) {
  return (
    <div className="ops-stepper" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Decrease"
      >
        <Minus size={14} />
      </button>
      <span className="ops-stepper-val" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export function SignalBars({ dbm }: { dbm: number | null }) {
  // -50 great .. -110 poor. Map to 0..4 bars.
  let bars = 0;
  if (dbm != null) {
    if (dbm >= -60) bars = 4;
    else if (dbm >= -75) bars = 3;
    else if (dbm >= -90) bars = 2;
    else if (dbm >= -105) bars = 1;
    else bars = 0;
  }
  const label = dbm == null ? 'No signal data' : `${dbm} dBm`;
  return (
    <span className="ops-signal" title={label} aria-label={label}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={i < bars ? 'on' : ''} style={{ height: `${(i + 1) * 3 + 2}px` }} />
      ))}
    </span>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="chip"
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      aria-label={label}
      style={{ cursor: 'pointer', border: 'none' }}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
      {done ? 'Copied' : label}
    </button>
  );
}

export function KvRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="text-muted">{k}</span>
      <span>{v}</span>
    </div>
  );
}
