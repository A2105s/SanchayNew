import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
const destDir = resolve(root, 'public/vendor');
const dest = resolve(destDir, 'maplibre-gl-worker.mjs');

if (!existsSync(src)) {
  console.warn('[copy-maplibre-worker] maplibre-gl not installed yet, skipping.');
} else {
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
  console.log('[copy-maplibre-worker] copied worker to public/vendor');
}
