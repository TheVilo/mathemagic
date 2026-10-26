// MÁGIA SVETOV (Majster): každý svet má matematický pojem, ktorý je VIDNO – svietiace číslice vo vzduchu a tvary na zemi.
// Svet ostáva čiernobiely (1-bit), farebná je len mágia (vrstva 4, ako kúzla). Bez svetiel – len žiariace tvary (výkon).
import { THREE, camera, PIX } from './svet.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// pixelová číslica z písma 5×7 ako 3D tvar (kocky), stred v strede znaku
const GLY = {};
function glyphGeo(ch) {
  if (GLY[ch]) return GLY[ch];
  const bits = PIX[ch] || PIX['?'], parts = [];
  for (let i = 0; i < 35; i++) if (bits[i] === '1') parts.push(new THREE.BoxGeometry(1, 1, 0.6).translate((i % 5) - 2, 3 - ((i / 5) | 0), 0));
  return (GLY[ch] = mergeGeometries(parts).scale(0.1, 0.1, 0.1));
}
const mat = c => new THREE.MeshBasicMaterial({ color: c });
const glow = o => { o.traverse(x => x.layers.enable(4)); return o; };
// čiara na zemi (svietiaca) z bodu a do bodu b
function line(g, a, b, h, c, w = 0.07) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]), m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), mat(c));
  m.position.set((a[0] + b[0]) / 2, h((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) + 0.06, (a[1] + b[1]) / 2); m.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]); g.add(m); return m;
}
function glyph(g, ch, x, y, z, c, s = 1) { const m = new THREE.Mesh(glyphGeo(ch), mat(c)); m.position.set(x, y, z); m.scale.setScalar(s); g.add(m); return m; }

// SVETY: id, názov, pravidlo zóny (výsledok, ktorý ho spĺňa, zraní ×2), farba mágie, číslice vo vzduchu, tvar na zemi
const PYTH = new Set(); for (let a = 1; a < 60; a++) for (let b = a; b < 60; b++) { const c = Math.hypot(a, b); if (Number.isInteger(c) && c <= 100) PYTH.add(c); }
const FIB = new Set([1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987]);
const isPrime = n => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
export const WORLDS = [
  { id: 'les', name: 'Les prirodzených čísel', rule: null, col: 0x8dff98, air: '123456789', mark: 'svetlusky' },
  { id: 'hory', name: 'Šesťuholníkové štíty', rule: { t: 'párne výsledky ×2', f: n => n > 0 && n % 2 === 0 }, col: 0x9fd8ff, air: '2468', mark: 'hex' },
  { id: 'ruiny', name: 'Pytagorove ruiny', rule: { t: 'prepony a²+b²=c² ×2 (5, 10, 13…)', f: n => PYTH.has(n) }, col: 0xffd25a, air: '345', mark: 'pyth' },
  { id: 'dungeon', dark: true, name: 'Kobka trojok', rule: { t: 'násobky 3 ×2', f: n => n > 0 && n % 3 === 0 }, col: 0xb07ad8, air: '369', mark: 'runy' },
  { id: 'haj', name: 'Fibonacciho háj', rule: { t: 'Fibonacciho čísla ×2 (1, 2, 3, 5, 8, 13…)', f: n => FIB.has(n) }, col: 0xf0c040, air: '1235813', mark: 'spirala' },
  { id: 'sopka', dark: true, name: 'Sopka prvočísel', rule: { t: 'prvočísla ×2', f: isPrime }, col: 0xff7a3a, air: '235711', mark: 'ziar', rise: true },
  { id: 'kruhy', name: 'Kruhy π', rule: { t: 'násobky 7 ×2 (22 ÷ 7 ≈ π)', f: n => n > 0 && n % 7 === 0 }, col: 0xc8a8ff, air: 'π314159', mark: 'kruhy' },
  { id: 'hrad', dark: true, name: 'Hrad štvorcov', rule: { t: 'štvorce ×2 (1, 4, 9, 16…)', f: n => n > 0 && Number.isInteger(Math.sqrt(n)) }, col: 0xf2efe6, air: '²149', mark: 'kocky' },
];
export const worldOf = z => WORLDS[(z - 1) % WORLDS.length];

