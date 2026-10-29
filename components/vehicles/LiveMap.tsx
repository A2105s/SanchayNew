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
import { ButtonLink } from '@/components/ui/Button';
import { StatusDot } from '@/components/ui/StatusDot';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFleet } from '@/lib/client/useFleet';
import { loadMapLibre } from '@/lib/client/maplibre';
import { baseStyle } from '@/lib/client/map-config';
import { SECTOR_LABEL, STATUS_LABEL } from '@/lib/fleet/format';
import { StatusBadge, worstCompliance } from '@/components/vehicles/shared';
import { OperationalBadge, EligibilityBadge } from '@/components/ui/StatusBadges';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import {
  createFleetMarkerElement,
  updateFleetMarkerElement,
  STATUS_GLOW,
} from '@/components/vehicles/FleetIcons';
import { distanceBetween, getVehicleSimState } from '@/lib/client/telemetry-sim';
import type { Sector, VehicleStatus, VehicleView } from '@/types';

const GWALIOR_CENTER: [number, number] = [78.1828, 26.2183];
const GWALIOR_ZOOM = 12;

const STATUS_COLORS: Record<VehicleStatus, string> = {
  MOVING: '#16a34a',
  IDLE: '#d97706',
  BREAKDOWN: '#dc2626',
  OFFLINE: '#64748b',
};

type MlNs = typeof import('maplibre-gl');
type MlMap = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...(Object.keys(STATUS_LABEL) as VehicleStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] })),
];
const SECTOR_OPTIONS = [
  { value: '', label: 'All sectors' },
  ...(Object.keys(SECTOR_LABEL) as Sector[]).map((s) => ({ value: s, label: SECTOR_LABEL[s] })),
];

function enhanceLightBasemap(map: any) {
  try {
    if (map.getLayer('background')) {
      map.setPaintProperty('background', 'background-color', '#f8fafc');
    }
    if (map.getLayer('landcover')) {
      map.setPaintProperty('landcover', 'fill-color', '#d8ebd9');
      map.setPaintProperty('landcover', 'fill-opacity', 0.78);
    }
    if (map.getLayer('water')) {
      map.setPaintProperty('water', 'fill-color', '#dbeafe');
    }
    if (map.getLayer('waterway')) {
      map.setPaintProperty('waterway', 'line-color', '#93c5fd');
    }
    if (map.getLayer('road_minor_case')) {
      map.setLayerZoomRange('road_minor_case', 10, 24);
      map.setPaintProperty('road_minor_case', 'line-color', '#94a3b8');
      map.setPaintProperty('road_minor_case', 'line-opacity', 0.82);
    }
    if (map.getLayer('road_minor_fill')) {
      map.setLayerZoomRange('road_minor_fill', 10, 24);
      map.setPaintProperty('road_minor_fill', 'line-color', '#ffffff');
    }
    if (map.getLayer('road_sec_case_noramp')) {
      map.setPaintProperty('road_sec_case_noramp', 'line-color', '#64748b');
      map.setPaintProperty('road_sec_case_noramp', 'line-opacity', 0.88);
    }
    if (map.getLayer('road_sec_fill_noramp')) {
      map.setPaintProperty('road_sec_fill_noramp', 'line-color', '#ffffff');
    }
    if (map.getLayer('road_pri_case_noramp')) {
      map.setPaintProperty('road_pri_case_noramp', 'line-color', '#f59e0b');
      map.setPaintProperty('road_pri_case_noramp', 'line-opacity', 0.85);
    }
    if (map.getLayer('road_pri_fill_noramp')) {
      map.setPaintProperty('road_pri_fill_noramp', 'line-color', '#fef9c3');
    }
    if (map.getLayer('building')) {
      map.setLayerZoomRange('building', 12, 24);
      map.setPaintProperty('building', 'fill-color', '#f1f5f9');
      map.setPaintProperty('building', 'fill-outline-color', '#cbd5e1');
      map.setPaintProperty('building', 'fill-opacity', 0.8);
    }
    if (map.getLayer('building-top')) {
      map.setLayerZoomRange('building-top', 12, 24);
      map.setPaintProperty('building-top', 'fill-color', '#ffffff');
      map.setPaintProperty('building-top', 'fill-outline-color', '#94a3b8');
      map.setPaintProperty('building-top', 'fill-opacity', 0.85);
    }
  } catch {
    /* fallback ignored */
  }
}

