// Logika kreslí do nízkeho rozlíšenia 320×180: jas (B), akcent (C), svetlo (L), hĺbka (D).
// Výsledok ide do WebGL (plusový raster + hĺbka ostrosti + žiara), bez WebGL do 2D záložného rastra.
export const W = 320, H = 180, N = W * H;
export const B = new Float32Array(N);
export const C = new Uint8Array(N);
export const L = new Float32Array(N);
export const D = new Float32Array(N);
export const SY = new Uint8Array(N);   // znamienko pixelu (materiál)

// Znamienka: každý pixel sa vykreslí ako jedno z nich; veľkosť = tma, farba = materiál.
export const Z = { PLUS: 0, MINUS: 1, TIMES: 2, DIV: 3, EQ: 4, DOT: 5, CLOAK: 6, GRASS: 7 };
let cs = 0;
export function sym(v) { cs = v; }

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const TH = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) TH[y * W + x] = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

export const A = { RED: 1, GREEN: 2, ICE: 3, YELLOW: 4, ORANGE: 5, PAPER: 6 };
export const PAL = [[13, 17, 23], [212, 58, 58], [96, 190, 104], [140, 200, 232], [236, 206, 90], [236, 128, 50], [226, 222, 212]];

let cd = 0;
export function depth(v) { cd = v; }

// ---------- šum ----------
export function hash(x, y, z = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const sm = t => t * t * (3 - 2 * t);
export function vnoise(x, y, z = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
  const a0 = hash(xi, yi, zi), a1 = hash(xi + 1, yi, zi), a2 = hash(xi, yi + 1, zi), a3 = hash(xi + 1, yi + 1, zi);
  const b0 = hash(xi, yi, zi + 1), b1 = hash(xi + 1, yi, zi + 1), b2 = hash(xi, yi + 1, zi + 1), b3 = hash(xi + 1, yi + 1, zi + 1);
  const a = (a0 + (a1 - a0) * u) + ((a2 + (a3 - a2) * u) - (a0 + (a1 - a0) * u)) * v;
  const b = (b0 + (b1 - b0) * u) + ((b2 + (b3 - b2) * u) - (b0 + (b1 - b0) * u)) * v;
  return a + (b - a) * w;
}
export function fbm(x, y, z = 0) {
  return vnoise(x, y, z) * 0.57 + vnoise(x * 2, y * 2, z * 2) * 0.29 + vnoise(x * 4, y * 4, z * 4) * 0.14;
}
// Pole šumu v hrubej mriežke (každé 4 px) – pre pohyblivé zhluky a hĺbku.
const GW = 82, GH = 47;
const grid = new Float32Array(GW * GH), grid2 = new Float32Array(GW * GH);
export function clusterField(t, scale = 0.11, speed = 0.12) {
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    grid[gy * GW + gx] = fbm(gx * scale + t * speed * 0.6, gy * scale - t * speed * 0.3, t * speed);
    grid2[gy * GW + gx] = vnoise(gx * 0.07 + 40, gy * 0.07 - t * 0.03, 3);
  }
}
function sample(g, x, y) {
  const fx = x / 4, fy = y / 4, ix = fx | 0, iy = fy | 0, u = fx - ix, v = fy - iy, i = iy * GW + ix;
  const a = g[i], b = g[i + 1], c = g[i + GW], d = g[i + GW + 1];
  return a + (b - a) * u + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}
export const fieldAt = (x, y) => sample(grid, x, y);
export const field2At = (x, y) => sample(grid2, x, y);

