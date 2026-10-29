import { readFileSync } from 'node:fs';
import { prisma } from '../lib/db/prisma';

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(police station|police|station|ps|thana|gwl|gwalior)\b/g, ' ').replace(/\s+/g, ' ').trim();

function tokens(s: string): Set<string> {
  return new Set(norm(s).split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

async function main() {
  try {
    const gj = JSON.parse(readFileSync('public/data/gwalior-map.geojson', 'utf8'));
    const pins = gj.features.filter((f: { properties: { kind?: string } }) => f.properties.kind === 'police-station');
    const stations = await prisma.station.findMany({ select: { id: true, name: true, code: true, lat: true, lng: true } });

    let matched = 0;
    const log: string[] = [];
    for (const f of pins) {
      const pinName = f.properties.name as string;
      const pinTokens = tokens(pinName);
      let best: { id: string; name: string; score: number } | null = null;
      for (const st of stations) {
        const score = jaccard(pinTokens, tokens(st.name));
        if (!best || score > best.score) best = { id: st.id, name: st.name, score };
      }
      if (best && best.score >= 0.3) {
        await prisma.station.update({
          where: { id: best.id },
          data: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }
        });
        matched += 1;
        log.push(`  ✓ ${pinName}  →  ${best.name} (score ${best.score.toFixed(2)})`);
      } else {
        log.push(`  ✗ ${pinName}  →  no confident match (best ${best ? `${best.name} ${best.score.toFixed(2)}` : 'none'})`);
      }
    }
    console.log(log.join('\n'));
    console.log(`synced ${matched}/${pins.length} KMZ pins into DB station coordinates`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
