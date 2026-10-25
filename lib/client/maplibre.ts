'use client';

/**
 * Loads maplibre-gl once and points it at a same-origin worker file.
 * Bundlers rewrite the worker URL that maplibre computes internally, which breaks
 * the worker ("Worker failed to load"). The file in /public/vendor is copied from
 * node_modules by scripts/copy-maplibre-worker.mjs (runs on postinstall / predev / prebuild).
 */
let cached: Promise<typeof import('maplibre-gl')> | null = null;

export function loadMapLibre(): Promise<typeof import('maplibre-gl')> {
  if (!cached) {
    cached = import('maplibre-gl').then(async (ml) => {
      await import('maplibre-gl/dist/maplibre-gl.css');
      ml.setWorkerUrl('/vendor/maplibre-gl-worker.mjs');
      return ml;
    });
  }
  return cached;
}
