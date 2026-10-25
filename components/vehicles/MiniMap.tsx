'use client';

import { loadMapLibre } from '@/lib/client/maplibre';
import { baseStyle } from '@/lib/client/map-config';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

/** Small position mini-map using maplibre-gl with CARTO raster tiles. Theme-aware. */
export function MiniMap({
  lat,
  lng,
  heading = 0,
  trail,
}: {
  lat: number | null;
  lng: number | null;
  heading?: number;
  trail?: [number, number][]; // [lng, lat] points
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null) return;
    let cancelled = false;
    let map: { remove: () => void } | null = null;

    (async () => {
      try {
        const maplibregl = await loadMapLibre();
        if (cancelled || !ref.current) return;
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        map = new maplibregl.Map({
          container: ref.current,
          style: baseStyle(dark),
          center: [lng, lat],
          zoom: 13,
          attributionControl: false,
        }) as unknown as { remove: () => void };
        mapRef.current = map;
        const m = map as unknown as {
          on: (e: string, cb: () => void) => void;
          addSource: (id: string, s: unknown) => void;
          addLayer: (l: unknown) => void;
        };
        m.on('load', () => {
          const el = document.createElement('div');
          el.style.cssText =
            'width:16px;height:16px;border-radius:50% 50% 50% 0;background:#2f6fed;border:2px solid #fff;transform:rotate(' +
            (heading - 45) +
            'deg);box-shadow:0 1px 4px rgba(0,0,0,0.4)';
          new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map as never);
          if (trail && trail.length > 1) {
            m.addSource('trail', {
              type: 'geojson',
              data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trail } },
            });
            m.addLayer({
              id: 'trail-line',
              type: 'line',
              source: 'trail',
              paint: { 'line-color': '#2f6fed', 'line-width': 3, 'line-opacity': 0.6 },
            });
          }
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      try {
        (map as { remove: () => void } | null)?.remove();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  if (lat == null || lng == null) {
    return (
      <div className="veh-minimap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-muted">No position available</span>
      </div>
    );
  }
  if (failed) {
    return (
      <div className="veh-minimap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
        <AlertTriangle size={16} /> <span className="text-muted">Map unavailable (offline)</span>
      </div>
    );
  }
  return <div className="veh-minimap" ref={ref} aria-label="Vehicle position map" />;
}
