// MÁGIA SVETOV (Majster): každý svet má matematický pojem, ktorý je VIDNO – svietiace číslice vo vzduchu a tvary na zemi.
// Svet ostáva čiernobiely (1-bit), farebná je len mágia (vrstva 4, ako kúzla). Bez svetiel – len žiariace tvary (výkon).
import { THREE, camera, PIX } from './svet.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addWorldLight, clearWorldLights } from './kresba.js';

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
  if (MAP) for (const p of R.props) p.m = MAP(p.m);
  landmarks(R, b, rnd, pk);
  R.flowers = b.id === 'haj' ? R.flowers : [];
  R.grass = R.grass.filter((_, i) => i % 6 === 0);   // Kenney tráva len ojedinele – zem kreslia ťahy (groundStrokes)
}

// DOMINANTY: obri (stromy/skaly/stĺpy niekoľkonásobne väčšie ako zvyčajne) a dedinka v otvorených svetoch – mierka a miesto, kam ísť
const GIANT = { les: ['tree_oak', 'tree_fat', 'tree_detailed'], haj: ['tree_fat', 'tree_oak'], hory: ['tree_pineTallA', 'rock_tallA', 'rock_tallB'], ruiny: ['statue_column', 'statue_columnDamaged', 'rock_tallB'], dungeon: ['statue_column', 'statue_obelisk'], sopka: ['rock_tallA', 'rock_tallB', 'stump_oldTall'], kruhy: ['rock_tallA', 'statue_obelisk'], hrad: ['statue_obelisk', 'statue_column'] };
const TOWN = { les: 1, haj: 1, ruiny: 1, kruhy: 1, hory: 1 };
function landmarks(R, b, rnd, pk) {
  const far = (x, z, d) => Math.hypot(x - R.start[0], z - R.start[1]) > 9 && (R.camps || []).every(c => Math.hypot(c.x - x, c.z - z) > d + 4) && R.inside(x, z);
  const clear = (x, z, r) => { R.props = R.props.filter(p => Math.hypot(p.x - x, p.z - z) > r + p.col * p.s); };
  const areas = R.areas.filter(a => a.kind !== 'start' && a.kind !== 'boss');
  for (let i = areas.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [areas[i], areas[k]] = [areas[k], areas[i]]; }
  // dedinka: krčma, veže, studňa, trh okolo námestia (námestie bez predmetov)
  if (TOWN[b.id] && areas.length) {
    const a = areas.shift(), cx = a.cx, cz = a.cz;
    if (far(cx, cz, 6)) {
      clear(cx, cz, 7.5);
      R.props.push({ m: 'building_well_blue', x: cx, z: cz, s: 1, r: rnd() * 6.28, col: 1.1 });
      const ring = ['building_tavern_blue', 'building_tower_A_blue', 'building_market_blue', 'building_tower_B_blue', 'building_market_blue'];
      ring.forEach((m, i) => { const an = i / ring.length * 6.283 + rnd() * 0.4, d = 5 + rnd() * 1.2, x = cx + Math.cos(an) * d, z = cz + Math.sin(an) * d * 0.8;
        if (z > cz + 3.5 && m === 'building_tavern_blue') return;   // vysoké stavby nie pred kamerou
        if (R.inside(x, z)) R.props.push({ m, x, z, s: 1, r: Math.atan2(cx - x, cz - z), col: m === 'building_tavern_blue' ? 2 : 1.5 }); });
      R.props.push({ m: 'campfire_stones', x: cx + 2.4, z: cz + 2.2, s: 1, r: 0, col: 0.5 });   // ohnisko na námestí
      R.town = { x: cx, z: cz };
    }
  }
  // obri: 3–4 na svet, každý v inej oblasti, uvoľnený priestor okolo
  const kinds = GIANT[b.id] || GIANT.les;
  for (let n = 0, want = 3 + Math.floor(rnd() * 2); areas.length && n < want;) {
    const a = areas.shift(), x = a.cx + (rnd() - 0.5) * 6, z = a.cz - 2 - rnd() * 3;
    if (!far(x, z, 5)) continue;
    const m = pk(kinds), tree = m.startsWith('tree_'), s = tree ? 2.3 + rnd() * 0.6 : 2.6 + rnd() * 1.2;
    clear(x, z, s * 1.1);
    R.props.push({ m, x, z, s, r: rnd() * 6.28, col: tree ? 0.4 : 0.55, giant: true });
    n++; (R.giants = R.giants || []).push({ x, z, s, tree });
  }
}

