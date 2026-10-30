const fs = require('fs');

const replacement = `  // ---- Station markers (Rock-Solid Center-Anchored Red Police Star Marker & Fleet Count) ----
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
      el.className = 'ps-station-marker';
      el.style.cssText = \`cursor: pointer; user-select: none; z-index: \${isMyStation ? '50' : '15'}; display: block; line-height: 0;\`;

      const strokeColor = isMyStation ? '#fbbf24' : '#ffffff';
      const strokeWidth = isMyStation ? '2' : '1.5';
      const filter = isMyStation ? \`url(#psGlow_\${uid})\` : \`url(#psShadow_\${uid})\`;
      const starStroke = isMyStation ? '#b45309' : '#854d0e';
      const fontSize = count > 9 ? '8.5' : '9.5';
      const textY = count > 9 ? '17.2' : '17.5';

      el.innerHTML = \`
        <svg width="26" height="30" viewBox="0 0 30 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;">
          <defs>
            <filter id="psShadow_\${uid}" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.4"/>
            </filter>
            <filter id="psGlow_\${uid}" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f59e0b" flood-opacity="0.95"/>
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.5"/>
            </filter>
            <linearGradient id="psPinGrad_\${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ef4444"/>
              <stop offset="100%" stop-color="#b91c1c"/>
            </linearGradient>
            <linearGradient id="psStarGrad_\${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fef08a"/>
              <stop offset="50%" stop-color="#eab308"/>
              <stop offset="100%" stop-color="#ca8a04"/>
            </linearGradient>
          </defs>

          <g filter="\${filter}">
            <!-- Pin Body -->
            <path d="M 15 33 C 13.5 30 5 21 5 14 A 10 10 0 1 1 25 14 C 25 21 16.5 30 15 33 Z" 
                  fill="url(#psPinGrad_\${uid})" 
                  stroke="\${strokeColor}" 
                  stroke-width="\${strokeWidth}" 
                  stroke-linejoin="round"/>

            <!-- Central White Dial -->
            <circle cx="15" cy="14" r="6.2" fill="#ffffff" stroke="\${isMyStation ? '#f59e0b' : 'rgba(220,38,38,0.2)'}" stroke-width="0.8"/>
            
            <!-- Vehicle Count Number Inside Marker -->
            <text x="15" y="\${textY}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="\${fontSize}" fill="#0f172a">\${count}</text>

            <!-- Golden Police Star Crowning the Apex -->
            <g transform="translate(15, 4.5)">
              <polygon points="0,-3.8 1.1,-1.2 3.8,-1 1.9,1 2.4,3.8 0,2.4 -2.4,3.8 -1.9,1 -3.8,-1 -1.1,-1.2" 
                       fill="url(#psStarGrad_\${uid})" 
                       stroke="\${starStroke}" 
                       stroke-width="0.5" 
                       stroke-linejoin="round"/>
              <circle cx="0" cy="0" r="0.6" fill="#ffffff" opacity="0.95"/>
            </g>
          </g>
        </svg>
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

      const popup = new ml.Popup({ offset: 16, closeButton: true, className: 'ps-station-popup' }).setHTML(popupHtml);
      const marker = new ml.Marker({ element: el }).setLngLat([s.lng, s.lat]).setPopup(popup).addTo(map);
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
console.log('Successfully updated LiveMap.tsx to rock-solid center-anchored marker!');
