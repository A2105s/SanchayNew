const sharp = require('sharp');
const fs = require('fs');

function makeSvg(count = 3, isMyStation = false) {
  const pinFill = isMyStation ? 'url(#pinGradGold)' : 'url(#pinGrad)';
  const pinStroke = isMyStation ? '#fbbf24' : '#ffffff';
  const pinStrokeWidth = isMyStation ? '2' : '1.5';
  const glowFilter = isMyStation ? 'url(#goldGlow)' : 'url(#dropShadow)';

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="96" viewBox="0 0 36 48">
  <defs>
    <!-- Base Drop Shadow -->
    <filter id="dropShadow" x="-20%" y="-10%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="1.8" flood-color="#0f172a" flood-opacity="0.38"/>
    </filter>
    
    <!-- My Station Radiant Gold Glow -->
    <filter id="goldGlow" x="-30%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="#f59e0b" flood-opacity="0.9"/>
      <feDropShadow dx="0" dy="2" stdDeviation="1.8" flood-color="#000000" flood-opacity="0.4"/>
    </filter>

    <!-- Crimson Pin Gradient -->
    <linearGradient id="pinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f43f5e"/>
      <stop offset="35%" stop-color="#e11d48"/>
      <stop offset="100%" stop-color="#9f1239"/>
    </linearGradient>

    <!-- My Station Rich Amber-Crimson Gradient -->
    <linearGradient id="pinGradGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f43f5e"/>
      <stop offset="40%" stop-color="#dc2626"/>
      <stop offset="100%" stop-color="#7f1d1d"/>
    </linearGradient>

    <!-- Police 5-Star Metallic Gold Gradient -->
    <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fffbeb"/>
      <stop offset="40%" stop-color="#fcd34d"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>

    <!-- Inner Count Dial Gradient -->
    <linearGradient id="dialGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f1f5f9"/>
    </linearGradient>
  </defs>

  <!-- Pin Body (Teardrop Needle pointing exactly at 18, 47) -->
  <g filter="${glowFilter}">
    <path d="M 18 47.5 C 16.5 44 5 30 5 19.5 A 13 13 0 1 1 31 19.5 C 31 30 19.5 44 18 47.5 Z" 
          fill="${pinFill}" 
          stroke="${pinStroke}" 
          stroke-width="${pinStrokeWidth}" 
          stroke-linejoin="round"/>
    
    <!-- Central Counter Disc -->
    <circle cx="18" cy="19.5" r="8.2" fill="url(#dialGrad)" stroke="${isMyStation ? '#f59e0b' : 'rgba(225,29,72,0.25)'}" stroke-width="1"/>
    
    <!-- Bold Fleet Number -->
    <text x="18" y="23" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="900" font-size="10.5" fill="${isMyStation ? '#b45309' : '#e11d48'}" letter-spacing="-0.5">${count}</text>
  </g>

  <!-- Crown Police 5-Point Golden Star -->
  <g transform="translate(18, 5.5)" filter="url(#dropShadow)">
    <polygon points="0,-4.8 1.4,-1.5 5,-1.2 2.4,1.4 3.1,4.9 0,3.1 -3.1,4.9 -2.4,1.4 -5,-1.2 -1.4,-1.5" 
             fill="url(#starGrad)" 
             stroke="#92400e" 
             stroke-width="0.6" 
             stroke-linejoin="round"/>
    <circle cx="0" cy="0" r="0.9" fill="#ffffff" opacity="0.95"/>
  </g>
</svg>
`;
}

async function run() {
  await sharp(Buffer.from(makeSvg(3, false))).png().toFile('test-regular.png');
  await sharp(Buffer.from(makeSvg(5, true))).png().toFile('test-mystation.png');
  console.log('Both pins rendered successfully!');
}

run().catch(console.error);

