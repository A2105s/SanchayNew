'use client';

import React from 'react';
import type { Sector, VehicleClass, VehicleStatus } from '@/types';

export interface FleetMarkerProps {
  sector?: Sector | string;
  vehicleClass?: VehicleClass | string;
  status: VehicleStatus;
  heading: number; // 0 - 360 degrees
  registrationNumber?: string;
  speedKmph?: number;
  selected?: boolean;
  onClick?: () => void;
}

/** Top-down vector Ambulance with emergency lightbar & medical cross */
export function AmbulanceIcon({ color = '#dc2626' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Vehicle Body */}
      <rect x="13" y="6" width="14" height="28" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
      {/* Front Hood / Windshield */}
      <path d="M15 11C15 9.5 16.5 8 20 8C23.5 8 25 9.5 25 11L24 15H16L15 11Z" fill="#1e293b" />
      {/* Red Roof Stripe */}
      <rect x="18" y="15" width="4" height="15" fill={color} />
      {/* Medical Cross */}
      <path d="M17 21H23M20 18V24" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      {/* Emergency Lightbar */}
      <rect x="16" y="15" width="3.5" height="2.5" rx="1" fill="#ef4444" />
      <rect x="20.5" y="15" width="3.5" height="2.5" rx="1" fill="#06b6d4" />
      {/* Rear Cabin Glass */}
      <rect x="15" y="29" width="10" height="2" rx="1" fill="#334155" />
      {/* Side Mirrors */}
      <rect x="11.5" y="12" width="1.5" height="3" rx="0.75" fill="#64748b" />
      <rect x="27" y="12" width="1.5" height="3" rx="0.75" fill="#64748b" />
    </svg>
  );
}

/** Top-down Police Interceptor Cruiser with star crest & dual strobe */
export function PoliceIcon({ color = '#1d4ed8' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Cruiser Body */}
      <rect x="13" y="6" width="14" height="28" rx="4" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
      {/* White Roof / Doors */}
      <rect x="14" y="15" width="12" height="12" rx="2" fill="#f8fafc" />
      {/* Windshield */}
      <path d="M15 11C15 9.5 16.5 8 20 8C23.5 8 25 9.5 25 11L24 15H16L15 11Z" fill="#0284c7" fillOpacity="0.8" />
      {/* Gold Star / Police Shield Crest */}
      <polygon points="20,18 21.2,21.5 24.8,21.5 21.9,23.5 23,27 20,24.8 17,27 18.1,23.5 15.2,21.5 18.8,21.5" fill="#eab308" />
      {/* Emergency Strobe Lightbar */}
      <rect x="15.5" y="14" width="4" height="2" rx="1" fill="#ef4444" />
      <rect x="20.5" y="14" width="4" height="2" rx="1" fill="#2563eb" />
      {/* Side Mirrors */}
      <rect x="11.5" y="12" width="1.5" height="3" rx="0.75" fill="#475569" />
      <rect x="27" y="12" width="1.5" height="3" rx="0.75" fill="#475569" />
    </svg>
  );
}

/** Top-down Municipal Waste Compactor Truck (GMC) */
export function WasteTruckIcon({ color = '#059669' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" width="30" height="30" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Front Cab */}
      <rect x="13" y="6" width="14" height="10" rx="2.5" fill="#10b981" stroke="#047857" strokeWidth="1.5" />
      <path d="M15 8C15 7 16.5 6.5 20 6.5C23.5 6.5 25 7 25 8L24 11H16L15 8Z" fill="#0f172a" />
      {/* Waste Compactor Body */}
      <rect x="12" y="15" width="16" height="20" rx="3" fill="#065f46" stroke="#047857" strokeWidth="1.5" />
      {/* Recycling Glyph */}
      <path d="M20 19L22.5 23H17.5L20 19Z" fill="#34d399" />
      <circle cx="20" cy="26" r="2.5" stroke="#34d399" strokeWidth="1.2" />
      {/* Rear Hazard Chevrons */}
      <line x1="13" y1="33" x2="27" y2="33" stroke="#f59e0b" strokeWidth="2" strokeDasharray="2 2" />
      {/* Heavy Wheels */}
      <rect x="10.5" y="10" width="2" height="4" rx="1" fill="#0f172a" />
      <rect x="27.5" y="10" width="2" height="4" rx="1" fill="#0f172a" />
      <rect x="10.5" y="27" width="2" height="6" rx="1" fill="#0f172a" />
      <rect x="27.5" y="27" width="2" height="6" rx="1" fill="#0f172a" />
    </svg>
  );
}