// postaví mágiu sveta do skupiny room; vráti update(t, dt)
export function buildMagic(room, R, b, rnd) {
  const g = new THREE.Group(); room.add(g);
  const h = R.height, c = b.col, spots = [];
  clearWorldLights();
  const lit = new THREE.Group(); room.add(lit);   // svetlá sveta (plamene, okná, krátery) – NIE vo vrstve kúziel, inak by sa kreslili znamienkami (+ + +)
  const flames = [], FL = new THREE.OctahedronGeometry(0.1, 0), WHITE = mat(0xfff3d6);
  // plameň: 3 svietiace kúsky nad sebou, blikajú; + svetlo sveta (osvetlí okolie, za predmetmi tieň len od palice)
  const flame = (x, y, z, s = 1, k = 1, r = 7) => { const f = new THREE.Group(); for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(FL, WHITE); m.position.y = i * 0.12 * s; m.scale.set(s * (1.3 - i * 0.35), s * (1.8 - i * 0.3), s * (1.3 - i * 0.35)); f.add(m); } f.position.set(x, y, z); lit.add(f); flames.push({ f, ph: rnd() * 6.28 }); if (k > 0) addWorldLight(new THREE.Vector3(x, y + 0.3, z), k, r); };
  // OHNISKÁ: každé ohnisko vo svete horí
  for (const p of R.props) if (p.m === 'campfire_stones') flame(p.x, h(p.x, p.z) + 0.15, p.z, 1.8, 1.2, 9);
  // DEDINKA: niektoré okná svietia (na strane ku kamere)
  if (R.town) for (const p of R.props) if (p.m.startsWith('building_') && p.m !== 'building_well_blue' && Math.hypot(p.x - R.town.x, p.z - R.town.z) < 9 && rnd() < 0.8) {
    const d = (p.col || 1.5) * 0.95, y = h(p.x, p.z);
    for (const [ox, oy] of [[-0.45, 1.3], [0.45, 1.3], [0, 2.4]]) if (rnd() < 0.6) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.05), WHITE); w.position.set(p.x + ox, y + oy, p.z + d); lit.add(w); }
    addWorldLight(new THREE.Vector3(p.x, y + 1.4, p.z + d + 0.6), 0.6, 5, false);
  }
  // KOBKA A HRAD: fakle (stojany s ohňom) pri stenách a po svete
  if (b.id === 'dungeon' || b.id === 'hrad') {
    const walls = R.props.filter(p => /wall|obelisk|column/.test(p.m)); let n = 0;
    for (const p of walls) { if (rnd() > 0.35 || n > 40) continue; const a = rnd() * 6.28, x = p.x + Math.cos(a) * 1.2, z = p.z + Math.sin(a) * 1.2; if (!R.inside(x, z)) continue;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x2a2628 })); post.position.set(x, h(x, z) + 0.75, z); post.castShadow = true; room.add(post);
      flame(x, h(x, z) + 1.55, z, 1.4, 1.5, 9); n++; }
    for (let k = 0; k < 400 && n < 46; k++) { const x = 4 + rnd() * (R.W - 8), z = 4 + rnd() * (R.H - 8); if (!R.inside(x, z) || rnd() > 0.15) continue;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x2a2628 })); post.position.set(x, h(x, z) + 0.75, z); post.castShadow = true; room.add(post); flame(x, h(x, z) + 1.55, z, 1.4, 1.5, 9); n++; }
  }
  // SOPKA (Lukáš 26. 10.: nie lávové cesty): malé sopky so žeravým kráterom, hore veľká sopka, ktorá svieti na celý svet, a veľa tmavých kameňov
  const lava = [];
  if (b.id === 'sopka') {
    const ROCK = new THREE.MeshStandardMaterial({ color: 0x1e1b1c, roughness: 1, flatShading: true }), GLOW = mat(0xffe2b0);
    const volcano = (x, z, r, hh, big) => {
      const y = h(x, z), cone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r, hh, big ? 11 : 7, 3), ROCK);
      const pa = cone.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const k = 1 + (rnd() - 0.5) * 0.18; pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * k); } cone.geometry.computeVertexNormals();
      cone.position.set(x, y + hh / 2 - 0.05, z); cone.castShadow = cone.receiveShadow = true; cone.layers.enable(1); room.add(cone);   // vrstva 1 = ostane tmavá aj vo vlastnom svetle
      const crater = new THREE.Mesh(new THREE.CircleGeometry(r * 0.27, 9), GLOW); crater.rotation.x = -Math.PI / 2; crater.position.set(x, y + hh + 0.02, z); lit.add(crater);
      for (let i = 0; i < (big ? 6 : 2); i++) { const a = rnd() * 6.28, d = rnd() * r * 0.12; flame(x + Math.cos(a) * d, y + hh, z + Math.sin(a) * d, big ? 3.5 : 2, 0, 1); }
      addWorldLight(new THREE.Vector3(x, y + hh + (big ? 3 : 0.8), z), big ? 3.5 : 1.3, big ? 40 : 8);
      if (!big) R.props.push({ m: '_sopka', x, z, s: 1, col: r * 0.9 });   // nedá sa cez ňu prejsť
      lava.push({ x, z, y: y + hh, r, big });
    };
    volcano(R.W * (0.35 + rnd() * 0.3), -14, 16, 13, true);   // veľká sopka za zadným okrajom sveta
    for (let n = 0, k = 0; n < 7 && k < 200; k++) { const x = 6 + rnd() * (R.W - 12), z = 6 + rnd() * (R.H - 12);
      if (!R.inside(x, z) || Math.hypot(x - R.start[0], z - R.start[1]) < 8 || lava.some(v => Math.hypot(v.x - x, v.z - z) < 12)) continue;
      volcano(x, z, 1.8 + rnd() * 1, 1.3 + rnd() * 1.1, false); n++; }
    // tmavé kamene všade (skupinky)
    const rocks = [], o = new THREE.Object3D();
    for (let k = 0; k < 260; k++) { const cx = 2 + rnd() * (R.W - 4), cz = 2 + rnd() * (R.H - 4); if (!R.inside(cx, cz)) continue;
      for (let j = 0, n = 1 + Math.floor(rnd() * 4); j < n; j++) { const x = cx + (rnd() - 0.5) * 1.6, z = cz + (rnd() - 0.5) * 1.6; rocks.push([x, z, 0.12 + rnd() * rnd() * 0.55]); } }
    const rm = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), ROCK, rocks.length);
    rocks.forEach(([x, z, sc], i) => { o.position.set(x, h(x, z) + sc * 0.3, z); o.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); o.scale.set(sc * (0.8 + rnd() * 0.6), sc * 0.7, sc); o.updateMatrix(); rm.setMatrixAt(i, o.matrix); });
    rm.castShadow = rm.receiveShadow = true; rm.layers.enable(1); room.add(rm);
  }
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
  // MÁGIA OBROV: okolo každého obra krúžia veľké kryštály a na zemi je kruh – obri sú staré magické miesta
  const orbit = [];
  for (const gi of R.giants || []) {
    const r = gi.tree ? 2.6 + gi.s * 0.2 : 2 + gi.s * 0.3, y0 = h(gi.x, gi.z);
    for (let i = 0; i < 40; i++) { const a1 = i / 40 * 6.283, a2 = (i + 1) / 40 * 6.283; if (i % 4 !== 3) line(g, [gi.x + Math.cos(a1) * r, gi.z + Math.sin(a1) * r], [gi.x + Math.cos(a2) * r, gi.z + Math.sin(a2) * r], h, c, 0.05); }
    for (let i = 0; i < 3; i++) { const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), mat(c)); cr.scale.y = 1.9; g.add(cr); orbit.push({ m: cr, x: gi.x, z: gi.z, r: r * 0.85, y: y0 + 1.6 + i * 0.9 + (gi.tree ? gi.s * 0.5 : 0), ph: i / 3 * 6.283, sp: 0.35 + rnd() * 0.2 }); }
  }
  // dedinka: lampáše (svietiace kocky) okolo námestia
  if (R.town) for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + 0.3, x = R.town.x + Math.cos(a) * 3, z = R.town.z + Math.sin(a) * 2.4;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a2628 })); post.position.set(x, h(x, z) + 0.65, z); post.castShadow = true; room.add(post);
    const lan = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), mat(c)); lan.position.set(x, h(x, z) + 1.4, z); lit.add(lan); orbit.push({ lan, ph: rnd() * 6.28 }); }
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
      for (const fl of flames) { const k = 0.85 + 0.2 * Math.sin(t * 17 + fl.ph) * Math.sin(t * 9 + fl.ph * 2); fl.f.scale.set(1, k, 1); fl.f.children[2].visible = Math.sin(t * 11 + fl.ph) > -0.5; }
      for (const o of orbit) { if (o.lan) { o.lan.visible = Math.sin(t * 9 + o.ph) > -0.95; continue; } const a = t * o.sp + o.ph; o.m.position.set(o.x + Math.cos(a) * o.r, o.y + Math.sin(t * 1.3 + o.ph) * 0.25, o.z + Math.sin(a) * o.r); o.m.rotation.y = t * 1.5; }
      for (const m of spin) { m.quaternion.copy(q); m.position.y += Math.sin(t * 1.4 + m.position.x) * 0.002; }
    },
  };
}