// ---------- primitíva ----------
function put(i, b, a) { B[i] = b; C[i] = a; D[i] = cd; SY[i] = cs; }
export function clear(b) { B.fill(b); C.fill(0); D.fill(cd); SY.fill(cs); }
export function px(x, y, b) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; put(y * W + x, b, 0); }
export function pa(x, y, a, s = 0.72) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; put(y * W + x, s, a); }
export function rect(x, y, w, h, b) {
  x |= 0; y |= 0;
  for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) put(j * W + i, b, 0);
}
export function rectA(x, y, w, h, a, s = 0.72) {
  x |= 0; y |= 0;
  for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) put(j * W + i, s, a);
}
// Elipsa osvetlená zľava zhora – raster z nej spraví bodkovaný prechod.
export function shadeEllipse(cx, cy, rx, ry, base, amp, outline = 0.04, tex = 0, acc = 0) {
  const lx = -0.5, ly = -0.62, lz = 0.6;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny;
    if (d > 1) continue;
    const i = y * W + x;
    if (outline >= 0 && d > 0.8) { put(i, outline, 0); continue; }
    const nz = Math.sqrt(1 - d);
    let b = base + amp * Math.max(0, nx * lx + ny * ly + nz * lz);
    if (tex) b += (hash(x, y, 7) - 0.5) * tex;
    put(i, b, acc);
  }
}
export function mulEllipse(cx, cy, rx, ry, f) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny;
    if (d <= 1) B[y * W + x] *= f + (1 - f) * d * d; // mäkký okraj tieňa
  }
}
export function glow(cx, cy, r, s) {
  const k = 6 / (r * r);
  for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, cy + r); y++) for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, cx + r); x++) {
    const d2 = (x - cx) ** 2 + (y - cy) ** 2;
    if (d2 > r * r) continue;
    L[y * W + x] += s * (1 - d2 / (r * r)) / (1 + k * d2);
  }
}
// Kúzelná guľa: jadro svieti takmer do biela, okraj sa rozpadá do rastra.
export function orb(cx, cy, r, acc, power = 1) {
  const R2 = r * 1.7;
  for (let y = Math.floor(cy - R2); y <= cy + R2; y++) for (let x = Math.floor(cx - R2); x <= cx + R2; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const d = Math.hypot(x - cx, y - cy) / r;
    const i = y * W + x;
    const k = (1.7 - d) / 1.7 * power;
    if (k <= TH[i] * 0.95) continue;
    put(i, d < 0.55 ? 1 : d < 1 ? 0.78 : 0.5, acc);
  }
}
// Rázová vlna: rastrový prstenec.
export function ring(cx, cy, r, w, acc, amt = 1, squash = 1) {
  const R2 = r + w;
  for (let y = Math.floor(cy - R2 * squash); y <= cy + R2 * squash; y++) for (let x = Math.floor(cx - R2); x <= cx + R2; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const d = Math.hypot(x - cx, (y - cy) / squash), e = Math.abs(d - r) / w;
    if (e > 1) continue;
    const i = y * W + x;
    if ((1 - e) * amt > TH[i]) put(i, 0.85, acc);
  }
}

// ---------- sprity ----------
const VAL = { k: 0.02, d: 0.2, m: 0.46, l: 0.7, w: 0.97, h: 0.2, s: 0.34, c: 0.58 };
const ACH = { R: A.RED, G: A.GREEN, I: A.ICE, Y: A.YELLOW, O: A.ORANGE, P: A.PAPER };
export function makeSprite(rows) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const v = new Float32Array(w * h).fill(-1), a = new Uint8Array(w * h), hat = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    const i = y * w + x;
    if (ch in VAL) { v[i] = VAL[ch]; if (ch === 'h') hat[i] = 1; }
    else if (ch in ACH) { v[i] = 0.72; a[i] = ACH[ch]; }
  }));
  return { w, h, v, a, hat };
}
// Sprite z kódovaných riadkov (0–8 jas, 9 oči, C kryštál). Kryštál sa farbí cez voľbu `hat`.
export function codeSprite(rows) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const v = new Float32Array(w * h).fill(-1), a = new Uint8Array(w * h), hat = new Uint8Array(w * h), sy = new Int8Array(w * h).fill(-1);
  let cx = 0, cy = 0, cn = 0;
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    const i = y * w + x;
    if (ch === '.') return;
    if ('abc'.includes(ch)) { v[i] = 0.03 + (3 + 'abc'.indexOf(ch)) / 8 * 0.86; sy[i] = Z.CLOAK; return; }
    if (ch === 'C') { v[i] = 0.74 - (cn % 3) * 0.08; a[i] = A.PAPER; hat[i] = 1; cx += x; cy += y; cn++; return; }
    v[i] = ch === '9' ? 0.97 : 0.03 + (+ch) / 8 * 0.86;
  }));
  return { w, h, v, a, hat, sy, cx: cn ? cx / cn : w / 2, cy: cn ? cy / cn : 4 };
}
export function buildSprite(w, h, paint) {
  const v = new Float32Array(w * h).fill(-1), a = new Uint8Array(w * h), hat = new Uint8Array(w * h);
  paint((x, y, b, acc = 0) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return; v[y * w + x] = b; a[y * w + x] = acc; });
  return { w, h, v, a, hat };
}
export function sprite(s, x, y, o = {}) {
  const sc = o.scale || 1, flip = o.flip, dis = o.dissolve || 0, flash = o.flash || 0, hatA = o.hat || 0, sy0 = o.squash || 1;
  x = Math.round(x); y = Math.round(y);
  const hh = Math.round(s.h * sc * sy0), off = s.h * sc - hh;
  for (let ty = 0; ty < hh; ty++) {
    const sy = Math.min(s.h - 1, Math.floor(ty / (sc * sy0)));
    for (let sx = 0; sx < s.w; sx++) {
      const si = sy * s.w + sx, val = s.v[si];
      if (val < 0) continue;
      const dx = flip ? s.w - 1 - sx : sx;
      for (let i = 0; i < sc; i++) {
        const X = x + dx * sc + i, Y = y + off + ty;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const ti = Y * W + X;
        if (dis > 0 && TH[ti] < dis) continue;
        if (flash > 0 && TH[ti] < flash) { put(ti, 1, 0); continue; }
        let acc = s.a[si];
        if (s.hat[si] && hatA) acc = hatA;
        put(ti, val, acc);
        if (s.sy && s.sy[si] >= 0) SY[ti] = s.sy[si];
      }
    }
  }
}

