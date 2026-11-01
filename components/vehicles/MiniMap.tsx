'use client';

import { loadMapLibre } from '@/lib/client/maplibre';
import { baseStyle } from '@/lib/client/map-config';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { FLEET_SVG_STRINGS } from '@/components/vehicles/FleetIcons';

export const DEFAULT_IOT_LAT = 26.245263;
export const DEFAULT_IOT_LNG = 78.312914;

/** Small position mini-map using maplibre-gl with CARTO raster tiles. Theme-aware. */
export function MiniMap({
  lat,
  lng,
  heading = 0,
  trail,
  isIot = false,
  registrationNumber,
}: {
  lat: number | null;
  lng: number | null;
  heading?: number;
  trail?: [number, number][]; // [lng, lat] points
  isIot?: boolean;
  registrationNumber?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [failed, setFailed] = useState(false);

  // If IoT and no lock or 0, fallback to standard default IoT base coordinates
  const effectiveLat = (lat != null && lat !== 0) ? lat : (isIot ? DEFAULT_IOT_LAT : null);
  const effectiveLng = (lng != null && lng !== 0) ? lng : (isIot ? DEFAULT_IOT_LNG : null);

  useEffect(() => {
    if (effectiveLat == null || effectiveLng == null) return;
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
          center: [effectiveLng, effectiveLat],
          zoom: 14,
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
          if (isIot) {
            el.className = 'fleet-marker fleet-marker--iot';
            el.innerHTML = `
              <div class="fleet-marker__iot-pulse"></div>
              <div class="fleet-marker__rotator" style="transform: rotate(${heading}deg);">
                <div class="fleet-marker__icon-wrap">
                  ${FLEET_SVG_STRINGS.iotPolice}
                </div>
              </div>
              <div class="fleet-marker__pill" style="opacity: 1; transform: translateY(0);">
                <span class="fleet-marker__iot-badge">IOT</span>
                <span class="mono fleet-marker__reg">${registrationNumber ?? 'MP07-DG-6386'}</span>
              </div>
            `;
            new maplibregl.Marker({ element: el, anchor: 'center' })
              .setLngLat([effectiveLng, effectiveLat])
              .addTo(map as never);
          } else {
            el.style.cssText =
              'width:16px;height:16px;border-radius:50% 50% 50% 0;background:#0a7f8c;border:2px solid #fff;transform:rotate(' +
              (heading - 45) +
              'deg);box-shadow:0 1px 4px rgba(0,0,0,0.4)';
            new maplibregl.Marker({ element: el }).setLngLat([effectiveLng, effectiveLat]).addTo(map as never);
          }

          if (trail && trail.length > 1) {
            m.addSource('trail', {
              type: 'geojson',
              data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trail } },
            });
            m.addLayer({
              id: 'trail-line',
              type: 'line',
              source: 'trail',
              paint: { 'line-color': '#0ea5e9', 'line-width': 3.5, 'line-opacity': 0.8 },
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
  }, [effectiveLat, effectiveLng, heading, isIot]);

  if (effectiveLat == null || effectiveLng == null) {
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