// ŤAHY NA ZEMI (predloha petitjus): krátke šikmé tmavé čiarky ako tráva kreslená perom – zem má textúru, nie prázdny papier
// v katakombách a hrade namiesto nich drobné kamienky (dlažbu robí textúra zeme)
export function groundStrokes(room, R, b, rnd) {
  const stone = b.id === 'dungeon' || b.id === 'hrad', n = Math.round(R.W * R.H * (stone ? 0.12 : b.id === 'sopka' ? 0.15 : 0.45));
  const geo = stone ? new THREE.BoxGeometry(0.12, 0.05, 0.1) : new THREE.BoxGeometry(0.07, 0.05, 0.5);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: stone ? 0x2a2826 : 0x141312, roughness: 1 }), n);
  const wind = -0.7, o = new THREE.Object3D(); let k = 0;
  for (let i = 0; i < n * 3 && k < n; i++) {
    const x = 1 + rnd() * (R.W - 2), z = 1 + rnd() * (R.H - 2); if (!R.inside(x, z)) continue;
    // trsy: ťahy sa zhlukujú (2–4 vedľa seba), nie rovnomerný šum
    const tuft = 1 + Math.floor(rnd() * 3);
    for (let t = 0; t < tuft && k < n; t++) {
      const px = x + (rnd() - 0.5) * 0.4, pz = z + (rnd() - 0.5) * 0.4;
      o.position.set(px, R.height(px, pz) + 0.03, pz); o.rotation.set(stone ? 0 : 0.5 + rnd() * 0.3, wind + (rnd() - 0.5) * 0.6, 0);
      o.scale.setScalar(0.7 + rnd() * 0.7); o.updateMatrix(); m.setMatrixAt(k++, o.matrix);
    }
  }
  m.count = k; m.receiveShadow = true; room.add(m); return m;
}