/** Top-down Heavy Dump Truck / PWD Tipper */
export function HeavyTruckIcon({ color = '#d97706' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" width="30" height="30" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Front Heavy Cab */}
      <rect x="13" y="6" width="14" height="9" rx="2" fill="#f59e0b" stroke="#b45309" strokeWidth="1.5" />
      <path d="M15 8H25L24 11H16L15 8Z" fill="#0f172a" />
      {/* Tipper Bed with reinforced ribs */}
      <rect x="12" y="14" width="16" height="21" rx="2" fill="#78350f" stroke="#b45309" strokeWidth="1.5" />
      <line x1="14" y1="19" x2="26" y2="19" stroke="#d97706" strokeWidth="1.5" />
      <line x1="14" y1="24" x2="26" y2="24" stroke="#d97706" strokeWidth="1.5" />
      <line x1="14" y1="29" x2="26" y2="29" stroke="#d97706" strokeWidth="1.5" />
      {/* Hazard Stripes */}
      <rect x="12" y="33" width="16" height="2" fill="#f59e0b" />
      {/* Heavy Double Axles */}
      <rect x="10" y="22" width="2.5" height="5" rx="1" fill="#0f172a" />
      <rect x="27.5" y="22" width="2.5" height="5" rx="1" fill="#0f172a" />
      <rect x="10" y="29" width="2.5" height="5" rx="1" fill="#0f172a" />
      <rect x="27.5" y="29" width="2.5" height="5" rx="1" fill="#0f172a" />
    </svg>
  );
}

/** Top-down Health Van / Mobile Medical Clinic */
export function HealthVanIcon({ color = '#0d9488' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Van Body */}
      <rect x="13" y="6" width="14" height="28" rx="4" fill="#f0fdfa" stroke="#0d9488" strokeWidth="1.5" />
      {/* Front Windshield */}
      <path d="M15 11C15 9.5 16.5 8 20 8C23.5 8 25 9.5 25 11L24 15H16L15 11Z" fill="#134e4a" />
      {/* Teal Clinic Stripe */}
      <rect x="14" y="16" width="12" height="4" fill="#0d9488" />
      {/* Medical Cross */}
      <path d="M18 25H22M20 23V27" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" />
      {/* Side Mirrors */}
      <rect x="11.5" y="12" width="1.5" height="3" rx="0.75" fill="#475569" />
      <rect x="27" y="12" width="1.5" height="3" rx="0.75" fill="#475569" />
    </svg>
  );
}

/** Top-down Executive Govt Sedan / Official Staff Car */
export function SedanIcon({ color = '#38bdf8' }: { color?: string }) {
  return (
    <svg viewBox="0 0 40 40" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Sleek Aerodynamic Body */}
      <path
        d="M16 6C17 5 23 5 24 6L25.5 11C26 13 26.5 22 26 29C25.5 32 23.5 34 20 34C16.5 34 14.5 32 14 29C13.5 22 14 13 14.5 11L16 6Z"
        fill="#1e293b"
        stroke="#475569"
        strokeWidth="1.5"
      />
      {/* Front Windshield */}
      <path d="M15.5 12C16 10.5 17.5 10 20 10C22.5 10 24 10.5 24.5 12L24 16H16L15.5 12Z" fill="#38bdf8" fillOpacity="0.8" />
      {/* Roof with subtle metallic highlight */}
      <rect x="16.5" y="17" width="7" height="9" rx="2" fill="#334155" />
      {/* Rear Window */}
      <path d="M16 27H24L23.5 29C23 29.5 21.5 30 20 30C18.5 30 17 29.5 16.5 29L16 27Z" fill="#38bdf8" fillOpacity="0.7" />
      {/* Headlights */}
      <circle cx="16" cy="7" r="1" fill="#fef08a" />
      <circle cx="24" cy="7" r="1" fill="#fef08a" />
      {/* Mirrors */}
      <rect x="12.5" y="13" width="1.5" height="2.5" rx="0.75" fill="#64748b" />
      <rect x="26" y="13" width="1.5" height="2.5" rx="0.75" fill="#64748b" />
    </svg>
  );
}

