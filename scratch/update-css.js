const fs = require('fs');

const cssSnippet = `/* Station Pin & Beacon Radar Styles */
.ps-station-marker {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  position: relative;
  cursor: pointer;
  user-select: none;
}

.ps-pin-inner {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  transform-origin: bottom center;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
  z-index: 5;
}

.ps-station-marker:hover .ps-pin-inner {
  transform: translateY(-4px) scale(1.12);
}

.ps-my-station-pill {
  position: absolute;
  bottom: calc(100% + 2px);
  left: 50%;
  transform: translateX(-50%);
  background: #f59e0b;
  color: #0f172a;
  font-weight: 800;
  font-size: 8px;
  padding: 1.5px 5.5px;
  border-radius: 9999px;
  letter-spacing: 0.4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  border: 1px solid #ffffff;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}

.ps-station-beacon {
  position: absolute;
  bottom: 0px;
  left: 50%;
  width: 20px;
  height: 10px;
  border-radius: 50%;
  background: rgba(245, 158, 11, 0.45);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.85);
  animation: psStationPulse 2s cubic-bezier(0, 0, 0.2, 1) infinite;
  pointer-events: none;
  z-index: 1;
}

@keyframes psStationPulse {
  0% {
    transform: translate(-50%, 50%) scale(0.5);
    opacity: 0.95;
  }
  100% {
    transform: translate(-50%, 50%) scale(2.8);
    opacity: 0;
  }
}

.ps-station-popup .maplibregl-popup-content {
  padding: 10px 12px;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(226, 232, 240, 0.9);
}

.ps-station-popup-card {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #0f172a;
  min-width: 190px;
}

.ps-station-popup-title {
  font-weight: 700;
  font-size: 13.5px;
  line-height: 1.25;
  color: #0f172a;
}

.ps-station-popup-sub {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.ps-station-popup-fleet {
  margin-top: 6px;
}

.ps-fleet-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #0f172a;
  border: 1px solid #cbd5e1;
}

.ps-station-popup-coords {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 6px;
  font-family: monospace;
}
`;

function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const marker = '/* Station Pin & Beacon Radar Styles */';
  const idx = content.indexOf(marker);
  if (idx !== -1) {
    content = content.substring(0, idx) + cssSnippet;
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  } else {
    console.log(`Marker not found in ${filePath}`);
  }
}

updateFile('app/globals.css');
updateFile('app/sanchay-ui.css');

