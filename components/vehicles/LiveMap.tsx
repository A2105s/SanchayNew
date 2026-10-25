'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Layers,
  Maximize2,
  Minimize2,
  Radio,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatusDot } from '@/components/ui/StatusDot';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFleet } from '@/lib/client/useFleet';
import { loadMapLibre } from '@/lib/client/maplibre';
import { baseStyle, MAP_FONT_STACK } from '@/lib/client/map-config';
import { SECTOR_LABEL, STATUS_LABEL } from '@/lib/fleet/format';
import { StatusBadge } from '@/components/vehicles/shared';
import { worstCompliance } from '@/components/vehicles/shared';
import { OperationalBadge, EligibilityBadge } from '@/components/ui/StatusBadges';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import type { Sector, VehicleStatus, VehicleView } from '@/types';

const GWALIOR_CENTER: [number, number] = [78.1828, 26.2183];
const GWALIOR_ZOOM = 11.5;

const STATUS_COLORS: Record<VehicleStatus, string> = {
  MOVING: '#16a34a',
  IDLE: '#d97706',
  BREAKDOWN: '#dc2626',
  OFFLINE: '#64748b',
};


type MlNs = typeof import('maplibre-gl');
// Loosely typed to avoid friction with the maplibre runtime types.
type MlMap = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function vehicleFeatures(vehicles: VehicleView[]) {
  return {
    type: 'FeatureCollection' as const,
    features: vehicles
      .filter((v) => v.lat != null && v.lng != null)
      .map((v) => ({
        type: 'Feature' as const,
        properties: {
          id: v.id,
          status: v.status,
          color: STATUS_COLORS[v.status],
          reg: v.registrationNumber,
          stale: v.telemetryFreshness !== 'FRESH' ? 1 : 0
        },
        geometry: { type: 'Point' as const, coordinates: [v.lng as number, v.lat as number] },
      })),
  };
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...(Object.keys(STATUS_LABEL) as VehicleStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] })),
];
const SECTOR_OPTIONS = [
  { value: '', label: 'All sectors' },
  ...(Object.keys(SECTOR_LABEL) as Sector[]).map((s) => ({ value: s, label: SECTOR_LABEL[s] })),
];

