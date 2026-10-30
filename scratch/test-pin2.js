const sharp = require('sharp');

function makeSvg(count = 3, isMyStation = false) {
  const pinFill = isMyStation ? 'url(#pinGradGold)' : 'url(#pinGrad)';
  const pinStroke = isMyStation ? '#f59e0b' : '#ffffff';
  const pinStrokeWidth = isMyStation ? '2' : '1.5';
  const glowFilter = isMyStation ? 'url(#goldGlow)' : 'url(#dropShadow)';
  const fontSize = count > 9 ? '9' : '10.5';
  const textY = count > 9 ? '22.8' : '23.2';

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="96" viewBox="0 0 36 48">
  <defs>
    <!-- Base Drop Shadow -->
    <filter id="dropShadow" x="-25%" y="-15%" width="150%" height="150%">
      <feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#0f172a" flood-opacity="0.36"/>
    </filter>
    
    <!-- My Station Radiant Gold Halo Glow -->
    <filter id="goldGlow" x="-35%" y="-25%" width="170%" height="170%">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f59e0b" flood-opacity="0.95"/>
      <feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#000000" flood-opacity="0.45"/>
    </filter>

    <!-- Crimson Pin Gradient -->
    <linearGradient id="pinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ef4444"/>
      <stop offset="45%" stop-color="#dc2626"/>
      <stop offset="100%" stop-color="#991b1b"/>
    </linearGradient>

    <!-- My Station Amber-Crimson Gradient -->
    <linearGradient id="pinGradGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f87171"/>
      <stop offset="40%" stop-color="#dc2626"/>
      <stop offset="100%" stop-color="#7f1d1d"/>
    </linearGradient>

    <!-- Police 5-Star Metallic Gold Gradient -->
    <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="40%" stop-color="#eab308"/>
      <stop offset="100%" stop-color="#ca8a04"/>
    </linearGradient>

    <!-- Inner Count Dial Gradient (Pristine White Porcelain) -->
    <linearGradient id="dialGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
  </defs>

  <!-- Ground Contact Shadow beneath tip -->
  <ellipse cx="18" cy="46.5" rx="7" ry="1.5" fill="rgba(15,23,42,0.22)"/>

  <!-- Pin Body (Teardrop Needle pointing exactly at 18, 48) -->
  <g filter="${glowFilter}">
    <path d="M 18 47.8 C 16.5 44.5 5 30 5 19.5 A 13 13 0 1 1 31 19.5 C 31 30 19.5 44.5 18 47.8 Z" 
          fill="${pinFill}" 
          stroke="${pinStroke}" 
          stroke-width="${pinStrokeWidth}" 
          stroke-linejoin="round"/>
    
    <!-- Central Counter Disc -->
    <circle cx="18" cy="19.5" r="8.2" fill="url(#dialGrad)" stroke="${isMyStation ? '#f59e0b' : 'rgba(220,38,38,0.22)'}" stroke-width="1.2"/>
    
    <!-- High-Contrast Bold Fleet Number -->
    <text x="18" y="${textY}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="900" font-size="${fontSize}" fill="#0f172a" letter-spacing="-0.3">${count}</text>
  </g>

  <!-- Crown Police 5-Point Golden Star -->
  <g transform="translate(18, 5.5)" filter="url(#dropShadow)">
    <polygon points="0,-5 1.5,-1.6 5.2,-1.3 2.5,1.5 3.2,5.1 0,3.2 -3.2,5.1 -2.5,1.5 -5.2,-1.3 -1.5,-1.6" 
             fill="url(#starGrad)" 
             stroke="#854d0e" 
             stroke-width="0.7" 
             stroke-linejoin="round"/>
    <!-- Star Facet Highlight -->
    <circle cx="0" cy="0" r="0.9" fill="#ffffff" opacity="0.95"/>
  </g>
</svg>
`;
}

async function run() {
  await sharp(Buffer.from(makeSvg(3, false))).png().toFile('test-v2-regular.png');
  await sharp(Buffer.from(makeSvg(12, true))).png().toFile('test-v2-mystation.png');
  console.log('V2 pins rendered successfully!');
}

run().catch(console.error);

