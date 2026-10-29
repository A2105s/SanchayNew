import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cachedLightStyle: Record<string, unknown> | null = null;
let cachedDarkStyle: Record<string, unknown> | null = null;

/**
 * Ola Maps & Krutrim Mobility Design System:
 * - Earth / Land canvas: #F4F3F0 (warm stone, high readability for dense Indian street grids)
 * - Built-up / Blocks: #EBE8E1 (subtle architectural footprint)
 * - Greenery & Parks: #E2EFE1 (Ola Park soft sage)
 * - Water: #C8E1F3 (Ola Water soft calm pastel) with #85BBE5 waterways
 * - Minor Streets (Colonies, gallis): #D0D5DD casing with #FFFFFF pure white fill
 * - Secondary & Primary Urban Corridors: Crisp prominent #FFFFFF boulevards with #98A2B3 casing
 * - Highways & Expressways: Signature Ola Marigold (#FFAE42 / #FFC57E) with #E08D23 casing
 * - Typography: Deep charcoal #212121 / #333333 with clean white halo
 */
function transformLightStyle(style: any): any {
  const clone = JSON.parse(JSON.stringify(style));

  if (Array.isArray(clone.layers)) {
    for (const layer of clone.layers) {
      // 1. Earth / Base Canvas — Ola Maps warm porcelain canvas (#F4F3F0)
      if (layer.id === 'background') {
        layer.paint = {
          ...(layer.paint || {}),
          'background-color': '#F4F3F0',
          'background-opacity': 1,
        };
      }

      // 2. Parks & Greenery — Ola Maps soft sage (#E2EFE1)
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
          'fill-color': '#E2EFE1',
          'fill-opacity': 0.88,
          'fill-antialias': true,
        };
      }

      // 3. Buildings & Built-up Footprints — Ola built-up urban relief (#EBE8E1)
      if (layer.id === 'building') {
        layer.minzoom = 12;
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#EBE8E1',
          'fill-outline-color': '#D0D5DD',
          'fill-opacity': { stops: [[12, 0.45], [14, 0.8], [16, 0.95]] },
          'fill-antialias': true,
        };
      }
      if (layer.id === 'building-top') {
        layer.minzoom = 12;
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#FAF9F6',
          'fill-outline-color': '#98A2B3',
          'fill-opacity': { stops: [[12, 0.5], [14, 0.85], [16, 1]] },
          'fill-antialias': true,
        };
      }

      // 4. Water & Streams — Ola Maps gentle sky water (#C8E1F3)
      if (layer.id === 'water' || layer.id === 'water_shadow') {
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#C8E1F3',
          'fill-opacity': 1,
          'fill-antialias': true,
        };
      }
      if (layer.id === 'waterway') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#85BBE5',
          'line-width': { stops: [[8, 1], [11, 1.8], [14, 3], [16, 4.2]] },
          'line-opacity': 0.95,
        };
      }

      // 5. Minor Residential Streets (Indian neighborhood grid / colony lanes)
      // Ola style: Clean, crisp Slate casing (#D0D5DD) with pure white core (#FFFFFF)
      if (
        layer.id === 'road_minor_case' ||
        layer.id === 'tunnel_minor_case' ||
        layer.id === 'bridge_minor_case'
      ) {
        layer.minzoom = 10;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#D0D5DD',
          'line-opacity': 0.92,
          'line-width': { stops: [[10, 0.7], [12, 1.3], [14, 2.5], [16, 4.8], [18, 9]] },
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
          'line-color': '#E2E4E9',
          'line-opacity': 0.8,
          'line-width': { stops: [[11, 0.6], [13, 1.2], [15, 2.2], [17, 4.5]] },
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
          'line-color': '#FAFAFA',
          'line-opacity': 1,
        };
      }

      // 7. Secondary Roads (Main city thoroughfares) — crisp white avenue with Slate-400 casing
      if (
        layer.id === 'road_sec_case_noramp' ||
        layer.id === 'tunnel_sec_case' ||
        layer.id === 'bridge_sec_case'
      ) {
        layer.minzoom = 9;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#98A2B3',
          'line-opacity': 0.95,
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
          'line-color': '#FFFFFF',
          'line-opacity': 1,
          'line-width': { stops: [[9, 0.5], [11, 1.2], [13, 2.4], [15, 4.8], [18, 9.5]] },
        };
      }

      // 8. Primary Arterial Roads — prominent white boulevard with solid #98A2B3 casing
      // (Ola Maps uses pure white for urban arterial roads to keep city navigation clean)
      if (
        layer.id === 'road_pri_case_noramp' ||
        layer.id === 'road_pri_case_ramp' ||
        layer.id === 'tunnel_pri_case' ||
        layer.id === 'bridge_pri_case'
      ) {
        layer.minzoom = 7;
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#98A2B3',
          'line-opacity': 0.95,
          'line-width': { stops: [[7, 1.1], [10, 2.0], [13, 3.8], [16, 7.2], [18, 14]] },
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
          'line-width': { stops: [[7, 0.7], [10, 1.4], [13, 2.8], [16, 5.6], [18, 11]] },
        };
      }

      // 9. National Highways & Expressways — Signature Ola Marigold Amber (#FFAE42 / #FFC57E)
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
          'line-color': '#E08D23',
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
          'line-color': '#FFAE42',
          'line-opacity': 1,
          'line-width': { stops: [[5, 0.8], [8, 1.6], [11, 3.2], [14, 6.4], [17, 13]] },
        };
      }

      // 10. Typography — Ola Maps dark charcoal #212121 / #333333 with crisp white halo
      if (layer.id && layer.id.startsWith('roadname_')) {
        layer.paint = {
          ...(layer.paint || {}),
          'text-color': '#212121',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.8,
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
