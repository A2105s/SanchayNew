import type { SVGProps } from 'react';

export interface AnimatedIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
  isHovered?: boolean;
}

const svgBase = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  style: { display: 'inline-block', flexShrink: 0 }
};

// ── Dashboard (layout-dashboard) ─────────────────────────────────────────────
export function AnimatedDashboard({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
  );
}

// ── Fleet / car ──────────────────────────────────────────────────────────────
export function AnimatedCar({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}

// ── Live map (map) ───────────────────────────────────────────────────────────
export function AnimatedMap({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
      <path d="M15 5.764v15" />
      <path d="M9 3.236v15" />
    </svg>
  );
}

// ── Stations (building) ──────────────────────────────────────────────────────
export function AnimatedBuilding({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  );
}

// ── Transfers (arrows left-right) ────────────────────────────────────────────
export function AnimatedTransfer({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <path d="m16 3 4 4-4 4" />
      <path d="M20 7H4" />
      <path d="m8 21-4-4 4-4" />
      <path d="M4 17h16" />
    </svg>
  );
}

// ── Requisitions (clipboard) ─────────────────────────────────────────────────
export function AnimatedClipboard({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </svg>
  );
}

// ── Compliance (shield-check) ────────────────────────────────────────────────
export function AnimatedShieldCheck({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

// ── Maintenance (wrench) ─────────────────────────────────────────────────────
export function AnimatedWrench({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

// ── Idle & reuse (clock) ─────────────────────────────────────────────────────
export function AnimatedClock({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

// ── Incidents (siren) ────────────────────────────────────────────────────────
export function AnimatedSiren({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <path d="M7 18v-6a5 5 0 1 1 10 0v6" />
      <path d="M5 21a1 1 0 0 0 1-1v-1a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1z" />
      <path d="M21 12h1" />
      <path d="M18.5 4.5 18 5" />
      <path d="M2 12h1" />
      <path d="M12 2v1" />
      <path d="m4.929 4.929.707.707" />
      <path d="M12 12v6" />
    </svg>
  );
}

// ── IoT hub (radio) ──────────────────────────────────────────────────────────
export function AnimatedRadio({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
      <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
    </svg>
  );
}

// ── Reports (bar-chart) ──────────────────────────────────────────────────────
export function AnimatedBarChart({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M7 16v-3" />
      <path d="M11 16V8" />
      <path d="M15 16v-5" />
    </svg>
  );
}

// ── Audit (ledger / scroll-text) ─────────────────────────────────────────────
export function AnimatedLedger({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <path d="M15 12h-5" />
      <path d="M15 8h-5" />
      <path d="M19 17V5a2 2 0 0 0-2-2H4" />
      <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />
    </svg>
  );
}

// ── Settings (gear) ──────────────────────────────────────────────────────────
export function AnimatedGear({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ── Spaces (layout) ──────────────────────────────────────────────────────────
export function AnimatedLayout({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

// ── Discover (search / compass) ──────────────────────────────────────────────
export function AnimatedSearch({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </svg>
  );
}

// ── Allocations (key) ────────────────────────────────────────────────────────
export function AnimatedKey({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  );
}

// ── Operations (activity pulse) ──────────────────────────────────────────────
export function AnimatedActivity({ size = 18 }: AnimatedIconProps) {
  return (
    <svg width={size} height={size} {...svgBase}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
