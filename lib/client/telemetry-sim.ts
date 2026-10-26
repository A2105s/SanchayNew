'use client';

/**
 * Natural Fleet Swarm Telemetry Simulator.
 *
 * Implements realistic A ⇄ B ⇄ A continuous road-network looping from Roads.kml:
 * - Selects authentic Gwalior arterial corridors connecting distant hubs and stations.
 * - Distance-based kinematic motion integration (arc-length parameterization).
 * - Curvature-aware braking: slows down when approaching sharp turns and accelerates out.
 * - Realistic station dwell: parks for 4-8s at terminal A and B before reversing.
 * - Sector-tailored speed curves (Ambulance, Police, Sanitation, PWD Heavy, Health).
 * - Exact spherical trigonometry compass bearing in radians.
 * - Exports active route geometry and breadcrumb trail for modern Zomato-style trace lines.
 */

import type { LiveDelta, VehicleView, DeviceView } from '@/types';

export type LatLng = [number, number];

export interface RouteCorridor {
  id: string;
  name: string;
  sectorHint?: string;
  from: { id: string; name: string; lat: number; lng: number };
  to: { id: string; name: string; lat: number; lng: number };
  distanceMeters: number;
  waypointsCount: number;
  coordinates: LatLng[]; // [lat, lng]
  cumDist: number[]; // meters along path
}

export interface VehicleSimState {
  vehicleId: string;
  routeId: string;
  routeName: string;
  fromName: string;
  toName: string;
  direction: 1 | -1; // 1: A -> B, -1: B -> A
  currentDist: number; // meters along route
  totalDist: number;
  speedKmph: number;
  targetSpeedKmph: number;
  status: 'MOVING' | 'IDLE';
  dwellRemaining: number; // in seconds when parked at terminal A or B
  lastTickTime: number;
  heading: number;
  recentTrail: [number, number][]; // [lng, lat] for MapLibre
  activeRouteRemaining: [number, number][]; // [lng, lat] for MapLibre
}

let corridorsPromise: Promise<RouteCorridor[]> | null = null;
let corridors: RouteCorridor[] | null = null;

const simStates = new Map<string, VehicleSimState>();

