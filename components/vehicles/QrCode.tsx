'use client';

/**
 * Minimal self-contained QR Code encoder (byte mode, EC level M, versions 1-10)
 * plus an inline SVG renderer. No external dependencies.
 * Adequate for encoding short URLs like `${origin}/vehicles/${id}`.
 */

// --- Galois field tables for Reed-Solomon ---------------------------------
const EXP: number[] = new Array(512);
const LOG: number[] = new Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < gen.length; i++) res[i] ^= gfMul(gen[i], factor);
  }
  return res;
}

// --- Version capacity (EC level M, byte mode) ------------------------------
// [version] = { totalCodewords, ecPerBlock, group1Blocks, group1Data, group2Blocks, group2Data }
interface VerSpec {
  size: number;
  ecPerBlock: number;
  g1: number;
  g1d: number;
  g2: number;
  g2d: number;
  capacity: number; // byte-mode data capacity (chars)
}
const VERSIONS: Record<number, VerSpec> = {
  1: { size: 21, ecPerBlock: 10, g1: 1, g1d: 16, g2: 0, g2d: 0, capacity: 14 },
  2: { size: 25, ecPerBlock: 16, g1: 1, g1d: 28, g2: 0, g2d: 0, capacity: 26 },
  3: { size: 29, ecPerBlock: 26, g1: 1, g1d: 44, g2: 0, g2d: 0, capacity: 42 },
  4: { size: 33, ecPerBlock: 18, g1: 2, g1d: 32, g2: 0, g2d: 0, capacity: 62 },
  5: { size: 37, ecPerBlock: 24, g1: 2, g1d: 43, g2: 0, g2d: 0, capacity: 84 },
  6: { size: 41, ecPerBlock: 16, g1: 4, g1d: 27, g2: 0, g2d: 0, capacity: 106 },
  7: { size: 45, ecPerBlock: 18, g1: 4, g1d: 31, g2: 0, g2d: 0, capacity: 122 },
  8: { size: 49, ecPerBlock: 22, g1: 2, g1d: 38, g2: 2, g2d: 39, capacity: 152 },
  9: { size: 53, ecPerBlock: 22, g1: 3, g1d: 36, g2: 2, g2d: 37, capacity: 180 },
  10: { size: 57, ecPerBlock: 26, g1: 4, g1d: 43, g2: 1, g2d: 44, capacity: 213 },
};

function pickVersion(len: number): number {
  for (let v = 1; v <= 10; v++) if (len <= VERSIONS[v].capacity) return v;
  return 10;
}

// --- Bit buffer -------------------------------------------------------------
class BitBuffer {
  bits: number[] = [];
  put(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1);
  }
  get length() {
    return this.bits.length;
  }
}

function toUtf8(str: string): number[] {
  const out: number[] = [];
  for (const ch of str) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

const PAD_BYTES = [0xec, 0x11];

function buildCodewords(data: number[], version: number): number[] {
  const spec = VERSIONS[version];
  const totalData = spec.g1 * spec.g1d + spec.g2 * spec.g2d;
  const bb = new BitBuffer();
  bb.put(0b0100, 4); // byte mode
  const charCountBits = version <= 9 ? 8 : 16;
  bb.put(data.length, charCountBits);
  for (const b of data) bb.put(b, 8);
  // terminator
  const cap = totalData * 8;
  const term = Math.min(4, cap - bb.length);
  if (term > 0) bb.put(0, term);
  // pad to byte boundary
  while (bb.length % 8 !== 0) bb.bits.push(0);
  // to bytes
  const bytes: number[] = [];
  for (let i = 0; i < bb.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bb.bits[i + j];
    bytes.push(v);
  }
  // pad codewords
  let pi = 0;
  while (bytes.length < totalData) bytes.push(PAD_BYTES[pi++ % 2]);

  // split into blocks
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let pos = 0;
  for (let b = 0; b < spec.g1; b++) {
    const blk = bytes.slice(pos, pos + spec.g1d);
    pos += spec.g1d;
    blocks.push(blk);
    ecBlocks.push(rsEncode(blk, spec.ecPerBlock));
  }
  for (let b = 0; b < spec.g2; b++) {
    const blk = bytes.slice(pos, pos + spec.g2d);
    pos += spec.g2d;
    blocks.push(blk);
    ecBlocks.push(rsEncode(blk, spec.ecPerBlock));
  }
  // interleave
  const result: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) for (const blk of blocks) if (i < blk.length) result.push(blk[i]);
  const maxEc = spec.ecPerBlock;
  for (let i = 0; i < maxEc; i++) for (const blk of ecBlocks) result.push(blk[i]);
  return result;
}

