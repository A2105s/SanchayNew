import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cachedLightStyle: Record<string, unknown> | null = null;
let cachedDarkStyle: Record<string, unknown> | null = null;

/**
 * Authentic Ola Maps Mobile Cartography Style:
 * Extracted directly from Ola's live navigation UI:
 * - Canvas Background: Crisp porcelain #F4F7FB
 * - Buildings & City Blocks: Pastel periwinkle/slate #EBF1F8 with #D6E0EC outline
 * - Roads (All Levels): Pure crisp white #FFFFFF ribbons with #D5DFEA cool-slate casing
 * - Major Corridors: Wider pure white #FFFFFF ribbons with #C2D0E0 casing
 * - Highways (Motorways/Trunks): Warm amber-peach #FFDFC2 with #F97316 / #E08D23 casing
 * - Parks & Greenery: Luminous fresh mint green #9BF0B8 / #A7F3D0 (crisp, high visibility)
 * - Water: Soft radiant sky water #BAE6FD
 * - Typography: Slate-600 #475569 with pure white halo
 */
function transformLightStyle(style: any): any {
  const clone = JSON.parse(JSON.stringify(style));

  if (Array.isArray(clone.layers)) {
    for (const layer of clone.layers) {
      // 1. Base Canvas — Ola crisp porcelain (#F4F7FB)
      if (layer.id === 'background') {
        layer.paint = {
          ...(layer.paint || {}),
          'background-color': '#F4F7FB',
          'background-opacity': 1,
        };
      }

      // 2. Parks & Greenery — Ola signature fresh luminous mint (#9BF0B8 / #A7F3D0)
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
          'fill-color': '#A7F3D0',
          'fill-opacity': 0.92,
          'fill-antialias': true,
        };
      }

      // 3. Buildings & City Blocks — Ola's iconic pastel periwinkle-slate plots (#EBF1F8)
      if (layer.id === 'building') {
        layer.minzoom = 12;
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#EBF1F8',
          'fill-outline-color': '#D6E0EC',
          'fill-opacity': { stops: [[12, 0.6], [14, 0.88], [16, 1]] },
          'fill-antialias': true,
        };
      }
      if (layer.id === 'building-top') {
        layer.minzoom = 12;
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#F3F7FC',
          'fill-outline-color': '#CBD7E6',
          'fill-opacity': { stops: [[12, 0.65], [14, 0.92], [16, 1]] },
          'fill-antialias': true,
        };
      }
      if (layer.id === 'landuse_residential') {
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#F0F4FA',
          'fill-opacity': 0.5,
        };
      }

      // 4. Water & Streams — clear radiant sky blue
      if (layer.id === 'water' || layer.id === 'water_shadow') {
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#BAE6FD',
          'fill-opacity': 1,
          'fill-antialias': true,
        };
      }
      if (layer.id === 'waterway') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#60A5FA',
          'line-width': { stops: [[8, 1.2], [11, 2], [14, 3.5], [16, 5]] },
          'line-opacity': 0.95,
        };
      }

      // 5. Minor Residential Streets (Colony lanes, cross roads)
      // Ola style: Clean, crisp cool-slate casing (#D5DFEA) with pure white core (#FFFFFF)
      if (
        layer.id === 'road_minor_case' ||
        layer.id === 'tunnel_minor_case' ||
        layer.id === 'bridge_minor_case'
      ) {
        layer.minzoom = 10;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#D5DFEA',
          'line-opacity': 0.95,
          'line-width': { stops: [[10, 0.9], [12, 1.5], [14, 2.8], [16, 5.2], [18, 10]] },
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
          'line-color': '#FFFFFF',
          'line-opacity': 1,
          'line-width': { stops: [[10, 0.5], [12, 1.0], [14, 2.0], [16, 4.0], [18, 8.2]] },
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
          'line-color': '#E0E7F1',
          'line-opacity': 0.85,
          'line-width': { stops: [[11, 0.7], [13, 1.3], [15, 2.4], [17, 5]] },
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
          'line-color': '#FFFFFF',
          'line-opacity': 1,
        };
      }

      // 7. Secondary Urban Roads (City Main Roads)
      if (
        layer.id === 'road_sec_case_noramp' ||
        layer.id === 'tunnel_sec_case' ||
        layer.id === 'bridge_sec_case'
      ) {
        layer.minzoom = 9;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#BACAD9',
          'line-opacity': 0.98,
          'line-width': { stops: [[9, 1.1], [11, 2.0], [13, 3.8], [15, 7.0], [18, 13.5]] },
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
          'line-color': '#FFFFFF',
          'line-opacity': 1,
          'line-width': { stops: [[9, 0.7], [11, 1.4], [13, 2.8], [15, 5.5], [18, 11]] },
        };
      }

      // 8. Primary Arterial Roads (Major City Corridors)
      // Pure white prominent ribbons with clean slate borders
      if (
        layer.id === 'road_pri_case_noramp' ||
        layer.id === 'road_pri_case_ramp' ||
        layer.id === 'tunnel_pri_case' ||
        layer.id === 'bridge_pri_case'
      ) {
        layer.minzoom = 7;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#BACAD9',
          'line-opacity': 1,
          'line-width': { stops: [[7, 1.2], [10, 2.4], [13, 4.5], [16, 8.2], [18, 15.5]] },
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
          'line-color': '#FFFFFF',
          'line-opacity': 1,
          'line-width': { stops: [[7, 0.8], [10, 1.7], [13, 3.4], [16, 6.6], [18, 13]] },
        };
      }

      // 9. Motorways & National Highways (Intercity Routes)
      // Soft warm peach-amber with crisp orange casing
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
          'line-color': '#F97316',
          'line-opacity': 0.95,
          'line-width': { stops: [[5, 1.2], [8, 2.2], [11, 4.2], [14, 8], [17, 16]] },
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
          'line-color': '#FED7AA',
          'line-opacity': 1,
          'line-width': { stops: [[5, 0.8], [8, 1.6], [11, 3.2], [14, 6.4], [17, 13]] },
        };
      }

      // 10. Street & Place Typography — Ola Maps slate #475569 with thick pure white halo
      if (layer.id && layer.id.startsWith('roadname_')) {
        layer.paint = {
          ...(layer.paint || {}),
          'text-color': '#475569',
          'text-halo-color': '#FFFFFF',
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