/** Top-down Motorbike / Patrol Bike */
export function MotorcycleIcon() {
  return (
    <svg viewBox="0 0 40 40" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Wheels */}
      <rect x="18.5" y="5" width="3" height="7" rx="1.5" fill="#0f172a" />
      <rect x="18.5" y="27" width="3" height="7" rx="1.5" fill="#0f172a" />
      {/* Frame / Tank */}
      <rect x="17.5" y="13" width="5" height="13" rx="2.5" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="1" />
      {/* Handlebars */}
      <line x1="14" y1="12" x2="26" y2="12" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      {/* Rider Helmet */}
      <circle cx="20" cy="18" r="3" fill="#ffffff" stroke="#1e293b" strokeWidth="1.2" />
    </svg>
  );
}

/** Select proper icon by vehicle sector / class */
export function getFleetIcon(sector?: string, vehicleClass?: string) {
  if (sector === 'AMBULANCE_108') return <AmbulanceIcon />;
  if (sector === 'POLICE_PATROL') return <PoliceIcon />;
  if (sector === 'GMC_WASTE') return <WasteTruckIcon />;
  if (sector === 'PWD_HEAVY') return <HeavyTruckIcon />;
  if (sector === 'HEALTH_VAN') return <HealthVanIcon />;

  if (vehicleClass === 'MOTORCYCLE') return <MotorcycleIcon />;
  if (vehicleClass === 'HEAVY') return <HeavyTruckIcon />;
  if (vehicleClass === 'VAN') return <HealthVanIcon />;
  return <SedanIcon />;
}