/** Lazily load the pre-computed Gwalior arterial corridors from Roads.kml */
export function loadRoads(): Promise<RouteCorridor[]> {
  if (corridors && corridors.length > 0) return Promise.resolve(corridors);
  if (corridorsPromise) return corridorsPromise;

  corridorsPromise = fetch('/data/gwalior-routes.json', { cache: 'force-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<RouteCorridor[]>) : []))
    .then((data) => {
      corridors = Array.isArray(data) && data.length > 0 ? data : [];
      return corridors;
    })
    .catch(() => {
      corridors = [];
      return corridors;
    });

  return corridorsPromise;
}

/** Hash utility for deterministic route and parameter assignment */
function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Accurate compass bearing using spherical trigonometry in radians */
export function headingBetween(a: LatLng, b: LatLng): number {
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/** Great-circle distance between two coordinates in meters */
export function distanceBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Realistic speed profiles by vehicle sector and class */
function getSectorSpeed(sector?: string, vehicleClass?: string): { target: number; accel: number } {
  switch (sector) {
    case 'AMBULANCE_108':
      return { target: 58, accel: 3.2 }; // Priority emergency
    case 'POLICE_PATROL':
      return { target: 46, accel: 2.4 }; // Rapid city patrol
    case 'GMC_WASTE':
      return { target: 26, accel: 1.2 }; // Heavy sanitation compactor
    case 'PWD_HEAVY':
      return { target: 28, accel: 1.4 }; // Heavy dump truck
    case 'HEALTH_VAN':
      return { target: 36, accel: 1.6 }; // Medical transport van
    case 'ELECTION_REQUISITION':
      return { target: 42, accel: 1.8 }; // Administrative fleet
    default:
      if (vehicleClass === 'HEAVY') return { target: 28, accel: 1.3 };
      if (vehicleClass === 'VAN') return { target: 36, accel: 1.6 };
      return { target: 42, accel: 1.8 };
  }
}

/** Is this vehicle driven by the simulator? */
export function isSimulated(vehicle: VehicleView, devices: DeviceView[]): boolean {
  if (vehicle.gpsSource === 'SIMULATED') return true;
  return devices.some(
    (d) => d.vehicleId === vehicle.id && d.simulated && d.kind === 'GPS_TRACKER'
  );
}

/** Evenly distribute all fleet vehicles across the entire arterial road network */
function chooseRoute(vehicle: VehicleView, routeList: RouteCorridor[]): RouteCorridor {
  const idx = hashString(vehicle.id + (vehicle.registrationNumber || '')) % routeList.length;
  return routeList[idx]!;
}

/** Produce the next LiveDelta for a simulated vehicle along its A ⇄ B ⇄ A route */
export function tickVehicle(
  vehicle: VehicleView,
  routeData: RouteCorridor[] | null,
  nowMs: number = Date.now()
): LiveDelta | null {
  if (!routeData || routeData.length === 0) return null;

  let sim = simStates.get(vehicle.id);
  const route = sim
    ? routeData.find((r) => r.id === sim!.routeId) || routeData[0]!
    : chooseRoute(vehicle, routeData);

  const coords = route.coordinates;
  const cumDist = route.cumDist;
  const totalDist = route.distanceMeters;

  const { target: baseTargetSpeed, accel } = getSectorSpeed(vehicle.sector, vehicle.vehicleClass);
  const targetSpeed = baseTargetSpeed + ((hashString(vehicle.id) % 9) - 4); // +/- 4 km/h natural variance

  if (!sim) {
    const seed = hashString(vehicle.id + (vehicle.registrationNumber || ''));
    // Stagger vehicle along the road corridor uniformly (5% to 95%) so vehicles are dispersed evenly
    const progressFrac = 0.05 + (((seed * 7919 + 1013904223) >>> 0) % 1000) / 1000 * 0.90;
    const initialDist = progressFrac * totalDist;
    const direction: 1 | -1 = seed % 2 === 0 ? 1 : -1;

    sim = {
      vehicleId: vehicle.id,
      routeId: route.id,
      routeName: route.name,
      fromName: route.from.name,
      toName: route.to.name,
      direction,
      currentDist: initialDist,
      totalDist,
      speedKmph: Math.max(15, targetSpeed * 0.75),
      targetSpeedKmph: targetSpeed,
      status: 'MOVING',
      dwellRemaining: 0,
      lastTickTime: nowMs,
      heading: 0,
      recentTrail: [],
      activeRouteRemaining: [],
    };
    simStates.set(vehicle.id, sim);
  }

  const dtSec = Math.min(6, Math.max(1, (nowMs - sim.lastTickTime) / 1000));
  sim.lastTickTime = nowMs;

  // 1. Handle Station Dwell (parked at terminal A or B)
  if (sim.dwellRemaining > 0) {
    sim.dwellRemaining -= dtSec;
    sim.status = 'IDLE';
    sim.speedKmph = 0;

    // Terminal coordinate
    const termIdx = sim.direction === 1 ? coords.length - 1 : 0;
    const termCoord = coords[termIdx]!;
    return {
      vehicleId: vehicle.id,
      lat: termCoord[0],
      lng: termCoord[1],
      speedKmph: 0,
      heading: sim.heading,
      ignition: true,
      status: 'IDLE',
      fuelPercent: vehicle.fuelPercent,
      lastSeenAt: new Date(nowMs).toISOString(),
      simulated: true,
    };
  }

  // 2. If finished dwelling, reverse direction and resume motion
  if (sim.status === 'IDLE' && sim.dwellRemaining <= 0) {
    sim.direction = sim.direction === 1 ? -1 : 1;
    sim.status = 'MOVING';
    sim.speedKmph = 14; // Initial takeoff speed
  }

  // 3. Find current position along arc-length
  let segIdx = 0;
  for (let i = 0; i < cumDist.length - 1; i++) {
    if (sim.currentDist >= cumDist[i]! && sim.currentDist <= cumDist[i + 1]!) {
      segIdx = i;
      break;
    }
  }

  // 4. Curvature-aware speed adjustment
  // Check upcoming bend in the next 40m
  let corneringSpeed = targetSpeed;
  const lookaheadIdx = Math.min(coords.length - 1, segIdx + (sim.direction === 1 ? 2 : -2));
  if (lookaheadIdx >= 0 && lookaheadIdx < coords.length) {
    const p1 = coords[segIdx]!;
    const p2 = coords[Math.min(coords.length - 1, Math.max(0, segIdx + sim.direction))]!;
    const p3 = coords[lookaheadIdx]!;
    const b1 = headingBetween(p1, p2);
    const b2 = headingBetween(p2, p3);
    const angleDiff = Math.abs((((b2 - b1 + 180) % 360) + 360) % 360 - 180);
    if (angleDiff > 30) {
      corneringSpeed = Math.min(22, targetSpeed * 0.55); // Slow down into sharp curve
    }
  }

  // Kinematic acceleration/deceleration
  if (sim.speedKmph < corneringSpeed) {
    sim.speedKmph = Math.min(corneringSpeed, sim.speedKmph + accel * dtSec * 3.6);
  } else if (sim.speedKmph > corneringSpeed) {
    sim.speedKmph = Math.max(corneringSpeed, sim.speedKmph - accel * 1.5 * dtSec * 3.6);
  }

  // 5. Advance distance along polyline
  const stepMeters = (sim.speedKmph / 3.6) * dtSec;
  sim.currentDist += sim.direction * stepMeters;

  // 6. Arrival at destination A or B: trigger dwell
  if (sim.currentDist >= totalDist) {
    sim.currentDist = totalDist;
    sim.status = 'IDLE';
    sim.dwellRemaining = 5 + (hashString(vehicle.id) % 4); // 5-8s stop
    sim.speedKmph = 0;
  } else if (sim.currentDist <= 0) {
    sim.currentDist = 0;
    sim.status = 'IDLE';
    sim.dwellRemaining = 5 + (hashString(vehicle.id) % 4);
    sim.speedKmph = 0;
  }

  // 7. Interpolate exact [lat, lng] between waypoints
  let curLat = coords[segIdx]![0];
  let curLng = coords[segIdx]![1];
  const nextSegIdx = Math.min(coords.length - 1, segIdx + 1);
  const segStartD = cumDist[segIdx]!;
  const segEndD = cumDist[nextSegIdx]!;
  const segLen = Math.max(0.001, segEndD - segStartD);

  const frac = Math.max(0, Math.min(1, (sim.currentDist - segStartD) / segLen));
  curLat = coords[segIdx]![0] + frac * (coords[nextSegIdx]![0] - coords[segIdx]![0]);
  curLng = coords[segIdx]![1] + frac * (coords[nextSegIdx]![1] - coords[segIdx]![1]);

  // 8. Accurate bearing calculation
  const pA = coords[segIdx]!;
  const pB = coords[nextSegIdx]!;
  const forwardBearing = headingBetween(pA, pB);
  sim.heading = sim.direction === 1 ? forwardBearing : (forwardBearing + 180) % 360;

  // 9. Trail & active route tracking
  const currentLngLat: [number, number] = [curLng, curLat];
  if (
    sim.recentTrail.length === 0 ||
    distanceBetween([curLat, curLng], [sim.recentTrail[sim.recentTrail.length - 1]![1], sim.recentTrail[sim.recentTrail.length - 1]![0]]) > 12
  ) {
    sim.recentTrail.push(currentLngLat);
    if (sim.recentTrail.length > 25) sim.recentTrail.shift();
  }

  // Active route remaining to destination
  const remaining: [number, number][] = [currentLngLat];
  if (sim.direction === 1) {
    for (let k = nextSegIdx; k < coords.length; k++) {
      remaining.push([coords[k]![1], coords[k]![0]]);
    }
  } else {
    for (let k = segIdx; k >= 0; k--) {
      remaining.push([coords[k]![1], coords[k]![0]]);
    }
  }
  sim.activeRouteRemaining = remaining;

  return {
    vehicleId: vehicle.id,
    lat: curLat,
    lng: curLng,
    speedKmph: Math.round(sim.speedKmph),
    heading: Math.round(sim.heading),
    ignition: true,
    status: sim.status,
    fuelPercent: vehicle.fuelPercent,
    lastSeenAt: new Date(nowMs).toISOString(),
    simulated: true,
  };
}

/** Compute simulated deltas for all eligible vehicles in one tick */
export function simulateTick(
  vehicles: VehicleView[],
  devices: DeviceView[],
  routes: RouteCorridor[] | null
): LiveDelta[] {
  const out: LiveDelta[] = [];
  const now = Date.now();
  for (const vehicle of vehicles) {
    if (!isSimulated(vehicle, devices)) continue;
    const delta = tickVehicle(vehicle, routes, now);
    if (delta) out.push(delta);
  }
  return out;
}

/** Query the active simulation state (active route, trail, destination) for a vehicle */
export function getVehicleSimState(vehicleId: string): VehicleSimState | undefined {
  return simStates.get(vehicleId);
}

/** Reset sim state (e.g. on snapshot reload) */
export function resetSimulator(): void {
  simStates.clear();
}
