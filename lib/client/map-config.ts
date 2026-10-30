/**
 * Basemap configuration shared by every map.
 *
 * Vector GL styles (customized high-contrast Voyager for light, Dark Matter for dark).
 * Hosted style endpoint at `/api/map/style` provides high contrast street casings,
 * visible building footprints, and lush green parks for light mode.
 */
export const MAP_STYLE_LIGHT =
  process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT || '/api/map/style?theme=light&v=gm-v2';
export const MAP_STYLE_DARK =
  process.env.NEXT_PUBLIC_MAP_STYLE_DARK || 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/** Font stack for custom symbol layers (cluster counts). Must exist in the style's glyph set. */
export const MAP_FONT_STACK = process.env.NEXT_PUBLIC_MAP_FONT || 'Montserrat Regular';

/** The style to hand to `new Map({ style })` / `map.setStyle()`. */
export function baseStyle(dark: boolean): string {
  return dark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
}
