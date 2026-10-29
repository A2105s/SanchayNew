/**
 * Basemap configuration shared by every map.
 *
 * Same approach as the SindhuHackOcean / original Sanchay map component: CARTO's vector GL styles
 * (Positron for light, Dark Matter for dark). They carry their own tiles, fonts and sprites, so no key and no
 * custom glyph endpoint are needed, and the style swaps with the app theme.
 *
 * Override with NEXT_PUBLIC_MAP_STYLE_LIGHT / NEXT_PUBLIC_MAP_STYLE_DARK (any MapLibre style.json URL, e.g. a keyed
 * MapTiler / Stadia / self-hosted style) - the CSP in proxy.ts allows the origins of whatever you configure.
 * Note: CARTO's old RASTER endpoint (basemaps.cartocdn.com/rastertiles) now needs an API key, and OpenStreetMap's own
 * tile servers block apps that do not follow their usage policy (HTTP 403), so neither is used.
 */
export const MAP_STYLE_LIGHT =
  process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT || 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
export const MAP_STYLE_DARK =
  process.env.NEXT_PUBLIC_MAP_STYLE_DARK || 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/** Font stack for custom symbol layers (cluster counts). Must exist in the style's glyph set. */
export const MAP_FONT_STACK = process.env.NEXT_PUBLIC_MAP_FONT || 'Montserrat Regular';

/** The style to hand to `new Map({ style })` / `map.setStyle()`. */
export function baseStyle(dark: boolean): string {
  return dark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
}