// predmety sveta: stromy a kríky sa vymenia za to, čo k svetu patrí (rovnaké modely, iný svet)
export function themeProps(R, b, rnd) {
  const pk = a => a[Math.floor(rnd() * a.length)];
  const MAP = {
    hory: m => m.startsWith('tree_') ? pk(['tree_pineDefaultA', 'tree_pineRoundB', 'tree_cone', 'tree_pineTallA']) : m.startsWith('plant_bush') || m.startsWith('mushroom') ? pk(['rock_smallA', 'rock_smallB', 'rock_smallFlatA']) : m,
    ruiny: m => m.startsWith('tree_') ? pk(['statue_column', 'statue_columnDamaged', 'statue_block', 'tree_thin']) : m.startsWith('plant_bush') ? pk(['rock_smallA', 'statue_block', 'rock_smallFlatA']) : m,
    dungeon: m => m.startsWith('tree_') ? pk(['barrel_large', 'crates_stacked', 'shelves', 'keg']) : m.startsWith('rock_tall') || m.startsWith('rock_large') ? pk(['wall', 'wall_corner', 'wall']) : m.startsWith('plant_bush') ? pk(['box_small', 'barrel_large']) : m,
    haj: m => m.startsWith('tree_') ? pk(['tree_fat', 'tree_oak', 'tree_detailed', 'tree_default']) : m,
    sopka: m => m.startsWith('tree_') ? pk(['stump_oldTall', 'rock_tallA', 'rock_tallB']) : m.startsWith('plant_bush') || m.startsWith('mushroom') ? pk(['rock_smallA', 'rock_smallC', 'rock_smallFlatA']) : m.startsWith('log') ? 'rock_largeC' : m,
    kruhy: m => m.startsWith('tree_') ? pk(['rock_tallA', 'rock_tallB', 'tree_thin']) : m.startsWith('plant_bush') ? pk(['rock_smallA', 'rock_smallB']) : m,
    hrad: m => m.startsWith('tree_') ? pk(['wall', 'wall_corner', 'statue_obelisk', 'statue_block']) : m.startsWith('plant_bush') || m.startsWith('mushroom') ? pk(['box_small', 'barrel_large', 'statue_block']) : m,
  }[b.id];
  if (!MAP) return;
  for (const p of R.props) p.m = MAP(p.m);
  R.flowers = b.id === 'haj' ? R.flowers : [];
  R.grass = b.id === 'haj' || b.id === 'les' ? R.grass : R.grass.filter((_, i) => i % (b.id === 'hory' || b.id === 'ruiny' ? 4 : 99) === 0);
}

