import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cachedLightStyle: Record<string, unknown> | null = null;
let cachedDarkStyle: Record<string, unknown> | null = null;

/**
 * Authentic Google Maps Gwalior Cartography:
 * Sampled directly from user's Google Maps screenshot (Thatipur, Morar, DB City):
 * - Canvas Background: Clean neutral light warm gray (#ebeef0)
 * - Roads (Wide & Small): Crisp pure white (#ffffff) ribbons with ZERO casing outlines (line-opacity: 0)
 * - Major Arterials / Corridors: Bold wide pure white ribbons (#ffffff)
 * - Highways & Motorways: Google Maps signature warm pale yellow / amber (#ffe082) with zero casing
 * - Greenery & Parks: Soft fresh pastel green (#c2f0d4)
 * - Water Bodies: Crystal pastel sky blue (#c5effd)
 * - Buildings & Plots: Soft subtle off-white/gray (#e8eaed)
 * - Typography: Neutral dark slate (#5f6368) with crisp 2px white halo
 */
function transformLightStyle(style: any): any {
  const clone = JSON.parse(JSON.stringify(style));

  if (Array.isArray(clone.layers)) {
    for (const layer of clone.layers) {
      // 1. Base Canvas — Google Maps soft neutral light grey (#ebeef0)
      if (layer.id === 'background') {
        layer.paint = {
          ...(layer.paint || {}),
          'background-color': '#ebeef0',
          'background-opacity': 1,
        };
      }

      // 2. Parks & Greenery — Google Maps soft pastel mint green (#c2f0d4)
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
          'fill-color': '#c2f0d4',
          'fill-opacity': 0.85,
          'fill-antialias': true,
        };
      }

      // 3. Buildings & City Plots — Subtle off-white/gray (#e8eaed)
      if (layer.id === 'building') {
        layer.minzoom = 12;
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#e4e7eb',
          'fill-outline-color': '#d8dce2',
          'fill-opacity': { stops: [[12, 0.4], [14, 0.65], [16, 0.85]] },
          'fill-antialias': true,
        };
      }
      if (layer.id === 'building-top') {
        layer.minzoom = 12;
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#edf0f3',
          'fill-outline-color': '#d0d5dc',
          'fill-opacity': { stops: [[12, 0.45], [14, 0.7], [16, 0.9]] },
          'fill-antialias': true,
        };
      }
      if (layer.id === 'landuse_residential') {
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#e8ecef',
          'fill-opacity': 0.5,
        };
      }

      // 4. Water Bodies & Streams — Google Maps pastel sky blue (#c5effd)
      if (layer.id === 'water' || layer.id === 'water_shadow') {
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#c5effd',
          'fill-opacity': 1,
          'fill-antialias': true,
        };
      }
      if (layer.id === 'waterway') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#93c7d5',
          'line-width': { stops: [[8, 1.2], [11, 2], [14, 3.5], [16, 5]] },
          'line-opacity': 0.95,
        };
      }

      // 5. REMOVE ALL ROAD OUTLINES / CASINGS (Zero outlines, exactly like Google Maps)
      if (layer.id && layer.id.includes('_case')) {
        layer.paint = {
          ...(layer.paint || {}),
          'line-opacity': 0,
          'line-width': 0,
        };
      }

      // 6. Minor Residential Streets (Indian colony grid, cross roads, gallis)
      // Solid pure white (#ffffff) ribbon with no outlines
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
          'line-width': { stops: [[10, 1.0], [12, 1.8], [14, 3.2], [16, 5.5], [18, 11]] },
        };
      }

      // 7. Alleys and Service Roads
      if (
        layer.id === 'road_service_fill' ||
        layer.id === 'tunnel_service_fill' ||
        layer.id === 'bridge_service_fill' ||
        layer.id === 'road_path' ||
        layer.id === 'road_path_areas'
      ) {
        layer.minzoom = 11;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#ffffff',
          'line-opacity': 0.85,
          'line-width': { stops: [[11, 0.8], [13, 1.4], [15, 2.4], [17, 4.8]] },
        };
      }

      // 8. Secondary Urban Roads (City Main Streets) — Clean wide pure white (#ffffff) ribbon
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
          'line-width': { stops: [[9, 1.6], [11, 2.8], [13, 4.8], [15, 8.5], [18, 16]] },
        };
      }

      // 9. Primary Arterial Roads (Transit Corridors, Morar Rd, Kalpi Rd, Thatipur main road)
      // Clean, wider pure white (#ffffff) ribbon with zero outline
      if (
        layer.id === 'road_pri_fill_noramp' ||
        layer.id === 'road_pri_fill_ramp' ||
        layer.id === 'tunnel_pri_fill' ||
        layer.id === 'bridge_pri_fill'
      ) {
        layer.minzoom = 7;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#ffffff',
          'line-opacity': 1,
          'line-width': { stops: [[7, 2.0], [10, 3.6], [13, 6.2], [16, 11.5], [18, 20]] },
        };
      }

      // 10. National Highways & Motorways (Intercity Routes, Bypasses)
      // Google Maps signature pale warm amber / yellow (#ffe082) ribbon with no dark casing
      if (
        layer.id === 'road_trunk_fill_noramp' ||
        layer.id === 'road_trunk_fill_ramp' ||
        layer.id === 'road_mot_fill_noramp' ||
        layer.id === 'road_mot_fill_ramp' ||
        layer.id === 'tunnel_trunk_fill' ||
        layer.id === 'tunnel_mot_fill' ||
        layer.id === 'bridge_trunk_fill' ||
        layer.id === 'bridge_mot_fill'
      ) {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#ffe082',
          'line-opacity': 1,
          'line-width': { stops: [[5, 2.0], [8, 3.5], [11, 6.5], [14, 12], [17, 22]] },
        };
      }

      // 11. Street & Place Typography — Google Maps neutral slate-gray (#5f6368) with crisp white halo
      if (layer.id && layer.id.startsWith('roadname_')) {
        layer.paint = {
          ...(layer.paint || {}),
          'text-color': '#5f6368',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
        };
      }
      if (layer.id && (layer.id.startsWith('place_') || layer.id.startsWith('poi_'))) {
        layer.paint = {
          ...(layer.paint || {}),
          'text-color': '#3c4043',
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
        'Cache-Control': 'no-cache, no-store, must-revalidate',
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