export const FLEET_SVG_STRINGS = {
  ambulance: `<svg viewBox="0 0 40 40" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="13" y="6" width="14" height="28" rx="4" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" />
    <path d="M15 11C15 9.5 16.5 8 20 8C23.5 8 25 9.5 25 11L24 15H16L15 11Z" fill="#1e293b" />
    <rect x="18" y="15" width="4" height="15" fill="#dc2626" />
    <path d="M17 21H23M20 18V24" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
    <rect x="16" y="15" width="3.5" height="2.5" rx="1" fill="#ef4444" />
    <rect x="20.5" y="15" width="3.5" height="2.5" rx="1" fill="#06b6d4" />
    <rect x="15" y="29" width="10" height="2" rx="1" fill="#334155" />
    <rect x="11.5" y="12" width="1.5" height="3" rx="0.75" fill="#64748b" />
    <rect x="27" y="12" width="1.5" height="3" rx="0.75" fill="#64748b" />
  </svg>`,
  police: `<svg viewBox="0 0 40 40" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="13" y="6" width="14" height="28" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
    <rect x="14" y="15" width="12" height="12" rx="2" fill="#f8fafc" />
    <path d="M15 11C15 9.5 16.5 8 20 8C23.5 8 25 9.5 25 11L24 15H16L15 11Z" fill="#0284c7" fill-opacity="0.8" />
    <polygon points="20,18 21.2,21.5 24.8,21.5 21.9,23.5 23,27 20,24.8 17,27 18.1,23.5 15.2,21.5 18.8,21.5" fill="#eab308" />
    <rect x="15.5" y="14" width="4" height="2" rx="1" fill="#ef4444" />
    <rect x="20.5" y="14" width="4" height="2" rx="1" fill="#2563eb" />
    <rect x="11.5" y="12" width="1.5" height="3" rx="0.75" fill="#475569" />
    <rect x="27" y="12" width="1.5" height="3" rx="0.75" fill="#475569" />
  </svg>`,
  wasteTruck: `<svg viewBox="0 0 40 40" width="30" height="30" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="13" y="6" width="14" height="10" rx="2.5" fill="#10b981" stroke="#047857" stroke-width="1.5" />
    <path d="M15 8C15 7 16.5 6.5 20 6.5C23.5 6.5 25 7 25 8L24 11H16L15 8Z" fill="#0f172a" />
    <rect x="12" y="15" width="16" height="20" rx="3" fill="#065f46" stroke="#047857" stroke-width="1.5" />
    <path d="M20 19L22.5 23H17.5L20 19Z" fill="#34d399" />
    <circle cx="20" cy="26" r="2.5" stroke="#34d399" stroke-width="1.2" />
    <line x1="13" y1="33" x2="27" y2="33" stroke="#f59e0b" stroke-width="2" stroke-dasharray="2 2" />
    <rect x="10.5" y="10" width="2" height="4" rx="1" fill="#0f172a" />
    <rect x="27.5" y="10" width="2" height="4" rx="1" fill="#0f172a" />
    <rect x="10.5" y="27" width="2" height="6" rx="1" fill="#0f172a" />
    <rect x="27.5" y="27" width="2" height="6" rx="1" fill="#0f172a" />
  </svg>`,
  heavyTruck: `<svg viewBox="0 0 40 40" width="30" height="30" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="13" y="6" width="14" height="9" rx="2" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" />
    <path d="M15 8H25L24 11H16L15 8Z" fill="#0f172a" />
    <rect x="12" y="14" width="16" height="21" rx="2" fill="#78350f" stroke="#b45309" stroke-width="1.5" />
    <line x1="14" y1="19" x2="26" y2="19" stroke="#d97706" stroke-width="1.5" />
    <line x1="14" y1="24" x2="26" y2="24" stroke="#d97706" stroke-width="1.5" />
    <line x1="14" y1="29" x2="26" y2="29" stroke="#d97706" stroke-width="1.5" />
    <rect x="12" y="33" width="16" height="2" fill="#f59e0b" />
    <rect x="10" y="22" width="2.5" height="5" rx="1" fill="#0f172a" />
    <rect x="27.5" y="22" width="2.5" height="5" rx="1" fill="#0f172a" />
    <rect x="10" y="29" width="2.5" height="5" rx="1" fill="#0f172a" />
    <rect x="27.5" y="29" width="2.5" height="5" rx="1" fill="#0f172a" />
  </svg>`,
  healthVan: `<svg viewBox="0 0 40 40" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="13" y="6" width="14" height="28" rx="4" fill="#f0fdfa" stroke="#0d9488" stroke-width="1.5" />
    <path d="M15 11C15 9.5 16.5 8 20 8C23.5 8 25 9.5 25 11L24 15H16L15 11Z" fill="#134e4a" />
    <rect x="14" y="16" width="12" height="4" fill="#0d9488" />
    <path d="M18 25H22M20 23V27" stroke="#0d9488" stroke-width="2" stroke-linecap="round" />
    <rect x="11.5" y="12" width="1.5" height="3" rx="0.75" fill="#475569" />
    <rect x="27" y="12" width="1.5" height="3" rx="0.75" fill="#475569" />
  </svg>`,
  sedan: `<svg viewBox="0 0 40 40" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 6C17 5 23 5 24 6L25.5 11C26 13 26.5 22 26 29C25.5 32 23.5 34 20 34C16.5 34 14.5 32 14 29C13.5 22 14 13 14.5 11L16 6Z" fill="#1e293b" stroke="#475569" stroke-width="1.5" />
    <path d="M15.5 12C16 10.5 17.5 10 20 10C22.5 10 24 10.5 24.5 12L24 16H16L15.5 12Z" fill="#38bdf8" fill-opacity="0.8" />
    <rect x="16.5" y="17" width="7" height="9" rx="2" fill="#334155" />
    <path d="M16 27H24L23.5 29C23 29.5 21.5 30 20 30C18.5 30 17 29.5 16.5 29L16 27Z" fill="#38bdf8" fill-opacity="0.7" />
    <circle cx="16" cy="7" r="1" fill="#fef08a" />
    <circle cx="24" cy="7" r="1" fill="#fef08a" />
    <rect x="12.5" y="13" width="1.5" height="2.5" rx="0.75" fill="#64748b" />
    <rect x="26" y="13" width="1.5" height="2.5" rx="0.75" fill="#64748b" />
  </svg>`,
  motorcycle: `<svg viewBox="0 0 40 40" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="18.5" y="5" width="3" height="7" rx="1.5" fill="#0f172a" />
    <rect x="18.5" y="27" width="3" height="7" rx="1.5" fill="#0f172a" />
    <rect x="17.5" y="13" width="5" height="13" rx="2.5" fill="#3b82f6" stroke="#1d4ed8" stroke-width="1" />
    <line x1="14" y1="12" x2="26" y2="12" stroke="#64748b" stroke-width="2" stroke-linecap="round" />
    <circle cx="20" cy="18" r="3" fill="#ffffff" stroke="#1e293b" stroke-width="1.2" />
  </svg>`
};

