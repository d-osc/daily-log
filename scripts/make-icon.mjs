// Generates assets/icon.png (1024x1024 calendar icon) without any image
// dependencies — a hand-built PNG using only node:zlib. Run `tauri icon` on
// the result afterwards to produce all platform icons.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "icon.png");

const S = 1024; // final size
const SS = 2; // supersampling factor for smoother edges
const B = S * SS;

const INDIGO = [79, 70, 229];
const WHITE = [255, 255, 255];

const px = new Uint8Array(B * B * 4);

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const cx = x < (x0 + x1) / 2 ? x0 + r : x1 - r;
  const cy = y < (y0 + y1) / 2 ? y0 + r : y1 - r;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inRoundTopRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  if (y > y0 + r) return true; // bottom corners are square
  if (x >= x0 + r && x <= x1 - r) return true;
  const cx = x < (x0 + x1) / 2 ? x0 + r : x1 - r;
  const dx = x - cx;
  const dy = y - (y0 + r);
  return dx * dx + dy * dy <= r * r;
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// Geometry in 1024-space, scaled by SS below.
const G = {
  bg: [8, 8, 1016, 1016, 224],
  card: [150, 150, 874, 880, 64],
  header: [150, 150, 874, 330, 64],
  ringL: [320, 96, 376, 250, 26],
  ringR: [648, 96, 704, 250, 26],
  dots: [
    [330, 470],
    [512, 470],
    [694, 470],
    [330, 650],
    [512, 650],
    [694, 650],
  ],
};
const DOT_R = 56;

for (let y = 0; y < B; y++) {
  for (let x = 0; x < B; x++) {
    const sx = x / SS;
    const sy = y / SS;
    let color = null;
    if (inRoundedRect(sx, sy, ...G.bg)) color = INDIGO;
    if (inRoundedRect(sx, sy, ...G.card)) color = WHITE;
    if (inRoundTopRect(sx, sy, ...G.header)) color = INDIGO;
    if (inRoundedRect(sx, sy, ...G.ringL)) color = WHITE;
    if (inRoundedRect(sx, sy, ...G.ringR)) color = WHITE;
    for (const [cx, cy] of G.dots) {
      if (inCircle(sx, sy, cx, cy, DOT_R)) {
        color = INDIGO;
        break;
      }
    }
    const i = (y * B + x) * 4;
    if (color) {
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = 255;
    }
  }
}

// Downsample supersampled buffer.
const out = new Uint8Array(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          sum += px[((y * SS + dy) * B + (x * SS + dx)) * 4 + c];
        }
      }
      out[(y * S + x) * 4 + c] = Math.round(sum / (SS * SS));
    }
  }
}

// --- minimal PNG encoder ---
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filter: none
  Buffer.from(out.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${png.length} bytes)`);