export function LiveMap() {
  const fleet = useFleet();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<MlNs | null>(null);
  const vehicleMarkersRef = useRef<Map<string, { setLngLat: (lnglat: [number, number]) => unknown; remove: () => void; getElement: () => HTMLElement }>>(new Map());
  const stationMarkersRef = useRef<Array<{ remove: () => void }>>([]);
  const incidentMarkersRef = useRef<Array<{ remove: () => void }>>([]);
  const trailRef = useRef<Record<string, [number, number][]>>({});
  const readyRef = useRef(false);

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

  // Police-station pins + city boundary, straight from the provided KMZ/KML files
  const [mapFeatures, setMapFeatures] = useState<{
    stations: Array<{ name: string; lng: number; lat: number }>;
    boundary: [number, number][];
  } | null>(null);
  const [showTrail, setShowTrail] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);

  const liveVehicles = fleet.liveVehicles;
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
  const simState = selectedId ? getVehicleSimState(selectedId) : undefined;

  const simCount = useMemo(() => Object.values(fleet.live).filter((d) => d.simulated).length, [fleet.live]);
  const realCount = useMemo(() => Object.values(fleet.live).filter((d) => !d.simulated).length, [fleet.live]);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/gwalior-map.geojson')
      .then((r) => (r.ok ? r.json() : null))
      .then((gj: { features?: Array<{ properties: { kind?: string; name?: string }; geometry: { coordinates: [number, number] | [number, number, number] } }> } | null) => {
        if (cancelled || !gj?.features) return;
        const pinStations = gj.features
          .filter((f) => f.properties.kind === 'police-station')
          .map((f) => ({ name: f.properties.name ?? 'Unknown PS', lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
        const boundaryFeature = gj.features.find((f) => f.properties.kind === 'boundary');
        const boundary = (boundaryFeature?.geometry.coordinates as [number, number][] | undefined) ?? [];
        setMapFeatures({ stations: pinStations, boundary });
      })
      .catch(() => { /* pins simply do not render without the KMZ dataset */ });
    return () => { cancelled = true; };
  }, []);

  // "Parked" count per KMZ pin: vehicles belong to DB stations; each DB station
  // contributes to the nearest KMZ pin (within 1.2 km). KMZ names differ from DB
  // names, so the match is geographic, not textual.
  const stationPins = useMemo(() => {
    if (!mapFeatures) return [];
    const allVehicles = fleet.snapshot?.vehicles ?? [];
    const stationById = new Map((fleet.snapshot?.stations ?? []).map((st) => [st.id, st]));
    return mapFeatures.stations.map((pin) => {
      let parked = 0;
      for (const v of allVehicles) {
        if (!v.stationId) continue;
        const st = stationById.get(v.stationId);
        if (!st || st.lat == null || st.lng == null) continue;
        if (distanceBetween([st.lat, st.lng], [pin.lat, pin.lng]) <= 1200) parked += 1;
      }
      return { ...pin, parked };
    });
  }, [mapFeatures, fleet.snapshot]);

  const stationMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return stationPins.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 4);
  }, [search, stationPins]);

  // Center & smooth fly to vehicle
  const flyTo = useCallback((v: VehicleView) => {
    setSelectedId(v.id);
    const map = mapRef.current;
    if (map && v.lat != null && v.lng != null) {
      map.flyTo({ center: [v.lng, v.lat], zoom: Math.max(map.getZoom(), 14.5), duration: 800 });
    }
  }, []);

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

        // Supabase/NationTrack-style controls: zoom, locate, (fullscreen lives in the panel)
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        map.addControl(
          new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: false,
            showUserLocation: true,
          }),
          'bottom-right'
        );

        const initLayers = () => {
          if (cancelled || !mapRef.current) return;
          if (map.getSource('route')) return;

          // 1. Trail Source & Glow Layers (Zomato-style emerald trailing path)
          map.addSource('trail', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
          });

          map.addLayer({
            id: 'trail-glow',
            type: 'line',
            source: 'trail',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#059669',
              'line-width': 8,
              'line-opacity': 0.45,
              'line-blur': 2,
            },
          });

          map.addLayer({
            id: 'trail-core',
            type: 'line',
            source: 'trail',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#10b981',
              'line-width': 4,
              'line-opacity': 1,
            },
          });

          // 2. Route Corridor Source & Glow Layers (Uber/Zomato style planned route ahead)
          map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
          });

          map.addLayer({
            id: 'route-glow',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#0284c7',
              'line-width': 8,
              'line-opacity': 0.4,
              'line-blur': 2,
            },
          });

          map.addLayer({
            id: 'route-core',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#0ea5e9',
              'line-width': 3.5,
              'line-opacity': 1,
              'line-dasharray': [2, 2],
            },
          });

          // 3. Gwalior city boundary ring (from gwalior.kmz) — blue dashed outline
          map.addSource('boundary', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
          });

          map.addLayer({
            id: 'boundary-line',
            type: 'line',
            source: 'boundary',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#2563eb',
              'line-width': 3.5,
              'line-opacity': 0.95,
              'line-dasharray': [3, 2],
            },
          });

          const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
          if (!isDark) enhanceLightBasemap(map);
          readyRef.current = true;
          setMapReady(true);
        };

        map.on('style.load', initLayers);

        // Follow the app theme: swap the basemap style
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
      vehicleMarkersRef.current.forEach((m) => m.remove());
      vehicleMarkersRef.current.clear();
      try {
        mapRef.current?.remove();
      } catch {
        /* noop */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Update & sync vehicle HTML DOM markers (rotations, radar beams, plate pills) ----
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || !readyRef.current) return;

    const currentMarkers = vehicleMarkersRef.current;

    if (!showVehicles) {
      for (const marker of currentMarkers.values()) {
        marker.remove();
      }
      currentMarkers.clear();
      return;
    }

    const activeIds = new Set<string>();

    for (const v of filtered) {
      if (v.lat == null || v.lng == null) continue;
      activeIds.add(v.id);

      const isSelected = v.id === selectedId;
      const existing = currentMarkers.get(v.id);

      if (existing) {
        existing.setLngLat([v.lng, v.lat]);
        updateFleetMarkerElement(existing.getElement(), v, {
          heading: v.heading,
          isSelected,
        });
      } else {
        const el = createFleetMarkerElement(v, {
          heading: v.heading,
          isSelected,
          onClick: () => {
            setSelectedId(v.id);
            flyTo(v);
          },
        });
        const marker = new ml.Marker({ element: el, anchor: 'center' })
          .setLngLat([v.lng, v.lat])
          .addTo(map);
        currentMarkers.set(v.id, marker);
      }
    }

    // Remove markers for filtered-out vehicles
    for (const [id, marker] of currentMarkers.entries()) {
      if (!activeIds.has(id)) {
        marker.remove();
        currentMarkers.delete(id);
      }
    }
  }, [filtered, selectedId, showVehicles, mapReady, flyTo]);

  // ---- Toggle trail & route line visibility ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const vis = showTrail ? 'visible' : 'none';
    for (const id of ['trail-glow', 'trail-core', 'route-glow', 'route-core']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    }
  }, [showTrail, mapReady]);

  // ---- Police-station red pins (from Police Station.kmz, counts matched geographically) ----
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || !readyRef.current) return;
    stationMarkersRef.current.forEach((m) => m.remove());
    stationMarkersRef.current = [];
    if (!showStations) return;
    for (const pin of stationPins) {
      const el = document.createElement('div');
      el.style.cssText = 'position:relative;width:32px;height:46px;cursor:pointer;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.45));';
      el.innerHTML = `
        <div style="width:30px;height:30px;background:#dc2626;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.35);border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(45deg);color:#fff;font-weight:900;font-size:12px;font-family:system-ui,sans-serif;line-height:1;">${pin.parked}</span>
        </div>`;

      const tooltip = new ml.Popup({ offset: 40, closeButton: false, closeOnClick: false, className: 'ps-tooltip' })
        .setHTML(`<div style="font-family:system-ui,-apple-system,sans-serif;font-size:12.5px;font-weight:600;color:#0f172a;padding:2px 4px;">${pin.name} | Parked: ${pin.parked}</div>`);

      el.addEventListener('mouseenter', () => tooltip.addTo(map));
      el.addEventListener('mouseleave', () => tooltip.remove());
      el.addEventListener('click', () => {
        map.flyTo({ center: [pin.lng, pin.lat], zoom: Math.max(map.getZoom(), 14.5), duration: 800 });
      });

      const marker = new ml.Marker({ element: el, anchor: 'bottom' }).setLngLat([pin.lng, pin.lat]).addTo(map);
      stationMarkersRef.current.push(marker);
    }
  }, [stationPins, showStations, mapReady]);

  // ---- City boundary ring (gwalior.kmz) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource('boundary');
    if (src?.setData) {
      src.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: mapFeatures?.boundary ?? [] },
      });
    }
  }, [mapFeatures, mapReady]);


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

  // ---- Maintain + render Zomato/Uber style trail & planned corridor for selected vehicle ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    if (!selectedId) {
      const trailSrc = map.getSource('trail');
      if (trailSrc?.setData) trailSrc.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } });
      const routeSrc = map.getSource('route');
      if (routeSrc?.setData) routeSrc.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } });
      return;
    }

    const v = liveVehicles.find((x) => x.id === selectedId);
    const sim = getVehicleSimState(selectedId);

    let trailCoords: [number, number][] = [];
    let routeCoords: [number, number][] = [];

    if (sim && sim.recentTrail.length > 0) {
      trailCoords = sim.recentTrail;
      routeCoords = sim.activeRouteRemaining;
    } else if (v?.lat != null && v?.lng != null) {
      const arr = trailRef.current[selectedId] ?? [];
      const last = arr[arr.length - 1];
      const point: [number, number] = [v.lng, v.lat];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) {
        arr.push(point);
        if (arr.length > 25) arr.shift();
        trailRef.current[selectedId] = arr;
      }
      trailCoords = trailRef.current[selectedId] ?? [];
    }

    const trailSrc = map.getSource('trail');
    if (trailSrc?.setData) {
      trailSrc.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: showTrail ? trailCoords : [] },
      });
    }

    const routeSrc = map.getSource('route');
    if (routeSrc?.setData) {
      routeSrc.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: showTrail ? routeCoords : [] },
      });
    }
  }, [selectedId, liveVehicles, showTrail, mapReady]);

  // ---- Resize on fullscreen toggle ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const t = setTimeout(() => map.resize(), 120);
    return () => clearTimeout(t);
  }, [fullscreen, panelCollapsed]);

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
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search registration, code or station…"
              placeholders={[
                'Search registration (e.g. "MP-07-")…',
                'Search station (e.g. "Kotwali")…',
                'Search driver or asset code…',
              ]}
              ariaLabel="Search vehicles"
            />
            {stationMatches.length > 0 ? (
              <div style={{ display: 'grid', gap: 4 }}>
                {stationMatches.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="veh-map-ctrl-btn"
                    style={{ justifyContent: 'flex-start', width: '100%', height: 'auto', padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}
                    onClick={() => {
                      const map = mapRef.current;
                      if (map) map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 14.5), duration: 800 });
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: '50% 50% 50% 0', background: '#dc2626', transform: 'rotate(45deg)', flex: 'none' }} aria-hidden="true" />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <strong style={{ color: 'var(--color-brand)' }}>{p.parked}</strong>
                  </button>
                ))}
              </div>
            ) : null}
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

          {/* Modern Route Corridor Status Card (Zomato / Swiggy / Uber style) */}
          {simState ? (
            <div
              style={{
                margin: '0.4rem 0',
                padding: '0.55rem 0.7rem',
                borderRadius: '8px',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 750, fontSize: '0.78rem', color: 'var(--color-brand)' }}>
                  🛣️ {simState.routeName}
                </span>
                <span className="badge badge--brand" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                  {simState.direction === 1 ? 'A → B' : 'B → A'}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                <span>{simState.fromName} ⇄ {simState.toName}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <div style={{ flex: 1, height: '4px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, Math.round((simState.currentDist / simState.totalDist) * 100))}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #10b981, #0ea5e9)',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
                <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                  {(simState.totalDist / 1000).toFixed(1)} km
                </span>
              </div>
            </div>
          ) : null}

          {selected.telemetryFreshness !== 'FRESH' ? (
            <p className="text-muted" style={{ fontSize: '0.75rem', margin: 0 }}>
              Last position may be stale. This does not mean the vehicle is inactive or unavailable.
            </p>
          ) : null}
          <div className="kv" style={{ fontSize: '0.82rem' }}>
            <span>Sector</span>
            <span>{SECTOR_LABEL[selected.sector]}</span>
            <span>Speed</span>
            <span className="mono">{Math.round(selected.speedKmph)} km/h</span>
            <span>Heading</span>
            <span className="mono">{selected.heading ? `${selected.heading}°` : '—'}</span>
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
                <input type="checkbox" checked={showTrail} onChange={(e) => setShowTrail(e.target.checked)} /> Trail & Routes
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {/* Legend */}
      <div className={`veh-map-legend${panelCollapsed ? ' veh-map-legend--shifted' : ''}`} aria-label="Map status legend">
        {(Object.keys(STATUS_COLORS) as VehicleStatus[]).map((s) => (
          <div key={s} className="veh-legend-row">
            <span className="veh-legend-dot" style={{ background: STATUS_COLORS[s] }} aria-hidden="true" />
            <span>{STATUS_LABEL[s]}</span>
          </div>
        ))}
        <div className="veh-legend-row">
          <span className="veh-pulse-dot" style={{ width: 8, height: 8 }} aria-hidden="true" />
          <span>Incident</span>
        </div>
        <div className="veh-legend-row">
          <span style={{ width: 14, height: 3, background: '#38bdf8', borderRadius: 2 }} aria-hidden="true" />
          <span>Planned Route</span>
        </div>
        <div className="veh-legend-row">
          <span style={{ width: 14, height: 3, background: '#10b981', borderRadius: 2 }} aria-hidden="true" />
          <span>Breadcrumb Trail</span>
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
          <span className="text-muted mono" style={{ fontSize: '0.72rem' }}>{Math.round(v.speedKmph)} km/h</span>
        </button>
      ))}
    </div>
  );
}