export function getFleetIconSvg(sector?: string, vehicleClass?: string): string {
  if (sector === 'AMBULANCE_108') return FLEET_SVG_STRINGS.ambulance;
  if (sector === 'POLICE_PATROL') return FLEET_SVG_STRINGS.police;
  if (sector === 'GMC_WASTE') return FLEET_SVG_STRINGS.wasteTruck;
  if (sector === 'PWD_HEAVY') return FLEET_SVG_STRINGS.heavyTruck;
  if (sector === 'HEALTH_VAN') return FLEET_SVG_STRINGS.healthVan;

  if (vehicleClass === 'MOTORCYCLE') return FLEET_SVG_STRINGS.motorcycle;
  if (vehicleClass === 'HEAVY') return FLEET_SVG_STRINGS.heavyTruck;
  if (vehicleClass === 'VAN') return FLEET_SVG_STRINGS.healthVan;
  return FLEET_SVG_STRINGS.sedan;
}

/** Theme colors for status halos */
export const STATUS_GLOW: Record<VehicleStatus, string> = {
  MOVING: '#10b981', // Emerald green
  IDLE: '#f59e0b', // Amber
  BREAKDOWN: '#ef4444', // Danger red
  OFFLINE: '#64748b', // Slate
};

/**
 * Creates a raw MapLibre HTML marker element with rotation, radar beam, halo, icon, and plate.
 */
export function createFleetMarkerElement(
  vehicle: {
    id: string;
    sector?: string;
    vehicleClass?: string;
    status: VehicleStatus;
    heading?: number;
    speedKmph?: number;
    registrationNumber?: string;
  },
  opts: {
    heading?: number;
    isSelected: boolean;
    onClick: () => void;
  }
): HTMLElement {
  const el = document.createElement('div');
  el.className = `fleet-marker${opts.isSelected ? ' fleet-marker--selected' : ''}`;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');

  const statusColor = STATUS_GLOW[vehicle.status] || STATUS_GLOW.OFFLINE;
  const isMoving = vehicle.status === 'MOVING';
  const heading = opts.heading ?? vehicle.heading ?? 0;
  const speed = Math.round(vehicle.speedKmph || 0);
  const reg = vehicle.registrationNumber || 'Vehicle';

  el.innerHTML = `
    <div class="fleet-marker__rotator" style="transform: rotate(${heading}deg);">
      <div class="fleet-marker__radar" style="background: radial-gradient(circle at 50% 100%, ${statusColor}55 0%, transparent 70%); display: ${isMoving ? 'block' : 'none'};"></div>
      <div class="fleet-marker__halo ${isMoving ? 'fleet-marker__halo--pulse' : ''}" style="border-color: ${statusColor}; box-shadow: 0 0 10px ${statusColor}66;"></div>
      <div class="fleet-marker__icon-wrap">
        ${getFleetIconSvg(vehicle.sector, vehicle.vehicleClass)}
      </div>
    </div>
    <div class="fleet-marker__pill">
      <span class="mono fleet-marker__reg">${reg}</span>
      <span class="mono fleet-marker__speed" style="display: ${isMoving && speed > 0 ? 'inline-block' : 'none'};">${speed} km/h</span>
    </div>
  `;

  el.onclick = (e) => {
    e.stopPropagation();
    opts.onClick();
  };

  return el;
}

