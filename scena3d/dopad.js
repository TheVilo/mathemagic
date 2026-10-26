// DOPAD KÚZLA (Lukáš 26. 10.: iný efekt podľa kúzla a niečo tam ostane): pixelová animácia na zemi vo farbe živlu + stopa, ktorá pomaly zmizne
// kreslí sa na plátno varovaní (suboj.js drawTele) – v perspektíve zeme, po 3 px (rovnaký raster ako svet)
const FX = [], MARKS = [], CREAM = '#fff6dc';
const PRI = ['π', 'e', 'φ', '!', '³', '²', '√', '÷', '×', '-', '+'];
export const mainOp = info => { const ops = [info.op, ...(info.ops || [])].filter(Boolean); return PRI.find(o => ops.includes(o)) || '+'; };
const hex = c => typeof c === 'string' ? c : '#' + (c >>> 0).toString(16).padStart(6, '0');
export function addImpact(x, z, op, color, pw = 1) {
  const seed = Math.random() * 1000, c = hex(color);
  FX.push({ x, z, op, c, pw: Math.min(2, pw), t: 0, seed });
  MARKS.push({ x, z, op, c, t: 0, seed }); if (MARKS.length > 40) MARKS.shift();
}
const rnd = s => { let a = s * 9301 + 49297; return () => ((a = (a * 9301 + 49297) % 233280) / 233280); };
export function drawImpacts(ctx, P, dt) {
  // DITHER (Lukáš 26. 10.): žiadna priehľadnosť – slabnutie = redšie body podľa Bayerovej mriežky, ako svet
  let DENS = 1; const BAY = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const px = (x, y, c, s = 3) => { const X = Math.round(x), Y = Math.round(y); if (BAY[Y & 3][X & 3] / 16 >= DENS) return; const d = Math.max(1, Math.round(s * 0.67)); ctx.fillStyle = c; ctx.fillRect(X, Y, d, d); };   // bod = 1 px plátna = 2 px obrazovky, rovnako ako dither sveta
  const seg = (a, b, c, s = 3) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]))); for (let i = 0; i <= n; i++) px(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, c, s); };
  const W = (g, dx, dz) => P(g.x + dx, g.z + dz);
  // STOPY na zemi (pod efektmi)
  for (let i = MARKS.length - 1; i >= 0; i--) {
    const m = MARKS[i]; m.t += dt; const life = 7; if (m.t > life) { MARKS.splice(i, 1); continue; }
    DENS = 0.55 * Math.min(1, (life - m.t) / 2); const R = rnd(m.seed), c = m.c;
    if (m.op === '+') for (let k = 0; k < 4; k++) { const a = k * 1.57 + R() * 0.5; let p = W(m, 0, 0); for (let j = 1; j <= 4; j++) { const q = W(m, Math.cos(a + (R() - 0.5) * 0.6) * j * 0.3, Math.sin(a + (R() - 0.5) * 0.6) * j * 0.3); seg(p, q, '#3a3236'); p = q; } }   // praskliny
    else if (m.op === '-') { for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28, q = W(m, Math.cos(a) * 0.7, Math.sin(a) * 0.7); px(q[0], q[1], '#2a2326'); } for (let k = 0; k < 6; k++) { const q = W(m, (R() - 0.5) * 1.2, (R() - 0.5) * 1.2); if (Math.sin(m.t * 8 + k * 2) > 0) px(q[0], q[1], c); } }   // spálenisko + žeravé uhlíky
    else if (m.op === '÷') { for (let k = 0; k < 40; k++) { const a = R() * 6.28, r = Math.sqrt(R()) * 0.75, q = W(m, Math.cos(a) * r, Math.sin(a) * r * 0.8); px(q[0], q[1], k % 9 ? c : CREAM); } }   // mláka
    else if (m.op === '√') { for (let k = 0; k < 5; k++) { let a = k * 1.256 + R(), x = 0, z = 0, p = W(m, 0, 0); for (let j = 0; j < 5; j++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * 0.25; z += Math.sin(a) * 0.25; const q = W(m, x, z); seg(p, q, '#3b3035'); p = q; } } }   // korene
    else if (m.op === '²' || m.op === '³' || m.op === '!') { const r = 1.1; const q = [W(m, 0, -r), W(m, r, 0), W(m, 0, r), W(m, -r, 0)]; /* štvorec otočený o 45° = v izometrii kosoštvorec na zemi */ for (let k = 0; k < 4; k++) seg(q[k], q[(k + 1) % 4], '#2a2326'); }   // hranatý kráter
    else if (m.op === 'π') { for (let k = 0; k < 32; k++) { const a = k / 32 * 6.28, q = W(m, Math.cos(a) * 1.1, Math.sin(a) * 1.1); if (k % 2) px(q[0], q[1], c); } }
    else if (m.op === 'φ') { for (let k = 0; k < 40; k++) { const a = k * 0.25, r = 0.06 * Math.pow(1.618, a / 1.57); if (r > 1.2) break; const q = W(m, Math.cos(a) * r, Math.sin(a) * r); px(q[0], q[1], c); } }
    else { for (let k = 0; k < 6; k++) { const a = k * 1.047 + R(), q = W(m, Math.cos(a) * 0.5, Math.sin(a) * 0.5), o = W(m, 0, 0); seg(o, q, '#2a2326'); } }   // × a e: spálená hviezda
  }
  // EFEKTY DOPADU
  for (let i = FX.length - 1; i >= 0; i--) {
    const f = FX[i]; f.t += dt; const D = f.op === '-' ? 0.75 : f.op === 'π' || f.op === 'φ' ? 0.7 : 0.55; if (f.t > D) { FX.splice(i, 1); continue; }
    const k = f.t / D, R = rnd(f.seed), c = f.c, s = 1 + f.pw * 0.4, o = W(f, 0, 0);
    if (f.t < 0.14) { const r = 22 * s * (1 - f.t / 0.14); for (let y = -r; y <= r; y += 1) for (let x = -r; x <= r; x += 1) { const d = Math.sqrt(x * x + y * y * 2) / r; if (d < 1) { DENS = 1.15 - d; px(o[0] + x, o[1] + y, d < 0.5 ? CREAM : c); } } }   // záblesk: plný stred, ditherom do strán
    DENS = 1 - Math.max(0, (k - 0.5) / 0.5);
    switch (f.op) {
      case '+': for (let a = 0; a < 4; a++) { const an = a * 1.57 + 0.78; seg(o, W(f, Math.cos(an) * 1.6 * s * Math.min(1, k * 3), Math.sin(an) * 1.6 * s * Math.min(1, k * 3)), c, 3); }
        for (let n = 0; n < 8; n++) { const an = R() * 6.28, v = 0.6 + R(), q = W(f, Math.cos(an) * k * 1.5 * v, Math.sin(an) * k * 1.5 * v); px(q[0], q[1] - Math.sin(k * Math.PI) * 40 * v, n % 2 ? c : '#5a4c50', 6); } break;   // kamene vyletia
      case '-': for (let n = 0; n < 14; n++) { const an = R() * 6.28, r = R() * 0.9 * s, q = W(f, Math.cos(an) * r, Math.sin(an) * r), h = (20 + R() * 40) * Math.sin(Math.min(1, k * 1.4) * Math.PI); for (let y = 0; y < h; y += 3) px(q[0] + Math.sin(y * 0.2 + f.t * 20 + n) * 3, q[1] - y, y > h * 0.6 ? CREAM : c); } break;   // plamene
      case '×': { const L = 2 * s * Math.min(1, k * 2.5); seg(W(f, -L, -L * 0.6), W(f, L, L * 0.6), c, 3); seg(W(f, -L, L * 0.6), W(f, L, -L * 0.6), c, 3);
        for (let n = 0; n < 16; n++) { const an = n / 16 * 6.28 + k * 3, q = W(f, Math.cos(an) * k * 2.4 * s, Math.sin(an) * k * 2.4 * s); px(q[0], q[1], CREAM); } break; }   // švih + vietor
      case '÷': for (let n = 0; n < 14; n++) { const an = R() * 6.28, v = 0.5 + R(), q = W(f, Math.cos(an) * k * 1.8 * v, Math.sin(an) * k * 1.8 * v); px(q[0], q[1] - Math.sin(k * Math.PI) * 50 * v, n % 3 ? c : CREAM, 6); } break;   // kvapky
      case '√': for (let n = 0; n < 6; n++) { let an = n * 1.05 + R(), x = 0, z = 0, p = o; for (let j = 0; j < 7 * Math.min(1, k * 2); j++) { an += (R() - 0.5) * 0.8; x += Math.cos(an) * 0.3; z += Math.sin(an) * 0.3; const q = W(f, x, z); seg(p, q, c, 3); p = q; } } break;   // korene vyrastú
      case '²': case '³': case '!': { const n = f.op === '²' ? 2 : f.op === '³' ? 3 : 4; for (let j = 0; j < n; j++) { const kk = k - j * 0.12; if (kk <= 0) continue; const r = kk * 4 * s; const q = [W(f, 0, -r), W(f, r, 0), W(f, 0, r), W(f, -r, 0)]; for (let e = 0; e < 4; e++) seg(q[e], q[(e + 1) % 4], j ? c : CREAM, 3); } break; }   // hranatá rázová vlna
      case 'π': for (let n = 0; n < 48; n++) { const an = n / 48 * 6.28, q = W(f, Math.cos(an) * Math.PI * Math.min(1, k * 2), Math.sin(an) * Math.PI * Math.min(1, k * 2)); px(q[0], q[1], n % 4 ? c : CREAM, 3); } break;
      case 'e': for (let n = 0; n < 5; n++) { let an = R() * 6.28, p = o, x = 0, z = 0; for (let j = 0; j < 6; j++) { an += (R() - 0.5) * 1.4; x += Math.cos(an) * 0.4; z += Math.sin(an) * 0.4; const q = W(f, x, z); if (Math.sin(f.t * 60 + n) > -0.3) seg(p, q, j % 2 ? c : CREAM, 3); p = q; } } break;   // blesky
      case 'φ': for (let n = 0; n < 60 * Math.min(1, k * 1.6); n++) { const an = n * 0.2 + f.t * 4, r = 0.05 * Math.pow(1.618, an / 1.57 - f.t * 4 / 1.57); if (r > 2.5) break; const q = W(f, Math.cos(an) * r, Math.sin(an) * r); px(q[0], q[1], n % 5 ? c : CREAM, 3); } break;   // zlatá špirála
    }
  }
  DENS = 1;
}
export const clearImpacts = () => { FX.length = 0; MARKS.length = 0; };
export const fxCount = () => [FX.length, MARKS.length];
