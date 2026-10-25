'use client';

/**
 * Client-side telemetry SIMULATOR (placeholder for real AIS-140 / IoT ingest).
 *
 * For vehicles whose GPS is SIMULATED (vehicle.gpsSource === 'SIMULATED' or a bound
 * simulated GPS device) and whose status is MOVING, this produces LiveDelta updates
 * every tick, walking the asset along a road polyline fetched from
 * /data/gwalior-roads.json. If roads are unavailable it falls back to a small
 * circular drift around the asset's last position.
 *
 * Real deltas from /api/cloud/telemetry always override simulated ones (handled in
 * FleetProvider merge logic).
 */

import type { LiveDelta, VehicleView, DeviceView } from '@/types';

type LatLng = [number, number];

let roadsPromise: Promise<LatLng[][]> | null = null;
let roads: LatLng[][] | null = null;

/** Lazily fetch the road network once (after first idle). */
export function loadRoads(): Promise<LatLng[][]> {
  if (roads) return Promise.resolve(roads);
  if (roadsPromise) return roadsPromise;
  roadsPromise = fetch('/data/gwalior-roads.json', { cache: 'force-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<LatLng[][]>) : []))
    .then((data) => {
      roads = Array.isArray(data) ? data : [];
      return roads;
    })
    .catch(() => {
      roads = [];
      return roads;
    });
  return roadsPromise;
}

interface SimState {
  roadIndex: number;
  pointIndex: number;
  phase: number; // for circular drift fallback
  baseLat: number;
  baseLng: number;
}

const state = new Map<string, SimState>();

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function headingBetween(a: LatLng, b: LatLng): number {
  const dLng = b[1] - a[1];
  const y = Math.sin(dLng) * Math.cos(b[0]);
  const x = Math.cos(a[0]) * Math.sin(b[0]) - Math.sin(a[0]) * Math.cos(b[0]) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/** Is this vehicle driven by the simulator? */
export function isSimulated(vehicle: VehicleView, devices: DeviceView[]): boolean {
  if (vehicle.gpsSource === 'SIMULATED') return true;
  return devices.some(
    (d) => d.vehicleId === vehicle.id && d.simulated && d.kind === 'GPS_TRACKER'
  );
}

/** Produce the next LiveDelta for a simulated, moving vehicle. */
export function tickVehicle(vehicle: VehicleView, roadData: LatLng[][] | null): LiveDelta | null {
  if (vehicle.status !== 'MOVING') return null;

  let sim = state.get(vehicle.id);
  if (!sim) {
    const seed = hashString(vehicle.id);
    const roadIndex = roadData && roadData.length ? seed % roadData.length : 0;
    sim = {
      roadIndex,
      pointIndex: roadData && roadData[roadIndex] ? seed % roadData[roadIndex]!.length : 0,
      phase: (seed % 360) * (Math.PI / 180),
      baseLat: vehicle.lat ?? 26.2183,
      baseLng: vehicle.lng ?? 78.1828
    };
    state.set(vehicle.id, sim);
  }

  const road = roadData && roadData.length ? roadData[sim.roadIndex] : undefined;

  if (road && road.length > 1) {
    const from = road[sim.pointIndex % road.length]!;
    sim.pointIndex = (sim.pointIndex + 1) % road.length;
    const to = road[sim.pointIndex]!;
    const heading = headingBetween(from, to);
    return {
      vehicleId: vehicle.id,
      lat: to[0],
      lng: to[1],
      speedKmph: 18 + (hashString(vehicle.id + sim.pointIndex) % 34),
      heading: Math.round(heading),
      ignition: true,
      status: 'MOVING',
      fuelPercent: vehicle.fuelPercent,
      lastSeenAt: new Date().toISOString(),
      simulated: true
    };
  }

  // Fallback: small circular drift around the last known position.
  sim.phase += 0.12;
  const radius = 0.0016;
  const lat = sim.baseLat + radius * Math.sin(sim.phase);
  const lng = sim.baseLng + radius * Math.cos(sim.phase);
  return {
    vehicleId: vehicle.id,
    lat,
    lng,
    speedKmph: 20 + Math.round(10 * Math.abs(Math.sin(sim.phase))),
    heading: Math.round(((sim.phase * 180) / Math.PI) % 360),
    ignition: true,
    status: 'MOVING',
    fuelPercent: vehicle.fuelPercent,
    lastSeenAt: new Date().toISOString(),
    simulated: true
  };
}

/** Compute simulated deltas for all eligible vehicles in one tick. */
export function simulateTick(
  vehicles: VehicleView[],
  devices: DeviceView[],
  roadData: LatLng[][] | null
): LiveDelta[] {
  const out: LiveDelta[] = [];
  for (const vehicle of vehicles) {
    if (!isSimulated(vehicle, devices)) continue;
    const delta = tickVehicle(vehicle, roadData);
    if (delta) out.push(delta);
  }
  return out;
}

/** Reset sim state (e.g. on snapshot reload). */
export function resetSimulator(): void {
  state.clear();
}
