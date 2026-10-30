const fs = require('fs');

const replacement = `  // ---- Station markers (Rock-Solid Bottom-Anchored Standalone Red Police Star Pin with Fleet Count) ----
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || !readyRef.current) return;
    stationMarkersRef.current.forEach((m) => m.remove());
    stationMarkersRef.current = [];
    if (!showStations) return;

    const myStationId = fleet.me?.stationId;

    for (const s of stations) {
      const count = Object.values(s.inventory ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      const isMyStation = Boolean(myStationId && (s.id === myStationId || s.code === myStationId));
      const uid = s.id.replace(/[^a-zA-Z0-9_-]/g, '_');

      const el = document.createElement('div');
      el.className = \`ps-station-marker \${isMyStation ? 'is-my-station' : ''}\`;
      el.style.cssText = \`width: 32px; height: 44px; position: relative; cursor: pointer; user-select: none; z-index: \${isMyStation ? '60' : '20'};\`;

      const fontSize = count > 9 ? '9' : '10.5';
      const textY = count > 9 ? '22.8' : '23.2';
      const pinFill = isMyStation ? \`url(#psPinGradGold_\${uid})\` : \`url(#psPinGrad_\${uid})\`;
      const pinStroke = isMyStation ? '#f59e0b' : '#ffffff';
      const pinStrokeWidth = isMyStation ? '2' : '1.5';
      const glowFilter = isMyStation ? \`url(#psGoldGlow_\${uid})\` : \`url(#psDropShadow_\${uid})\`;

      const svgContent = \`
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 36 48" style="width:32px;height:44px;display:block;overflow:visible;">
          <defs>
            <filter id="psDropShadow_\${uid}" x="-25%" y="-15%" width="150%" height="150%">
              <feDropShadow dx="0" dy="2" stdDeviation="1.8" flood-color="#0f172a" flood-opacity="0.36"/>
            </filter>
            <filter id="psGoldGlow_\${uid}" x="-35%" y="-25%" width="170%" height="170%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f59e0b" flood-opacity="0.95"/>
              <feDropShadow dx="0" dy="2" stdDeviation="1.8" flood-color="#000000" flood-opacity="0.45"/>
            </filter>
            <linearGradient id="psPinGrad_\${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ef4444"/>
              <stop offset="45%" stop-color="#dc2626"/>
              <stop offset="100%" stop-color="#991b1b"/>
            </linearGradient>
            <linearGradient id="psPinGradGold_\${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f87171"/>
              <stop offset="40%" stop-color="#dc2626"/>
              <stop offset="100%" stop-color="#7f1d1d"/>
            </linearGradient>
            <linearGradient id="psStarGrad_\${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fef08a"/>
              <stop offset="40%" stop-color="#eab308"/>
              <stop offset="100%" stop-color="#ca8a04"/>
            </linearGradient>
            <linearGradient id="psDialGrad_\${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="100%" stop-color="#f8fafc"/>
            </linearGradient>
          </defs>

          <!-- Contact Shadow beneath needle tip -->
          <ellipse cx="18" cy="46.5" rx="6.5" ry="1.4" fill="rgba(15,23,42,0.22)"/>

          <!-- Pin Body -->
          <g filter="\${glowFilter}">
            <path d="M 18 47.8 C 16.5 44.5 5 30 5 19.5 A 13 13 0 1 1 31 19.5 C 31 30 19.5 44.5 18 47.8 Z" 
                  fill="\${pinFill}" 
                  stroke="\${pinStroke}" 
                  stroke-width="\${pinStrokeWidth}" 
                  stroke-linejoin="round"/>
            
            <circle cx="18" cy="19.5" r="8.2" fill="url(#psDialGrad_\${uid})" stroke="\${isMyStation ? '#f59e0b' : 'rgba(220,38,38,0.22)'}" stroke-width="1.2"/>
            
            <text x="18" y="\${textY}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="900" font-size="\${fontSize}" fill="#0f172a" letter-spacing="-0.3">\${count}</text>
          </g>

          <!-- Crowning Police Golden Star -->
          <g transform="translate(18, 5.5)" filter="url(#psDropShadow_\${uid})">
            <polygon points="0,-5 1.5,-1.6 5.2,-1.3 2.5,1.5 3.2,5.1 0,3.2 -3.2,5.1 -2.5,1.5 -5.2,-1.3 -1.5,-1.6" 
                     fill="url(#psStarGrad_\${uid})" 
                     stroke="#854d0e" 
                     stroke-width="0.7" 
                     stroke-linejoin="round"/>
            <circle cx="0" cy="0" r="0.9" fill="#ffffff" opacity="0.95"/>
          </g>
        </svg>
      \`;

      const myStationBadge = isMyStation
        ? \`<div class="ps-my-station-pill">YOUR STATION</div>\`
        : '';
      const beaconRipple = isMyStation
        ? \`<div class="ps-station-beacon"></div>\`
        : '';

      el.innerHTML = \`
        \${beaconRipple}
        <div class="ps-pin-inner">
          \${svgContent}
        </div>
        \${myStationBadge}
      \`;

      const inchargeInfo = s.inchargeName ? \`\\nIn-charge: \${s.inchargeName}\` : '';
      const phoneInfo = s.phone ? \`\\nCUG: \${s.phone}\` : '';
      el.title = \`\${s.name} (\${s.zone} Zone)\\nFleet Pool: \${count} vehicles\${inchargeInfo}\${phoneInfo}\\nGPS: \${s.lat.toFixed(4)}, \${s.lng.toFixed(4)}\`;

      const inchargeHtml = s.inchargeName ? \`<div style="font-size:12px;margin-top:2px;"><b>In-charge:</b> \${s.inchargeName}</div>\` : '';
      const phoneHtml = s.phone ? \`<div style="font-size:12px;margin-top:2px;"><b>CUG Contact:</b> <a href="tel:\${s.phone}" style="color:#2563eb;text-decoration:none;">\${s.phone}</a></div>\` : '';
      const myStationBanner = isMyStation
        ? \`<div style="display:inline-block;margin-bottom:6px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;">YOUR ASSIGNED STATION</div>\`
        : '';

      const popupHtml = \`
        <div class="ps-station-popup-card">
          \${myStationBanner}
          <div class="ps-station-popup-title">\${s.name}</div>
          <div class="ps-station-popup-sub">\${s.zone} Zone &bull; \${s.district}</div>
          \${inchargeHtml}
          \${phoneHtml}
          <div class="ps-station-popup-fleet">
            <span class="ps-fleet-badge">Allocatable Fleet: \${count} vehicles</span>
          </div>
          <div class="ps-station-popup-coords">\${s.lat.toFixed(4)}°N, \${s.lng.toFixed(4)}°E</div>
        </div>
      \`;

      const popup = new ml.Popup({ offset: [0, -42], closeButton: true, className: 'ps-station-popup' }).setHTML(popupHtml);
      const marker = new ml.Marker({ element: el, anchor: 'bottom' }).setLngLat([s.lng, s.lat]).setPopup(popup).addTo(map);
      stationMarkersRef.current.push(marker);
    }
  }, [stations, showStations, mapReady, fleet.me?.stationId]);`;

let content = fs.readFileSync('components/vehicles/LiveMap.tsx', 'utf8');
const startMarker = '  // ---- Station markers (';
const endMarker = '  // ---- Pulsing open-incident markers ----';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found!', { startIdx, endIdx });
  process.exit(1);
}

const newContent = content.substring(0, startIdx) + replacement + '\n\n' + content.substring(endIdx);
fs.writeFileSync('components/vehicles/LiveMap.tsx', newContent, 'utf8');
console.log('Successfully updated LiveMap.tsx!');