// DLAŽBA A CHODNÍKY (skutočné kamene, dither ich vytieňuje): v kobke a hrade dlaždice po celej zemi, inde dláždené chodníky
export function pavement(room, R, b, rnd) {
  const tiles = b.id === 'dungeon' || b.id === 'hrad', o = new THREE.Object3D(), list = [];
  if (tiles) {
    for (let x = 0.5; x < R.W; x += 1) for (let z = 0.5; z < R.H; z += 1) {
      if (!R.inside(x, z) || rnd() < 0.07) continue;   // občas chýba dlaždica
      list.push([x + (rnd() - 0.5) * 0.04, z + (rnd() - 0.5) * 0.04, 0.9, 0.9, (rnd() - 0.5) * 0.05, rnd() < 0.15 ? -0.05 : 0]);
    }
  } else {
    // CHODNÍKY: 3 kľukaté cesty naprieč svetom (krok 0,4 m, šírka ~1,4 m), kamene vedľa seba ako dlážená cesta
    for (let p = 0; p < 3; p++) {
      let x = rnd() * R.W, z = p % 2 ? 2 : R.H - 2, a = p % 2 ? 1.57 : -1.57, wob = rnd() * 6;
      if (p === 2) { x = 2; z = rnd() * R.H; a = 0; }
      for (let st = 0; st < 600; st++) {
        a += Math.sin(st * 0.05 + wob) * 0.035; x += Math.cos(a) * 0.34; z += Math.sin(a) * 0.34;
        if (x < 1 || z < 1 || x > R.W - 1 || z > R.H - 1) break;
        for (let w = -2; w <= 2; w++) {
          const px = x - Math.sin(a) * w * 0.36 + (rnd() - 0.5) * 0.12, pz = z + Math.cos(a) * w * 0.42 + (rnd() - 0.5) * 0.12;
          if (!R.inside(px, pz) || rnd() < (Math.abs(w) > 1 ? 0.45 : 0.06)) continue;   // okraje cesty rozbité
          list.push([px, pz, 0.3 + rnd() * 0.12, 0.26 + rnd() * 0.1, a + (rnd() - 0.5) * 0.6, 0]);
        }
      }
    }
  }
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshStandardMaterial({ color: tiles ? 0x8f8a80 : 0xa39e94, roughness: 1, flatShading: true }), list.length);
  list.forEach(([x, z, sx, sz, r, dy], i) => { o.position.set(x, R.height(x, z) + 0.03 + dy, z); o.rotation.set((rnd() - 0.5) * 0.06, r, (rnd() - 0.5) * 0.06); o.scale.set(sx, 0.6 + rnd() * 0.6, sz); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
  m.receiveShadow = true; m.castShadow = false; room.add(m); return m;
}
