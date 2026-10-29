import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cachedLightStyle: Record<string, unknown> | null = null;
let cachedDarkStyle: Record<string, unknown> | null = null;

function transformLightStyle(style: any): any {
  const clone = JSON.parse(JSON.stringify(style));

  if (Array.isArray(clone.layers)) {
    for (const layer of clone.layers) {
      // 1. Crisp modern Apple Maps/Mapbox neutral background canvas (Slate 100)
      if (layer.id === 'background') {
        layer.paint = { ...(layer.paint || {}), 'background-color': '#f1f5f9', 'background-opacity': 1 };
      }

      // 2. Greenery & Parks — visible soft sage/mint green (instead of invisible 0.2 opacity!)
      if (
        layer.id === 'landcover' ||
        layer.id === 'park_national_park' ||
        layer.id === 'park_nature_reserve' ||
        layer.id === 'landuse' ||
        layer.id === 'landuse_park' ||
        layer.id === 'park'
      ) {
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#cdeedb',
          'fill-opacity': 0.82,
          'fill-antialias': true,
        };
      }

      // 3. Buildings — clean architectural footprints visible from zoom 12
      if (layer.id === 'building') {
        layer.minzoom = 12;
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#e2e8f0',
          'fill-outline-color': '#cbd5e1',
          'fill-opacity': { stops: [[12, 0.5], [14, 0.85], [16, 1]] },
          'fill-antialias': true,
        };
      }
      if (layer.id === 'building-top') {
        layer.minzoom = 12;
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#f8fafc',
          'fill-outline-color': '#94a3b8',
          'fill-opacity': { stops: [[12, 0.55], [14, 0.9], [16, 1]] },
          'fill-antialias': true,
        };
      }

      // 4. Water bodies & waterways
      if (layer.id === 'water' || layer.id === 'water_shadow') {
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#bae6fd',
          'fill-opacity': 1,
          'fill-antialias': true,
        };
      }
      if (layer.id === 'waterway') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#38bdf8',
          'line-width': { stops: [[8, 1], [11, 2], [14, 3.5], [16, 5]] },
        };
      }

      // 5. Minor streets & residential roads — Slate 400 casing with crisp white fill
      if (
        layer.id === 'road_minor_case' ||
        layer.id === 'tunnel_minor_case' ||
        layer.id === 'bridge_minor_case'
      ) {
        layer.minzoom = 10;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#94a3b8',
          'line-opacity': 0.92,
          'line-width': { stops: [[10, 0.9], [12, 1.6], [14, 3.2], [16, 6], [18, 12]] },
        };
      }
      if (
        layer.id === 'road_minor_fill' ||
        layer.id === 'tunnel_minor_fill' ||
        layer.id === 'bridge_minor_fill'
      ) {
        layer.minzoom = 10;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#ffffff',
          'line-opacity': 1,
          'line-width': { stops: [[10, 0.5], [12, 1.1], [14, 2.2], [16, 4.5], [18, 9.5]] },
        };
      }

      // 6. Alleys and service roads
      if (
        layer.id === 'road_service_case' ||
        layer.id === 'tunnel_service_case' ||
        layer.id === 'bridge_service_case'
      ) {
        layer.minzoom = 11;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#cbd5e1',
          'line-opacity': 0.85,
          'line-width': { stops: [[11, 0.7], [13, 1.4], [15, 2.8], [17, 6]] },
        };
      }
      if (
        layer.id === 'road_service_fill' ||
        layer.id === 'tunnel_service_fill' ||
        layer.id === 'bridge_service_fill'
      ) {
        layer.minzoom = 11;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#ffffff',
          'line-opacity': 1,
        };
      }

      // 7. Secondary roads (main connecting city streets)
      if (
        layer.id === 'road_sec_case_noramp' ||
        layer.id === 'tunnel_sec_case' ||
        layer.id === 'bridge_sec_case'
      ) {
        layer.minzoom = 9;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#64748b',
          'line-opacity': 0.95,
          'line-width': { stops: [[9, 1.1], [11, 2.2], [13, 4.2], [15, 8], [18, 15]] },
        };
      }
      if (
        layer.id === 'road_sec_fill_noramp' ||
        layer.id === 'tunnel_sec_fill' ||
        layer.id === 'bridge_sec_fill'
      ) {
        layer.minzoom = 9;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#ffffff',
          'line-opacity': 1,
          'line-width': { stops: [[9, 0.7], [11, 1.5], [13, 3.0], [15, 6.2], [18, 12]] },
        };
      }

      // 8. Primary roads (arterial boulevards) — warm amber casing with light yellow fill
      if (
        layer.id === 'road_pri_case_noramp' ||
        layer.id === 'road_pri_case_ramp' ||
        layer.id === 'tunnel_pri_case' ||
        layer.id === 'bridge_pri_case'
      ) {
        layer.minzoom = 7;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#d97706',
          'line-opacity': 1,
          'line-width': { stops: [[7, 1.2], [10, 2.4], [13, 4.8], [16, 9], [18, 17]] },
        };
      }
      if (
        layer.id === 'road_pri_fill_noramp' ||
        layer.id === 'road_pri_fill_ramp' ||
        layer.id === 'tunnel_pri_fill' ||
        layer.id === 'bridge_pri_fill'
      ) {
        layer.minzoom = 7;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#fef08a',
          'line-opacity': 1,
          'line-width': { stops: [[7, 0.8], [10, 1.6], [13, 3.4], [16, 7], [18, 13]] },
        };
      }

      // 9. Motorways and Expressways
      if (
        layer.id === 'road_trunk_case_noramp' ||
        layer.id === 'road_mot_case_noramp' ||
        layer.id === 'tunnel_trunk_case' ||
        layer.id === 'tunnel_mot_case' ||
        layer.id === 'bridge_trunk_case' ||
        layer.id === 'bridge_mot_case'
      ) {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#c2410c',
          'line-opacity': 1,
        };
      }
      if (
        layer.id === 'road_trunk_fill_noramp' ||
        layer.id === 'road_mot_fill_noramp' ||
        layer.id === 'tunnel_trunk_fill' ||
        layer.id === 'tunnel_mot_fill' ||
        layer.id === 'bridge_trunk_fill' ||
        layer.id === 'bridge_mot_fill'
      ) {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#fed7aa',
          'line-opacity': 1,
        };
      }

      // 10. Labels — Slate 800 with crisp white halo
      if (layer.id && layer.id.startsWith('roadname_')) {
        layer.paint = {
          ...(layer.paint || {}),
          'text-color': '#1e293b',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
        };
      }
    }
  }

  return clone;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const theme = searchParams.get('theme') || 'light';

  try {
    if (theme === 'dark') {
      if (!cachedDarkStyle) {
        const res = await fetch('https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', {
          next: { revalidate: 86400 },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cachedDarkStyle = await res.json();
      }
      return NextResponse.json(cachedDarkStyle, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      });
    }

    if (!cachedLightStyle) {
      const res = await fetch('https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json', {
        next: { revalidate: 86400 },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawVoyager = await res.json();
      cachedLightStyle = transformLightStyle(rawVoyager);
    }

    return NextResponse.json(cachedLightStyle, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    console.error('[map/style]', error);
    const fallbackUrl =
      theme === 'dark'
        ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
        : 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
    return NextResponse.redirect(fallbackUrl, 307);
  }
}
