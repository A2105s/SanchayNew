'use client';

import { useEffect } from 'react';
import { motion, useAnimation, useReducedMotion, type TargetAndTransition } from 'framer-motion';

export interface AnimatedIconProps {
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

/** Shared hook: drive a single animation group on hover, respecting reduced motion. */
function useHoverAnim(isHovered: boolean, active: TargetAndTransition, rest: TargetAndTransition) {
  const controls = useAnimation();
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) {
      void controls.start({ ...rest, transition: { duration: 0 } });
      return;
    }
    void controls.start(isHovered ? active : rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHovered, reduce, controls]);
  return controls;
}

// ── Dashboard (layout-dashboard) — panels resize ─────────────────────────────
export function AnimatedDashboard({ size = 18, isHovered = false }: AnimatedIconProps) {
  const reduce = useReducedMotion();
  const rect1 = useAnimation();
  const rect2 = useAnimation();
  useEffect(() => {
    const t = { duration: reduce ? 0 : 0.3, ease: 'easeInOut' as const };
    void rect1.start({ height: isHovered && !reduce ? 5 : 9, transition: t });
    void rect2.start({ height: isHovered && !reduce ? 9 : 5, transition: t });
  }, [isHovered, reduce, rect1, rect2]);
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.rect x="3" y="3" width="7" rx="1" initial={{ height: 9 }} animate={rect1} />
      <motion.rect x="3" y="14" width="7" rx="1" initial={{ height: 7 }} animate={rect2} />
      <rect x="14" y="3" width="7" height="18" rx="1" />
    </motion.svg>
  );
}