// postaví mágiu sveta do skupiny room; vráti update(t, dt)
export function buildMagic(room, R, b, rnd) {
  const g = new THREE.Group(); room.add(g);
  const h = R.height, c = b.col, spots = [];
  // miesta pre znaky na zemi: náhodne vo svete, ďalej od seba
  for (let k = 0; k < 400 && spots.length < 9; k++) { const x = 6 + rnd() * (R.W - 12), z = 6 + rnd() * (R.H - 12); if (R.inside(x, z) && spots.every(s => Math.hypot(s[0] - x, s[1] - z) > 14)) spots.push([x, z]); }
  const spin = [];
  for (const [x, z] of spots) {
    if (b.mark === 'pyth') {   // trojuholník 3-4-5 (×1,2) s číslami strán
      const k = 1.2, a = rnd() * 6.28, R2 = (dx, dz) => [x + dx * Math.cos(a) - dz * Math.sin(a), z + dx * Math.sin(a) + dz * Math.cos(a)];
      const A = R2(0, 0), B = R2(4 * k, 0), C = R2(0, 3 * k);
      line(g, A, B, h, c); line(g, A, C, h, c); line(g, B, C, h, c);
      [['4', R2(2 * k, -0.6)], ['3', R2(-0.6, 1.5 * k)], ['5', R2(2.3 * k, 1.9 * k)]].forEach(([ch, p]) => spin.push(glyph(g, ch, p[0], h(p[0], p[1]) + 0.9, p[1], c, 1.4)));
    } else if (b.mark === 'hex') {   // šesťuholník (snehová vločka má 6 ramien)
      const r = 2.2; for (let i = 0; i < 6; i++) { const a1 = i / 6 * 6.283, a2 = (i + 1) / 6 * 6.283; line(g, [x + Math.cos(a1) * r, z + Math.sin(a1) * r], [x + Math.cos(a2) * r, z + Math.sin(a2) * r], h, c); line(g, [x, z], [x + Math.cos(a1) * r * 0.7, z + Math.sin(a1) * r * 0.7], h, c, 0.04); }
      spin.push(glyph(g, '6', x, h(x, z) + 1.4, z, c, 1.6));
    } else if (b.mark === 'runy' || b.mark === 'kruhy') {   // kruh s číslami po obvode (π: polomer π m)
      const r = b.mark === 'kruhy' ? Math.PI : 2, n = 24;
      for (let i = 0; i < n; i++) { const a1 = i / n * 6.283, a2 = (i + 1) / n * 6.283; line(g, [x + Math.cos(a1) * r, z + Math.sin(a1) * r], [x + Math.cos(a2) * r, z + Math.sin(a2) * r], h, c, 0.06); }
      const digs = b.mark === 'kruhy' ? '31415926' : '369369';
      [...digs].forEach((ch, i) => { const a = i / digs.length * 6.283; spin.push(glyph(g, ch, x + Math.cos(a) * (r + 0.6), h(x, z) + 0.5, z + Math.sin(a) * (r + 0.6), c, 1)); });
      spin.push(glyph(g, b.mark === 'kruhy' ? 'π' : '3', x, h(x, z) + 1.6, z, c, 2));
    } else if (b.mark === 'spirala') {   // zlatá špirála kryštálov: uhol 137,5°, polomer √n (ako semienka slnečnice)
      for (let n = 1; n <= 34; n++) { const a = n * 2.39996, r = 0.42 * Math.sqrt(n), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, s = FIB.has(n) ? 1.6 : 0.8;
        const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.12 * s, 0), mat(c)); cr.scale.y = 1.8; cr.position.set(px, h(px, pz) + 0.2 * s, pz); g.add(cr); }
      spin.push(glyph(g, 'φ', x, h(x, z) + 1.8, z, c, 1.8));
    } else if (b.mark === 'kocky') {   // štvorce: 1, 4, 9 kociek vo štvorci
      [1, 2, 3].forEach((n, i) => { for (let a = 0; a < n; a++) for (let d = 0; d < n; d++) { const cb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat(c)), px = x - 3 + i * 2.4 + a * 0.38, pz = z + d * 0.38; cb.position.set(px, h(px, pz) + 0.2, pz); g.add(cb); }
        spin.push(glyph(g, String(n * n), x - 3 + i * 2.4 + (n - 1) * 0.19, h(x, z) + 1.3, z + (n - 1) * 0.19, c, 1.2)); });
    } else if (b.mark === 'ziar') {   // pukliny so žiarou + prvočíslo nad nimi
      for (let i = 0; i < 5; i++) { const a = rnd() * 6.28, l = 1 + rnd() * 2; line(g, [x, z], [x + Math.cos(a) * l, z + Math.sin(a) * l], h, c, 0.09); }
      spin.push(glyph(g, ['2', '3', '5', '7'][Math.floor(rnd() * 4)], x, h(x, z) + 1.2, z, c, 1.6));
    }
  }
  // ČÍSLICE VO VZDUCHU (svetlušky mágie): vznášajú sa, v sopke stúpajú ako iskry
  const air = [], N = 140;
  // SVETLUŠKY MÁGIE: drobné svietiace iskry (nie číslice – tie by vyzerali ako niečo na zbieranie), v sopke stúpajú ako žeravé uhlíky
  const mote = new THREE.OctahedronGeometry(0.06, 0);
  for (let i = 0; i < N; i++) { const x = 4 + rnd() * (R.W - 8), z = 4 + rnd() * (R.H - 8), m = new THREE.Mesh(mote, mat(c)); m.scale.setScalar(0.7 + rnd() * 1.2); g.add(m); air.push({ m, x, z, y0: h(x, z) + 0.4 + rnd() * 2.2, ph: rnd() * 6.28, sp: 0.3 + rnd() * 0.5 }); }
  glow(g);
  return {
    spots,
    update(t) {
      const q = camera.quaternion;
      for (const a of air) {
        const y = b.rise ? a.y0 + ((t * a.sp * 0.8 + a.ph) % 3.5) : a.y0 + Math.sin(t * a.sp + a.ph) * 0.35;
        a.m.position.set(a.x + Math.sin(t * 0.3 + a.ph) * 0.6, y, a.z + Math.cos(t * 0.25 + a.ph) * 0.6); a.m.rotation.y = t * 2 + a.ph; a.m.visible = (Math.sin(t * 1.7 + a.ph * 3) > -0.3);
        if (b.rise) a.m.visible = ((t * a.sp * 0.8 + a.ph) % 3.5) < 3.2;
      }
      for (const m of spin) { m.quaternion.copy(q); m.position.y += Math.sin(t * 1.4 + m.position.x) * 0.002; }
    },
  };
}