/**
 * In-place update of an existing MapLibre HTML marker element to avoid DOM re-creation.
 */
export function updateFleetMarkerElement(
  el: HTMLElement,
  vehicle: {
    status: VehicleStatus;
    heading?: number;
    speedKmph?: number;
  },
  opts: {
    heading?: number;
    isSelected: boolean;
  }
): void {
  const isMoving = vehicle.status === 'MOVING';
  const statusColor = STATUS_GLOW[vehicle.status] || STATUS_GLOW.OFFLINE;
  const heading = opts.heading ?? vehicle.heading ?? 0;
  const speed = Math.round(vehicle.speedKmph || 0);

  if (opts.isSelected) {
    el.classList.add('fleet-marker--selected');
  } else {
    el.classList.remove('fleet-marker--selected');
  }

  const rotator = el.querySelector<HTMLElement>('.fleet-marker__rotator');
  if (rotator) {
    rotator.style.transform = `rotate(${heading}deg)`;
  }

  const radar = el.querySelector<HTMLElement>('.fleet-marker__radar');
  if (radar) {
    radar.style.display = isMoving ? 'block' : 'none';
    radar.style.background = `radial-gradient(circle at 50% 100%, ${statusColor}55 0%, transparent 70%)`;
  }

  const halo = el.querySelector<HTMLElement>('.fleet-marker__halo');
  if (halo) {
    halo.className = `fleet-marker__halo ${isMoving ? 'fleet-marker__halo--pulse' : ''}`;
    halo.style.borderColor = statusColor;
    halo.style.boxShadow = `0 0 10px ${statusColor}66`;
  }

  const speedEl = el.querySelector<HTMLElement>('.fleet-marker__speed');
  if (speedEl) {
    speedEl.style.display = isMoving && speed > 0 ? 'inline-block' : 'none';
    speedEl.textContent = `${speed} km/h`;
  }
}

/**
 * Complete Modern Map Vehicle Marker (React Component wrapper).
 */
export function FleetVehicleMarker({
  sector,
  vehicleClass,
  status,
  heading,
  registrationNumber,
  speedKmph,
  selected = false,
  onClick,
}: FleetMarkerProps) {
  const glowColor = STATUS_GLOW[status] || STATUS_GLOW.OFFLINE;
  const isMoving = status === 'MOVING';

  return (
    <div
      className={`fleet-marker ${selected ? 'fleet-marker--selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={`${registrationNumber ?? 'Vehicle'} • ${status} (${speedKmph ?? 0} km/h)`}
    >
      <div
        className="fleet-marker__rotator"
        style={{
          transform: `rotate(${heading}deg)`,
          transition: 'transform 0.35s ease-out',
        }}
      >
        {isMoving && (
          <div
            className="fleet-marker__radar"
            style={{
              background: `radial-gradient(circle at 50% 100%, ${glowColor}55 0%, transparent 70%)`,
            }}
          />
        )}
        <div
          className={`fleet-marker__halo ${isMoving ? 'fleet-marker__halo--pulse' : ''}`}
          style={{
            borderColor: glowColor,
            boxShadow: `0 0 10px ${glowColor}66`,
          }}
        />
        <div className="fleet-marker__icon-wrap">
          {getFleetIcon(sector, vehicleClass)}
        </div>
      </div>
      {(selected || registrationNumber) && (
        <div className="fleet-marker__pill">
          <span className="mono fleet-marker__reg">{registrationNumber}</span>
          {speedKmph != null && isMoving && (
            <span className="mono fleet-marker__speed">{speedKmph} km/h</span>
          )}
        </div>
      )}
    </div>
  );
}