// ── Fleet / car ──────────────────────────────────────────────────────────────
export function AnimatedCar({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { x: [0, 2, 0], transition: { duration: 0.5, ease: 'easeInOut' } }, { x: 0, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.g animate={controls}>
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" />
        <path d="M9 17h6" />
        <circle cx="17" cy="17" r="2" />
      </motion.g>
    </motion.svg>
  );
}

// ── Live map (map) ───────────────────────────────────────────────────────────
export function AnimatedMap({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { scale: [1, 1.12, 1], transition: { duration: 0.5, ease: 'easeInOut' } }, { scale: 1, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.g animate={controls} style={{ transformOrigin: '50% 50%' }}>
        <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
        <path d="M15 5.764v15" />
        <path d="M9 3.236v15" />
      </motion.g>
    </motion.svg>
  );
}

// ── Stations (building) ──────────────────────────────────────────────────────
export function AnimatedBuilding({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { y: [0, -2, 0], transition: { duration: 0.45, ease: 'easeInOut' } }, { y: 0, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.g animate={controls}>
        <rect width="16" height="20" x="4" y="2" rx="2" />
        <path d="M9 22v-4h6v4" />
        <path d="M8 6h.01" /><path d="M16 6h.01" />
        <path d="M12 6h.01" /><path d="M12 10h.01" />
        <path d="M12 14h.01" /><path d="M16 10h.01" />
        <path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" />
      </motion.g>
    </motion.svg>
  );
}

// ── Transfers (arrows left-right) ────────────────────────────────────────────
export function AnimatedTransfer({ size = 18, isHovered = false }: AnimatedIconProps) {
  const reduce = useReducedMotion();
  const top = useAnimation();
  const bottom = useAnimation();
  useEffect(() => {
    const t = { duration: reduce ? 0 : 0.5, ease: 'easeInOut' as const };
    void top.start({ x: isHovered && !reduce ? [0, 2, 0] : 0, transition: t });
    void bottom.start({ x: isHovered && !reduce ? [0, -2, 0] : 0, transition: t });
  }, [isHovered, reduce, top, bottom]);
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.g animate={top}>
        <path d="m16 3 4 4-4 4" />
        <path d="M20 7H4" />
      </motion.g>
      <motion.g animate={bottom}>
        <path d="m8 21-4-4 4-4" />
        <path d="M4 17h16" />
      </motion.g>
    </motion.svg>
  );
}

// ── Requisitions (clipboard) ─────────────────────────────────────────────────
export function AnimatedClipboard({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { rotate: [0, -6, 0], transition: { duration: 0.5, ease: 'easeInOut' } }, { rotate: 0, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.g animate={controls} style={{ transformOrigin: '50% 10%' }}>
        <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="M9 12h6" /><path d="M9 16h4" />
      </motion.g>
    </motion.svg>
  );
}

// ── Compliance (shield-check) ────────────────────────────────────────────────
export function AnimatedShieldCheck({ size = 18, isHovered = false }: AnimatedIconProps) {
  const reduce = useReducedMotion();
  const check = useAnimation();
  useEffect(() => {
    if (isHovered && !reduce) {
      void check.start({ pathLength: 0, opacity: 0, transition: { duration: 0 } });
      void check.start({ pathLength: 1, opacity: 1, transition: { duration: 0.4, ease: 'easeInOut' } });
    } else {
      void check.start({ pathLength: 1, opacity: 1, transition: { duration: 0 } });
    }
  }, [isHovered, reduce, check]);
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <motion.path d="m9 12 2 2 4-4" animate={check} initial={{ pathLength: 1, opacity: 1 }} />
    </motion.svg>
  );
}

// ── Maintenance (wrench) ─────────────────────────────────────────────────────
export function AnimatedWrench({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { rotate: [0, 30, -5, 0], transition: { duration: 0.5, ease: 'easeInOut' } }, { rotate: 0, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.g animate={controls} style={{ transformOrigin: 'bottom left' }}>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </motion.g>
    </motion.svg>
  );
}

// ── Idle & reuse (clock) ─────────────────────────────────────────────────────
export function AnimatedClock({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { rotate: [0, 90, 180, 270, 360], transition: { duration: 0.8, ease: 'easeInOut' } }, { rotate: 0, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <circle cx="12" cy="12" r="10" />
      <motion.path d="M12 6v6l4 2" animate={controls} style={{ transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}

// ── Incidents (siren) ────────────────────────────────────────────────────────
export function AnimatedSiren({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { rotate: [0, -8, 8, -8, 0], transition: { duration: 0.6, ease: 'easeInOut' } }, { rotate: 0, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.g animate={controls} style={{ transformOrigin: '50% 60%' }}>
        <path d="M7 18v-6a5 5 0 1 1 10 0v6" />
        <path d="M5 21a1 1 0 0 0 1-1v-1a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1z" />
        <path d="M21 12h1" /><path d="M18.5 4.5 18 5" />
        <path d="M2 12h1" /><path d="M12 2v1" /><path d="m4.929 4.929.707.707" />
        <path d="M12 12v6" />
      </motion.g>
    </motion.svg>
  );
}

// ── IoT hub (radio) ──────────────────────────────────────────────────────────
export function AnimatedRadio({ size = 18, isHovered = false }: AnimatedIconProps) {
  const reduce = useReducedMotion();
  const waves = useAnimation();
  useEffect(() => {
    if (isHovered && !reduce) {
      void waves.start({ scale: [1, 1.15, 1], opacity: [1, 0.6, 1], transition: { duration: 0.8, ease: 'easeInOut', repeat: Infinity } });
    } else {
      void waves.stop();
      void waves.start({ scale: 1, opacity: 1, transition: { duration: 0 } });
    }
  }, [isHovered, reduce, waves]);
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <motion.path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" animate={waves} style={{ transformOrigin: '12px 12px' }} />
      <circle cx="12" cy="12" r="2" />
      <motion.path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" animate={waves} style={{ transformOrigin: '12px 12px' }} />
      <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
    </motion.svg>
  );
}

// ── Reports (bar-chart) ──────────────────────────────────────────────────────
export function AnimatedBarChart({ size = 18, isHovered = false }: AnimatedIconProps) {
  const reduce = useReducedMotion();
  const b1 = useAnimation();
  const b2 = useAnimation();
  const b3 = useAnimation();
  useEffect(() => {
    if (isHovered && !reduce) {
      [b1, b2, b3].forEach((b) => void b.start({ pathLength: 0, opacity: 0, transition: { duration: 0 } }));
      setTimeout(() => void b1.start({ pathLength: 1, opacity: 1, transition: { duration: 0.35, ease: 'easeInOut' } }), 0);
      setTimeout(() => void b2.start({ pathLength: 1, opacity: 1, transition: { duration: 0.35, ease: 'easeInOut' } }), 180);
      setTimeout(() => void b3.start({ pathLength: 1, opacity: 1, transition: { duration: 0.35, ease: 'easeInOut' } }), 360);
    } else {
      [b1, b2, b3].forEach((b) => void b.start({ pathLength: 1, opacity: 1, transition: { duration: 0 } }));
    }
  }, [isHovered, reduce, b1, b2, b3]);
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <motion.path d="M7 16v-3" animate={b1} initial={{ pathLength: 1, opacity: 1 }} />
      <motion.path d="M11 16V8" animate={b2} initial={{ pathLength: 1, opacity: 1 }} />
      <motion.path d="M15 16v-5" animate={b3} initial={{ pathLength: 1, opacity: 1 }} />
    </motion.svg>
  );
}

// ── Audit (ledger / scroll-text) ─────────────────────────────────────────────
export function AnimatedLedger({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { y: [0, -2, 0], transition: { duration: 0.5, ease: 'easeInOut' } }, { y: 0, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <path d="M15 12h-5" /><path d="M15 8h-5" />
      <path d="M19 17V5a2 2 0 0 0-2-2H4" />
      <motion.path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" animate={controls} />
    </motion.svg>
  );
}

// ── Settings (gear) ──────────────────────────────────────────────────────────
export function AnimatedGear({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { rotate: [0, 90, 180], transition: { duration: 1.1, ease: 'easeInOut' } }, { rotate: 0, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.g animate={controls} style={{ transformOrigin: '50% 50%' }}>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </motion.g>
    </motion.svg>
  );
}

// ── Spaces (layout) ──────────────────────────────────────────────────────────
export function AnimatedLayout({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { scale: [1, 1.08, 1], transition: { duration: 0.45, ease: 'easeInOut' } }, { scale: 1, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.g animate={controls} style={{ transformOrigin: '50% 50%' }}>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18" /><path d="M9 21V9" />
      </motion.g>
    </motion.svg>
  );
}

// -- Discover (search / compass) ----------------------------------------------
export function AnimatedSearch({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { x: [0, -1.5, 1.5, 0], y: [0, 1.5, -1.5, 0], transition: { duration: 0.7, ease: 'easeInOut' } }, { x: 0, y: 0, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.g animate={controls}>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
        <path d="M11 8v6" />
        <path d="M8 11h6" />
      </motion.g>
    </motion.svg>
  );
}

// -- Allocations (key) --------------------------------------------------------
export function AnimatedKey({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { rotate: [0, -18, 12, 0], transition: { duration: 0.6, ease: 'easeInOut' } }, { rotate: 0, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.g animate={controls} style={{ transformOrigin: '7.5px 15.5px' }}>
        <circle cx="7.5" cy="15.5" r="5.5" />
        <path d="m21 2-9.6 9.6" />
        <path d="m15.5 7.5 3 3L22 7l-3-3" />
      </motion.g>
    </motion.svg>
  );
}

// -- Operations (activity pulse) ----------------------------------------------
export function AnimatedActivity({ size = 18, isHovered = false }: AnimatedIconProps) {
  const controls = useHoverAnim(isHovered, { pathLength: [0, 1], transition: { duration: 0.7, ease: 'easeInOut' } }, { pathLength: 1, transition: { duration: 0 } });
  return (
    <motion.svg width={size} height={size} {...svgBase}>
      <motion.path d="M22 12h-4l-3 9L9 3l-3 9H2" animate={controls} initial={{ pathLength: 1 }} />
    </motion.svg>
  );
}
