const sharp = require('sharp');

const count = 3;
const isMyStation = false;

const pinFill = '#dc2626';
const strokeColor = '#ffffff';
const strokeWidth = '1.5';
const dropShadow = 'filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));';

const svg = `<svg width="56" height="76" viewBox="0 0 28 38" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Red Pin Body -->
  <path d="M14 37.5 C14 37.5 3 24 3 15 C3 8.9 7.9 4 14 4 C20.1 4 25 8.9 25 15 C25 24 14 37.5 14 37.5 Z" fill="${pinFill}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
  <!-- White Inner Disc -->
  <circle cx="14" cy="15" r="6.8" fill="#ffffff"/>
  <!-- Bold Vehicle Count -->
  <text x="14" y="18.2" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="9.5" fill="#dc2626">${count}</text>
  <!-- Crown Star on top -->
  <polygon points="14,0.5 15.6,3.8 19.2,4.4 16.5,7 17.2,10.6 14,8.8 10.8,10.6 11.5,7 8.8,4.4 12.4,3.8" fill="#facc15" stroke="#b45309" stroke-width="0.6" stroke-linejoin="round"/>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile('C:/Users/Parikshit/.gemini/antigravity/brain/af34a3b7-d8c8-4948-9813-bcc73ac9b6ca/test-marker3.png')
  .then(() => console.log('Rendered test-marker3.png successfully'))
  .catch(err => console.error(err));