// ---------- 3×5 písmo pre číslice ----------
export const GLYPH = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111', '+': '000010111010000', '-': '000000111000000',
};
export function glyph(ch, x, y, sc, b, acc = 0, s = 0.72) {
  const g = GLYPH[ch]; if (!g) return;
  for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') {
    if (acc) rectA(x + i * sc, y + j * sc, sc, sc, acc, s); else rect(x + i * sc, y + j * sc, sc, sc, b);
  }
}
export function glyphPoints(ch, cx, cy, sc, step) {
  const g = GLYPH[ch], pts = [];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1')
    for (let yy = 0; yy < sc; yy += step) for (let xx = 0; xx < sc; xx += step)
      pts.push([cx - 1.5 * sc + i * sc + xx, cy - 2.5 * sc + j * sc + yy]);
  return pts;
}

// ---------- balenie pre WebGL: R = jas, G = akcent, B = hĺbka ----------
const ROWD = new Float32Array(H);
export function pack(out, focusY = -1) {
  if (focusY >= 0) for (let y = 0; y < H; y++) {
    const e = Math.max(0, (Math.abs(y - focusY) - 34) / 78);
    ROWD[y] = Math.min(0.85, e * e * 1.4 + e * 0.3);
  } else ROWD.fill(0);
  for (let i = 0, o = 0, y = 0, x = 0; i < N; i++, o += 4) {
    const a = C[i];
    let v = a ? B[i] * (0.75 + 0.25 * Math.min(1.4, L[i])) : B[i] * L[i];
    out[o] = v <= 0 ? 0 : v >= 1 ? 255 : v * 255;
    out[o + 1] = a;
    const dd = Math.max(D[i], ROWD[y]);
    out[o + 2] = dd * 255;
    out[o + 3] = SY[i];
    if (++x === W) { x = 0; y++; }
  }
}

// ---------- záložný 2D raster (bez WebGL), 640×360 ----------
export const OW = W * 2, OH = H * 2;
const CELL = 5, PLUS = new Float32Array(CELL * CELL);
{
  const pr = [];
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const dx = Math.abs(x - 2), dy = Math.abs(y - 2);
    pr.push([Math.min(dx, dy) * 3 + Math.max(dx, dy) + hash(x, y, 3) * 0.01, y * CELL + x]);
  }
  pr.sort((a, b) => a[0] - b[0]).forEach(([, i], r) => { PLUS[i] = (r + 0.5) / (CELL * CELL); });
}
const HT = new Float32Array(OW * OH);
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  const row = Math.floor(y / CELL);
  HT[y * OW + x] = PLUS[(y % CELL) * CELL + ((x + (row & 1) * 2) % CELL)];
}
export function compose2d(img, packed, fade = 0) {
  const d = img.data;
  for (let Y = 0, o = 0; Y < OH; Y++) {
    const rowI = (Y >> 1) * W;
    for (let X = 0; X < OW; X++, o += 4) {
      const i = (rowI + (X >> 1)) * 4, ht = HT[Y * OW + X], v = packed[i] / 255, a = packed[i + 1];
      if (fade > 0 && ht < fade) { d[o] = 13; d[o + 1] = 17; d[o + 2] = 23; d[o + 3] = 255; continue; }
      if (a) {
        const p = PAL[a], k = v < 0.5 ? 0.42 + v * 1.16 : 1, m = v < 0.5 ? 0 : Math.min(0.85, (v - 0.5) * 1.6);
        d[o] = p[0] * k * (1 - m) + 255 * m; d[o + 1] = p[1] * k * (1 - m) + 248 * m; d[o + 2] = p[2] * k * (1 - m) + 230 * m; d[o + 3] = 255;
        continue;
      }
      let g = 96 + v * 140;
      if (1 - v > ht + 0.04) g -= 46 + (1 - v) * 40;
      d[o] = g - 3; d[o + 1] = g - 3; d[o + 2] = g; d[o + 3] = 255;
    }
  }
}
