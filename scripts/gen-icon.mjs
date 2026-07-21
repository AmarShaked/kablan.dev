// Generates a 1024x1024 source app icon (rounded amber square + white "K")
// with zero dependencies (raw PNG via node:zlib). Feed to `tauri icon`.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const W = 1024;
const H = 1024;
const buf = Buffer.alloc(W * H * 4); // RGBA

const lerp = (a, b, t) => a + (b - a) * t;
function px(x, y, r, g, b, a) {
  const i = (y * W + x) * 4;
  const ia = a / 255;
  buf[i] = Math.round(lerp(buf[i], r, ia));
  buf[i + 1] = Math.round(lerp(buf[i + 1], g, ia));
  buf[i + 2] = Math.round(lerp(buf[i + 2], b, ia));
  buf[i + 3] = Math.max(buf[i + 3], a);
}

function distSeg(px_, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px_ - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px_ - cx, py - cy);
}

const radius = 190; // rounded-corner radius
function insideRounded(x, y) {
  const rx = Math.min(x, W - 1 - x);
  const ry = Math.min(y, H - 1 - y);
  if (rx >= radius || ry >= radius) return true;
  const dx = radius - rx;
  const dy = radius - ry;
  return dx * dx + dy * dy <= radius * radius;
}

// "K" strokes
const thk = 96;
const half = thk / 2;
const x0 = 372; // vertical bar x
const x1 = 700; // diagonal outer x
const yT = 296;
const yB = 728;
const yM = 512;
const segs = [
  [x0, yT, x0, yB], // vertical bar
  [x0 + 20, yM, x1, yT], // upper diagonal
  [x0 + 20, yM, x1, yB], // lower diagonal
];

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!insideRounded(x, y)) continue;
    // amber gradient background (top-left lighter → bottom-right deeper)
    const t = (x + y) / (W + H);
    const r = Math.round(lerp(0xf0, 0xc9, t));
    const g = Math.round(lerp(0xb0, 0x6e, t));
    const b = Math.round(lerp(0x5a, 0x28, t));
    px(x, y, r, g, b, 255);
    // white "K"
    let d = Infinity;
    for (const s of segs) d = Math.min(d, distSeg(x, y, s[0], s[1], s[2], s[3]));
    const cov = Math.max(0, Math.min(1, half - d + 0.6));
    if (cov > 0) px(x, y, 0xff, 0xff, 0xff, Math.round(cov * 255));
  }
}

// --- Encode PNG ---
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0, 0);
  return Buffer.concat([len, td, crc]);
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
// filter type 0 per scanline
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  buf.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync("src-tauri/icons", { recursive: true });
writeFileSync("src-tauri/icons/icon-source.png", png);
console.log("wrote src-tauri/icons/icon-source.png", png.length, "bytes");