export function LiveMap() {
  const fleet = useFleet();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<MlNs | null>(null);
  const stationMarkersRef = useRef<Array<{ remove: () => void }>>([]);
  const incidentMarkersRef = useRef<Array<{ remove: () => void }>>([]);
  const trailRef = useRef<Record<string, [number, number][]>>({});
  const readyRef = useRef(false);
  const latestVehiclesRef = useRef<VehicleView[]>([]);

  const [failed, setFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showVehicles, setShowVehicles] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);

  const liveVehicles = fleet.liveVehicles;
  useEffect(() => {
    latestVehiclesRef.current = liveVehicles;
  }, [liveVehicles]);
  const stations = fleet.snapshot?.stations ?? [];
  const openIncidents = (fleet.snapshot?.incidents ?? []).filter((i) => i.status !== 'RESOLVED');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return liveVehicles.filter((v) => {
      if (statusFilter && v.status !== statusFilter) return false;
      if (sectorFilter && v.sector !== sectorFilter) return false;
      if (q && !(`${v.registrationNumber} ${v.displayName}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [liveVehicles, search, statusFilter, sectorFilter]);

  const selected = selectedId ? liveVehicles.find((v) => v.id === selectedId) ?? null : null;

  const simCount = useMemo(() => Object.values(fleet.live).filter((d) => d.simulated).length, [fleet.live]);
  const realCount = useMemo(() => Object.values(fleet.live).filter((d) => !d.simulated).length, [fleet.live]);

  // ---- Initialise the map once ----
  useEffect(() => {
    let cancelled = false;
    let themeObserver: MutationObserver | null = null;
    (async () => {
      try {
        const maplibregl = await loadMapLibre();
        if (cancelled || !containerRef.current) return;
        mlRef.current = maplibregl;
        const dark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
        const map: MlMap = new maplibregl.Map({
          container: containerRef.current,
          style: baseStyle(dark),
          center: GWALIOR_CENTER,
          zoom: GWALIOR_ZOOM,
          attributionControl: false,
        });
        mapRef.current = map;
        map.on('error', (e: { error?: Error }) => console.warn('[live-map]', e.error?.message ?? e));

        let interactionsBound = false;
        // Runs on first style load AND after every theme-driven style swap (a new style drops custom sources/layers).
        const initLayers = () => {
          if (cancelled || map.getSource('vehicles')) return;
          // vehicles source (clustered)
          map.addSource('vehicles', {
            type: 'geojson',
            data: vehicleFeatures(latestVehiclesRef.current),
            cluster: true,
            clusterRadius: 45,
            clusterMaxZoom: 13,
          });
          map.addLayer({
            id: 'veh-clusters',
            type: 'circle',
            source: 'vehicles',
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': '#2f6fed',
              'circle-opacity': 0.85,
              'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 30],
            },
          });
          map.addLayer({
            id: 'veh-cluster-count',
            type: 'symbol',
            source: 'vehicles',
            filter: ['has', 'point_count'],
            layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': [MAP_FONT_STACK], 'text-size': 12 },
            paint: { 'text-color': '#ffffff' },
          });
          map.addLayer({
            id: 'veh-points',
            type: 'circle',
            source: 'vehicles',
            filter: ['!', ['has', 'point_count']],
            paint: {
              // Stale telemetry renders hollow/dimmed; fresh renders solid.
              'circle-color': ['case', ['==', ['get', 'stale'], 1], 'rgba(255,255,255,0.15)', ['get', 'color']],
              'circle-opacity': ['case', ['==', ['get', 'stale'], 1], 0.55, 1],
              'circle-radius': 7,
              'circle-stroke-width': ['case', ['==', ['get', 'stale'], 1], 2.5, 2],
              'circle-stroke-color': ['case', ['==', ['get', 'stale'], 1], ['get', 'color'], '#ffffff'],
            },
          });
          // trail source
          map.addSource('trail', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } });
          map.addLayer({ id: 'trail-line', type: 'line', source: 'trail', paint: { 'line-color': '#2f6fed', 'line-width': 3, 'line-opacity': 0.7 } });

          // interactions (bound once; layer-scoped listeners survive style swaps)
          if (!interactionsBound) {
            interactionsBound = true;
            map.on('click', 'veh-points', (e: { features?: Array<{ properties?: { id?: string } }> }) => {
              const id = e.features?.[0]?.properties?.id;
              if (id) setSelectedId(id);
            });
            map.on('click', 'veh-clusters', (e: { point: unknown }) => {
              const features = map.queryRenderedFeatures(e.point, { layers: ['veh-clusters'] });
              const clusterId = features[0]?.properties?.cluster_id;
              const src = map.getSource('vehicles');
              if (clusterId != null && src?.getClusterExpansionZoom) {
                src.getClusterExpansionZoom(clusterId).then((zoom: number) => {
                  map.easeTo({ center: features[0].geometry.coordinates, zoom });
                });
              }
            });
            const setPointer = (v: boolean) => () => { map.getCanvas().style.cursor = v ? 'pointer' : ''; };
            map.on('mouseenter', 'veh-points', setPointer(true));
            map.on('mouseleave', 'veh-points', setPointer(false));
            map.on('mouseenter', 'veh-clusters', setPointer(true));
            map.on('mouseleave', 'veh-clusters', setPointer(false));
          }

          readyRef.current = true;
          setMapReady(true);
        };
        map.on('style.load', initLayers);

        // Follow the app theme (EasyLife toggles data-theme on <html>): swap the basemap style, layers are re-added in initLayers.
        let lastDark = dark;
        themeObserver = new MutationObserver(() => {
          const nowDark = document.documentElement.getAttribute('data-theme') === 'dark';
          if (nowDark === lastDark) return;
          lastDark = nowDark;
          readyRef.current = false;
          map.setStyle(baseStyle(nowDark));
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      themeObserver?.disconnect();
      readyRef.current = false;
      stationMarkersRef.current.forEach((m) => m.remove());
      incidentMarkersRef.current.forEach((m) => m.remove());
      try {
        mapRef.current?.remove();
      } catch {
        /* noop */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Update vehicle GeoJSON source when live data changes (no map recreation) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource('vehicles');
    if (src?.setData) src.setData(vehicleFeatures(showVehicles ? liveVehicles : []));
  }, [liveVehicles, showVehicles, mapReady]);

  // ---- Toggle vehicle layer visibility ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const vis = showVehicles ? 'visible' : 'none';
    for (const id of ['veh-clusters', 'veh-cluster-count', 'veh-points']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    }
  }, [showVehicles, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (map.getLayer('trail-line')) map.setLayoutProperty('trail-line', 'visibility', showTrail ? 'visible' : 'none');
  }, [showTrail, mapReady]);

  // ---- Station markers (sized by fleet count) ----
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || !readyRef.current) return;
    stationMarkersRef.current.forEach((m) => m.remove());
    stationMarkersRef.current = [];
    if (!showStations) return;
    for (const s of stations) {
      const count = Object.values(s.inventory ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      const size = Math.max(22, Math.min(44, 20 + count));
      const el = document.createElement('div');
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:8px;background:#1e293b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer`;
      el.textContent = String(count);
      el.title = `${s.name} — ${count} vehicles`;
      const marker = new ml.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map);
      stationMarkersRef.current.push(marker);
    }
  }, [stations, showStations, mapReady]);

  // ---- Pulsing open-incident markers ----
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || !readyRef.current) return;
    incidentMarkersRef.current.forEach((m) => m.remove());
    incidentMarkersRef.current = [];
    for (const inc of openIncidents) {
      if (inc.lat == null || inc.lng == null) continue;
      const el = document.createElement('div');
      el.className = 'veh-pulse-dot';
      el.title = `${inc.type}: ${inc.message}`;
      const marker = new ml.Marker({ element: el }).setLngLat([inc.lng, inc.lat]).addTo(map);
      incidentMarkersRef.current.push(marker);
    }
  }, [openIncidents, mapReady]);

  // ---- Maintain + render trail for selected vehicle ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (!selectedId) {
      const src = map.getSource('trail');
      if (src?.setData) src.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } });
      return;
    }
    const v = liveVehicles.find((x) => x.id === selectedId);
    if (v?.lat != null && v?.lng != null) {
      const arr = trailRef.current[selectedId] ?? [];
      const last = arr[arr.length - 1];
      const point: [number, number] = [v.lng, v.lat];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) {
        arr.push(point);
        if (arr.length > 20) arr.shift();
        trailRef.current[selectedId] = arr;
      }
      const src = map.getSource('trail');
      if (src?.setData) src.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trailRef.current[selectedId] ?? [] } });
    }
  }, [selectedId, liveVehicles]);

  // ---- Resize on fullscreen toggle ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const t = setTimeout(() => map.resize(), 120);
    return () => clearTimeout(t);
  }, [fullscreen, panelCollapsed]);

  const flyTo = useCallback((v: VehicleView) => {
    setSelectedId(v.id);
    const map = mapRef.current;
    if (map && v.lat != null && v.lng != null) {
      map.flyTo({ center: [v.lng, v.lat], zoom: Math.max(map.getZoom(), 14), duration: 800 });
    }
  }, []);

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 13, duration: 800 });
    });
  }, []);

  if (failed) {
    return (
      <div className="veh-map-page">
        <div className="veh-map-fallback">
          <EmptyState
            icon={<AlertTriangle size={28} />}
            title="Map could not be loaded"
            description="The map tiles are unavailable (you may be offline). The vehicle list below still works."
            action={
              <div className="veh-map-panel" style={{ position: 'static', width: '100%', maxWidth: 480 }}>
                <div className="veh-map-panel-body">
                  <VehicleList vehicles={filtered} selectedId={selectedId} onSelect={(v) => setSelectedId(v.id)} />
                </div>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`veh-map-page${fullscreen ? ' veh-map-page--fullscreen' : ''}`}>
      <div ref={containerRef} className="veh-map-canvas" aria-label="Live operations map" />

      {/* Live indicator */}
      <div className="veh-map-live">
        <StatusDot tone="success" pulse />
        <Radio size={14} />
        <span><strong>{realCount}</strong> live · <strong>{simCount}</strong> simulated · {liveVehicles.length} total</span>
      </div>

      {/* Left panel */}
      <div className={`veh-map-panel${panelCollapsed ? ' veh-map-panel--collapsed' : ''}`}>
        <div className="veh-map-panel-head">
          {!panelCollapsed ? <strong>Fleet ({filtered.length})</strong> : null}
          <button className="veh-map-ctrl-btn" style={{ width: 30, height: 30 }} onClick={() => setPanelCollapsed((v) => !v)} aria-label={panelCollapsed ? 'Expand panel' : 'Collapse panel'}>
            {panelCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        {!panelCollapsed ? (
          <div className="veh-map-panel-body">
            <SearchField value={search} onChange={setSearch} placeholder="Search registration…" ariaLabel="Search vehicles" />
            <div className="cluster" style={{ gap: '0.4rem' }}>
              <Select value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} ariaLabel="Filter by status" />
              <Select value={sectorFilter} onChange={setSectorFilter} options={SECTOR_OPTIONS} ariaLabel="Filter by sector" />
            </div>
            {filtered.length === 0 ? (
              <EmptyState title="No vehicles match" description="Adjust the search or filters." />
            ) : (
              <VehicleList vehicles={filtered} selectedId={selectedId} onSelect={flyTo} />
            )}
          </div>
        ) : null}
      </div>

      {/* Right detail card */}
      {selected ? (
        <div className="veh-map-detail">
          <div className="cluster" style={{ justifyContent: 'space-between' }}>
            <span className="mono" style={{ fontWeight: 700 }}>{selected.registrationNumber}</span>
            <button className="veh-map-ctrl-btn" style={{ width: 28, height: 28 }} onClick={() => setSelectedId(null)} aria-label="Close detail">
              <X size={15} />
            </button>
          </div>
          <div className="cluster" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
            <StatusBadge status={selected.status} pulse />
            <OperationalBadge status={selected.operationalStatus} />
            <EligibilityBadge state={selected.eligibilityState} />
          </div>
          <FreshnessBadge freshness={selected.telemetryFreshness} lastSeenAt={selected.lastSeenAt} />
          {selected.telemetryFreshness !== 'FRESH' ? (
            <p className="text-muted" style={{ fontSize: '0.75rem', margin: 0 }}>
              Last position may be stale. This does not mean the vehicle is inactive or unavailable.
            </p>
          ) : null}
          <div className="kv" style={{ fontSize: '0.82rem' }}>
            <span>Sector</span>
            <span>{SECTOR_LABEL[selected.sector]}</span>
            <span>Speed</span>
            <span>{Math.round(selected.speedKmph)} km/h</span>
            <span>Driver</span>
            <span>{selected.driverName ?? '—'}</span>
            <span>Compliance</span>
            <span>{complianceLabel(selected, fleet.snapshot?.settings)}</span>
          </div>
          <div className="cluster" style={{ gap: '0.4rem' }}>
            <ButtonLink href={`/vehicles/${selected.id}`} variant="primary" size="sm">Open passport</ButtonLink>
            <ButtonLink href={`/vehicles/${selected.id}`} variant="secondary" size="sm">Report incident</ButtonLink>
          </div>
        </div>
      ) : null}

      {/* Controls */}
      <div className="veh-map-controls">
        <button className="veh-map-ctrl-btn" onClick={() => setFullscreen((v) => !v)} aria-label="Toggle fullscreen">
          {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <button className="veh-map-ctrl-btn" onClick={locateMe} aria-label="Locate me">
          <Crosshair size={18} />
        </button>
        <div style={{ position: 'relative' }}>
          <button className="veh-map-ctrl-btn" onClick={() => setLayersOpen((v) => !v)} aria-label="Layers" aria-expanded={layersOpen}>
            <Layers size={18} />
          </button>
          {layersOpen ? (
            <div className="veh-actions-pop" style={{ right: 0, bottom: 'calc(100% + 4px)', top: 'auto' }}>
              <label className="cluster" style={{ gap: '0.5rem', padding: '0.4rem 0.6rem' }}>
                <input type="checkbox" checked={showVehicles} onChange={(e) => setShowVehicles(e.target.checked)} /> Vehicles
              </label>
              <label className="cluster" style={{ gap: '0.5rem', padding: '0.4rem 0.6rem' }}>
                <input type="checkbox" checked={showStations} onChange={(e) => setShowStations(e.target.checked)} /> Stations
              </label>
              <label className="cluster" style={{ gap: '0.5rem', padding: '0.4rem 0.6rem' }}>
                <input type="checkbox" checked={showTrail} onChange={(e) => setShowTrail(e.target.checked)} /> Trail
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {/* Legend */}
      <div className="veh-map-legend">
        {(Object.keys(STATUS_COLORS) as VehicleStatus[]).map((s) => (
          <div key={s} className="veh-legend-row">
            <span className="veh-legend-dot" style={{ background: STATUS_COLORS[s] }} />
            {STATUS_LABEL[s]}
          </div>
        ))}
        <div className="veh-legend-row">
          <span className="veh-pulse-dot" style={{ width: 10, height: 10 }} /> Open incident
        </div>
        <div className="veh-legend-row">
          <span className="veh-legend-dot" style={{ background: 'transparent', border: '2px solid #64748b' }} /> Stale telemetry (hollow)
        </div>
      </div>
    </div>
  );
}

function complianceLabel(v: VehicleView, settings?: import('@/types').FleetSettings): string {
  const state = worstCompliance(v, settings);
  switch (state) {
    case 'ok':
      return 'Compliant';
    case 'expiring':
      return 'Expiring soon';
    case 'expired':
      return 'Expired';
    default:
      return 'No records';
  }
}

function VehicleList({
  vehicles,
  selectedId,
  onSelect,
}: {
  vehicles: VehicleView[];
  selectedId: string | null;
  onSelect: (v: VehicleView) => void;
}) {
  return (
    <div className="veh-map-list" role="list">
      {vehicles.map((v) => (
        <button
          key={v.id}
          type="button"
          role="listitem"
          className={`veh-map-list-item${v.id === selectedId ? ' veh-map-list-item--active' : ''}`}
          onClick={() => onSelect(v)}
        >
          <span className="veh-legend-dot" style={{ background: STATUS_COLORS[v.status] }} />
          <span className="stack" style={{ gap: 0, flex: 1, alignItems: 'flex-start' }}>
            <span className="mono" style={{ fontWeight: 600, fontSize: '0.82rem' }}>{v.registrationNumber}</span>
            <span className="text-muted" style={{ fontSize: '0.72rem' }}>{SECTOR_LABEL[v.sector]} · {STATUS_LABEL[v.status]}</span>
          </span>
          <span className="text-muted" style={{ fontSize: '0.72rem' }}>{Math.round(v.speedKmph)} km/h</span>
        </button>
      ))}
    </div>
  );
}