// --- Matrix placement -------------------------------------------------------
type Grid = (number | null)[][];

function newGrid(size: number): Grid {
  return Array.from({ length: size }, () => new Array(size).fill(null));
}

function placeFinder(g: Grid, r: number, c: number) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= g.length || cc >= g.length) continue;
      const inRing =
        (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
        (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6));
      const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      g[rr][cc] = inRing || inCore ? 1 : 0;
    }
  }
}

const ALIGN_POS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

function placeAlignment(g: Grid, version: number) {
  const positions = ALIGN_POS[version];
  for (const r of positions) {
    for (const c of positions) {
      // skip overlaps with finders
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= g.length - 9) || (r >= g.length - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isRing = Math.max(Math.abs(dr), Math.abs(dc)) === 2;
          const isCenter = dr === 0 && dc === 0;
          g[r + dr][c + dc] = isRing || isCenter ? 1 : 0;
        }
      }
    }
  }
}

function placeTiming(g: Grid) {
  const n = g.length;
  for (let i = 8; i < n - 8; i++) {
    const v = i % 2 === 0 ? 1 : 0;
    if (g[6][i] === null) g[6][i] = v;
    if (g[i][6] === null) g[i][6] = v;
  }
}

function reserveFormat(g: Grid): boolean[][] {
  const n = g.length;
  const reserved = Array.from({ length: n }, () => new Array(n).fill(false));
  // format info areas
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][n - 1 - i] = true;
    reserved[n - 1 - i][8] = true;
  }
  // dark module
  g[n - 8][8] = 1;
  reserved[n - 8][8] = true;
  return reserved;
}

function isFunction(g: Grid, reserved: boolean[][], r: number, c: number): boolean {
  return g[r][c] !== null || reserved[r][c];
}

function placeData(g: Grid, reserved: boolean[][], codewords: number[]) {
  const n = g.length;
  const bits: number[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  let bitIdx = 0;
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col = 5; // skip timing column
    for (let i = 0; i < n; i++) {
      const row = upward ? n - 1 - i : i;
      for (let cwc = 0; cwc < 2; cwc++) {
        const c = col - cwc;
        if (isFunction(g, reserved, row, c)) continue;
        g[row][c] = bitIdx < bits.length ? bits[bitIdx] : 0;
        bitIdx++;
      }
    }
    upward = !upward;
  }
}

// mask pattern 0: (r+c) % 2 === 0
function applyMask0(g: Grid, reserved: boolean[][]) {
  const n = g.length;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (!isFunction(g, reserved, r, c) && (r + c) % 2 === 0) g[r][c] = (g[r][c]! ^ 1) as number;
}

// Format info for EC level M (01) and mask 0, precomputed 15 bits
const FORMAT_M0 = 0b101010000010010; // level M, mask 0

function placeFormat(g: Grid) {
  const n = g.length;
  const bits: number[] = [];
  for (let i = 14; i >= 0; i--) bits.push((FORMAT_M0 >> i) & 1);
  // around top-left
  const coords1: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  coords1.forEach(([r, c], i) => (g[r][c] = bits[i]));
  // mirror copy
  for (let i = 0; i < 8; i++) g[n - 1 - i][8] = bits[i];
  for (let i = 8; i < 15; i++) g[8][n - 15 + i] = bits[i];
}

export function encodeQr(text: string): number[][] {
  const data = toUtf8(text);
  const version = pickVersion(data.length);
  const spec = VERSIONS[version];
  const codewords = buildCodewords(data, version);
  const g = newGrid(spec.size);
  placeFinder(g, 0, 0);
  placeFinder(g, 0, spec.size - 7);
  placeFinder(g, spec.size - 7, 0);
  placeAlignment(g, version);
  placeTiming(g);
  const reserved = reserveFormat(g);
  placeData(g, reserved, codewords);
  applyMask0(g, reserved);
  placeFormat(g);
  return g.map((row) => row.map((v) => (v === 1 ? 1 : 0)));
}

export function QrCode({ text, title }: { text: string; title?: string }) {
  let modules: number[][];
  try {
    modules = encodeQr(text);
  } catch {
    return <span className="text-muted">QR unavailable</span>;
  }
  const n = modules.length;
  const quiet = 4;
  const total = n + quiet * 2;
  const rects: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules[r][c]) rects.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
    }
  }
  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label={title ?? 'QR code'}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={rects.join('')} fill="#111827" />
    </svg>
  );
}
