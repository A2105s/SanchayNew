import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cachedLightStyle: Record<string, unknown> | null = null;
let cachedDarkStyle: Record<string, unknown> | null = null;

/**
 * Pixel-Perfect Ola Maps Gwalior Cartography:
 * Sampled directly from user's live Ola Maps screenshots in Gwalior (Thatipur, DD Nagar):
 * - Land Canvas: #eaeaf6 (cool soothing lavender-porcelain)
 * - Minor Streets (Colonies & Gallis): Darker, crisper Slate-500 casing (#64748b) with pure white fill (#ffffff)
 * - Secondary City Roads: Pure white #ffffff with defined slate border #475569
 * - Primary Arterials / Transit Corridors: Iconic Ola steel-slate blue #b9c9d8 with #64748b casing
 * - Highways (Trunks / Motorways): Warm peach-amber #ffc57e with #e08d23 casing
 * - Parks & Greenery: Luminous Thatipur mint-emerald #99eabf (95% opacity)
 * - Institutional / Special Zones: Soft periwinkle-slate #dbe3ee
 * - Water: Clear sky blue #bae6fd / #60a5fa
 * - Typography: Slate-600 #475569 with thick white halo
 */
function transformLightStyle(style: any): any {
  const clone = JSON.parse(JSON.stringify(style));

  if (Array.isArray(clone.layers)) {
    for (const layer of clone.layers) {
      // 1. Base Canvas — Ola Gwalior lavender-porcelain (#eaeaf6)
      if (layer.id === 'background') {
        layer.paint = {
          ...(layer.paint || {}),
          'background-color': '#eaeaf6',
          'background-opacity': 1,
        };
      }

      // 2. Parks & Greenery — Ola Thatipur luminous mint-emerald (#99eabf)
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
          'fill-color': '#99eabf',
          'fill-opacity': 0.95,
          'fill-antialias': true,
        };
      }

      // 3. Buildings & City Blocks — Ola's iconic periwinkle-slate plots (#dbe3ee)
      if (layer.id === 'building') {
        layer.minzoom = 12;
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#dbe3ee',
          'fill-outline-color': '#c4d0df',
          'fill-opacity': { stops: [[12, 0.55], [14, 0.85], [16, 0.98]] },
          'fill-antialias': true,
        };
      }
      if (layer.id === 'building-top') {
        layer.minzoom = 12;
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#edf3fb',
          'fill-outline-color': '#b8c6d7',
          'fill-opacity': { stops: [[12, 0.6], [14, 0.9], [16, 1]] },
          'fill-antialias': true,
        };
      }
      if (layer.id === 'landuse_residential') {
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#e3e5f2',
          'fill-opacity': 0.45,
        };
      }

      // 4. Water Bodies & Streams
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
          'line-color': '#60a5fa',
          'line-width': { stops: [[8, 1.2], [11, 2], [14, 3.5], [16, 5]] },
          'line-opacity': 0.95,
        };
      }

      // 5. Minor Residential Streets (Indian colony grid, cross roads, gallis)
      // Darker, high-visibility Slate-500 casing (#64748b) with crisp pure white core (#ffffff)
      if (
        layer.id === 'road_minor_case' ||
        layer.id === 'tunnel_minor_case' ||
        layer.id === 'bridge_minor_case'
      ) {
        layer.minzoom = 10;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#64748b',
          'line-opacity': 0.95,
          'line-width': { stops: [[10, 1.1], [12, 1.8], [14, 3.2], [16, 5.8], [18, 11]] },
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
          'line-width': { stops: [[10, 0.5], [12, 1.0], [14, 2.0], [16, 4.0], [18, 8.5]] },
        };
      }

      // 6. Alleys and Service Roads — Slate-400 casing (#94a3b8)
      if (
        layer.id === 'road_service_case' ||
        layer.id === 'tunnel_service_case' ||
        layer.id === 'bridge_service_case'
      ) {
        layer.minzoom = 11;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#94a3b8',
          'line-opacity': 0.9,
          'line-width': { stops: [[11, 0.8], [13, 1.5], [15, 2.6], [17, 5.2]] },
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

      // 7. Secondary Urban Roads (City Main Streets) — pure white with solid Slate-600 (#475569) border
      if (
        layer.id === 'road_sec_case_noramp' ||
        layer.id === 'tunnel_sec_case' ||
        layer.id === 'bridge_sec_case'
      ) {
        layer.minzoom = 9;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#475569',
          'line-opacity': 0.98,
          'line-width': { stops: [[9, 1.2], [11, 2.2], [13, 4.0], [15, 7.2], [18, 14]] },
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
          'line-width': { stops: [[9, 0.7], [11, 1.4], [13, 2.8], [15, 5.5], [18, 11]] },
        };
      }

      // 8. Primary Arterial Roads (Major City Corridors, e.g. DD Nagar & Thatipur transit roads)
      // Steel-slate blue (#b9c9d8) ribbon with darker casing (#64748b)
      if (
        layer.id === 'road_pri_case_noramp' ||
        layer.id === 'road_pri_case_ramp' ||
        layer.id === 'tunnel_pri_case' ||
        layer.id === 'bridge_pri_case'
      ) {
        layer.minzoom = 7;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#64748b',
          'line-opacity': 1,
          'line-width': { stops: [[7, 1.3], [10, 2.5], [13, 4.8], [16, 8.8], [18, 16.5]] },
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
          'line-color': '#b9c9d8',
          'line-opacity': 1,
          'line-width': { stops: [[7, 0.8], [10, 1.7], [13, 3.5], [16, 6.8], [18, 13.5]] },
        };
      }

      // 9. National Highways & Motorways (Intercity Routes)
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
          'line-color': '#e08d23',
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
          'line-color': '#ffc57e',
          'line-opacity': 1,
          'line-width': { stops: [[5, 0.8], [8, 1.6], [11, 3.2], [14, 6.4], [17, 13]] },
        };
      }

      // 10. Street & Place Typography — Slate-700 with clean white halo
      if (layer.id && layer.id.startsWith('roadname_')) {
        layer.paint = {
          ...(layer.paint || {}),
          'text-color': '#334155',
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
