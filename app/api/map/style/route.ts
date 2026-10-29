import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cachedLightStyle: Record<string, unknown> | null = null;
let cachedDarkStyle: Record<string, unknown> | null = null;

/**
 * Modern aesthetic color management (Apple Maps / Mapbox Monochrome inspired):
 * - Background: Clean, crisp porcelain (#f8fafc)
 * - Greenery & Parks: Soft organic Japanese matcha / Scandinavian sage (#dcfce7 / #d8ebd9)
 * - Water & Streams: Soothing calm glacial blue (#dbeafe / #93c5fd), non-neon
 * - Minor Roads: Architectural slate outline (#94a3b8) with clean white core (#ffffff)
 * - Primary Roads: Refined warm ivory/champagne (#fef9c3) with soft amber border (#f59e0b)
 * - Buildings: Tactile 3D urban relief (#f1f5f9) with subtle slate outlines (#cbd5e1)
 * - Typography: Deep slate (#334155) with crisp halo
 */
function transformLightStyle(style: any): any {
  const clone = JSON.parse(JSON.stringify(style));

  if (Array.isArray(clone.layers)) {
    for (const layer of clone.layers) {
      // 1. Base Canvas — clean modern porcelain
      if (layer.id === 'background') {
        layer.paint = {
          ...(layer.paint || {}),
          'background-color': '#f8fafc',
          'background-opacity': 1,
        };
      }

      // 2. Parks & Nature — soft, organic sage green (aesthetic, restful)
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
          'fill-color': '#d8ebd9',
          'fill-opacity': 0.78,
          'fill-antialias': true,
        };
      }

      // 3. Buildings — clean architectural 3D urban footprints
      if (layer.id === 'building') {
        layer.minzoom = 12;
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#f1f5f9',
          'fill-outline-color': '#cbd5e1',
          'fill-opacity': { stops: [[12, 0.45], [14, 0.8], [16, 0.95]] },
          'fill-antialias': true,
        };
      }
      if (layer.id === 'building-top') {
        layer.minzoom = 12;
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#ffffff',
          'fill-outline-color': '#94a3b8',
          'fill-opacity': { stops: [[12, 0.5], [14, 0.85], [16, 1]] },
          'fill-antialias': true,
        };
      }

      // 4. Water & Streams — calm sky water (softer, non-neon blue)
      if (layer.id === 'water' || layer.id === 'water_shadow') {
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#dbeafe',
          'fill-opacity': 0.95,
          'fill-antialias': true,
        };
      }
      if (layer.id === 'waterway') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#93c5fd',
          'line-width': { stops: [[8, 1], [11, 1.8], [14, 3], [16, 4.2]] },
          'line-opacity': 0.9,
        };
      }

      // 5. Minor Residential Streets — architectural slate border with pure white core
      if (
        layer.id === 'road_minor_case' ||
        layer.id === 'tunnel_minor_case' ||
        layer.id === 'bridge_minor_case'
      ) {
        layer.minzoom = 10;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#94a3b8',
          'line-opacity': 0.82,
          'line-width': { stops: [[10, 0.7], [12, 1.3], [14, 2.6], [16, 4.8], [18, 9.5]] },
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
          'line-width': { stops: [[10, 0.4], [12, 0.9], [14, 1.8], [16, 3.6], [18, 7.5]] },
        };
      }

      // 6. Alleys and Service Roads
      if (
        layer.id === 'road_service_case' ||
        layer.id === 'tunnel_service_case' ||
        layer.id === 'bridge_service_case'
      ) {
        layer.minzoom = 11;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#cbd5e1',
          'line-opacity': 0.75,
          'line-width': { stops: [[11, 0.6], [13, 1.2], [15, 2.2], [17, 4.8]] },
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

      // 7. Secondary Roads (Main urban corridors) — crisp slate border with white fill
      if (
        layer.id === 'road_sec_case_noramp' ||
        layer.id === 'tunnel_sec_case' ||
        layer.id === 'bridge_sec_case'
      ) {
        layer.minzoom = 9;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#64748b',
          'line-opacity': 0.88,
          'line-width': { stops: [[9, 0.9], [11, 1.8], [13, 3.4], [15, 6.2], [18, 12]] },
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
          'line-width': { stops: [[9, 0.5], [11, 1.2], [13, 2.4], [15, 4.8], [18, 9.5]] },
        };
      }

      // 8. Primary Arteries (Boulevards) — warm champagne ivory with subtle warm amber casing
      if (
        layer.id === 'road_pri_case_noramp' ||
        layer.id === 'road_pri_case_ramp' ||
        layer.id === 'tunnel_pri_case' ||
        layer.id === 'bridge_pri_case'
      ) {
        layer.minzoom = 7;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#f59e0b',
          'line-opacity': 0.85,
          'line-width': { stops: [[7, 1.0], [10, 1.8], [13, 3.6], [16, 6.8], [18, 13]] },
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
          'line-color': '#fef9c3',
          'line-opacity': 1,
          'line-width': { stops: [[7, 0.6], [10, 1.2], [13, 2.6], [16, 5.2], [18, 10.5]] },
        };
      }

      // 9. Motorways & Expressways — warm apricot with terracotta casing
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
          'line-color': '#f97316',
          'line-opacity': 0.88,
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
          'line-color': '#ffedd5',
          'line-opacity': 1,
        };
      }

      // 10. Street & Place Typography — Slate 700 with clean white halo
      if (layer.id && layer.id.startsWith('roadname_')) {
        layer.paint = {
          ...(layer.paint || {}),
          'text-color': '#334155',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.75,
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
