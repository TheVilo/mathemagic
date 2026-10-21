// Otvorený svet zóny: jedna súvislá krajina z 3×3 oblastí, bez prepínania miestností a bez výberu cesty.
// Oblasti oddeľujú prírodné hranice (skaly, les, kríky), priechody tvoria náhodnú kostru + 1–2 slučky navyše.
// Vodca je v najvzdialenejšej slepej oblasti za bránou na kľúče, poklad za bránou s číslom – svet sa dá vždy prejsť.
// Bez grafiky – dá sa testovať v Node.
import { mulberry32, makeNoise } from './gen.js';

export const GW = 3, GH = 3, AW = 30, AH = 22, GAP = 2.6;
const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
function segD(px, pz, a, b) { // vzdialenosť bodu od úsečky
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l)) : 0;
  return Math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz);
}

export function genWorld(seed, zone = 1, opts = {}) {
  const rng = mulberry32(seed * 7919 + zone * 104729 + 3), noise = makeNoise(seed * 13 + zone * 71);
  // rozptyl po mriežke s náhodným posunom (na rozdiel od Poissona pokryje aj oddelené ostrovčeky)
  const poisson = (w, h, r, _rng, ok, max = 1e9) => { const out = []; for (let z = 0; z < h; z += r) for (let x = 0; x < w; x += r) { const px = x + rng() * r * 0.8, pz = z + rng() * r * 0.8; if (ok(px, pz)) out.push([px, pz]); if (out.length >= max) return out; } return out; };
  const W = GW * AW, H = GH * AH, id = (i, j) => j * GW + i;
  const pick = a => a[Math.floor(rng() * a.length)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a; };

  // ---------- oblasti a priechody ----------
  const areas = [];
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) areas.push({ id: id(i, j), i, j, cx: (i + 0.5) * AW + (rng() - 0.5) * 6, cz: (j + 0.5) * AH + (rng() - 0.5) * 4, kind: 'pole', links: [] });
  const nb = a => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => [a.i + di, a.j + dj]).filter(([i, j]) => i >= 0 && j >= 0 && i < GW && j < GH).map(([i, j]) => areas[id(i, j)]);
  const links = [], linked = (a, b) => a.links.includes(b.id);
  const link = (a, b) => { a.links.push(b.id); b.links.push(a.id); links.push({ a: a.id, b: b.id }); };
  const start = areas[id(0, GH - 1)];            // vľavo dole, najbližšie ku kamere
  const seen = new Set([start.id]), stack = [start];
  while (stack.length) {                          // náhodná kostra (DFS) = každá oblasť je dosiahnuteľná
    const a = stack[stack.length - 1], free = shuffle(nb(a).filter(b => !seen.has(b.id)));
    if (!free.length) { stack.pop(); continue; }
    link(a, free[0]); seen.add(free[0].id); stack.push(free[0]);
  }
  const dist = { [start.id]: 0 }, q = [start];
  while (q.length) { const a = q.shift(); for (const k of a.links) if (dist[k] === undefined) { dist[k] = dist[a.id] + 1; q.push(areas[k]); } }
  const leaves = areas.filter(a => a !== start && a.links.length === 1).sort((x, y) => dist[y.id] - dist[x.id]);
  const boss = leaves[0], vault = leaves[1] || null;
  // slučky navyše (nie do vodcu ani do trezoru) – viac ciest
  const extra = shuffle(areas.flatMap(a => nb(a).filter(b => b.id > a.id && !linked(a, b)).map(b => [a, b]))).filter(([a, b]) => ![boss, vault].includes(a) && ![boss, vault].includes(b));
  extra.slice(0, 1 + (rng() < 0.5 ? 1 : 0)).forEach(([a, b]) => link(a, b));
  boss.kind = 'boss'; if (vault) vault.kind = 'zamok'; start.kind = 'start';
  const rest = shuffle(areas.filter(a => a.kind === 'pole')).sort((x, y) => dist[x.id] - dist[y.id]);
  const kinds = ['boj', 'obchod', 'boj', 'poklad', 'boj', 'elita', 'boj'];   // bližšie k štartu ľahšie
  rest.forEach((a, k) => { a.kind = kinds[k] || 'boj'; a.tier = dist[a.id] / Math.max(...Object.values(dist)); });
  const areaAt = (x, z) => areas[id(Math.min(GW - 1, Math.max(0, Math.floor(x / AW))), Math.min(GH - 1, Math.max(0, Math.floor(z / AH))))];

  // priechod = otvor v hranici medzi dvoma susedmi
  for (const l of links) {
    const a = areas[l.a], b = areas[l.b];
    if (a.j === b.j) { l.axis = 'v'; l.x = Math.max(a.i, b.i) * AW; l.z = a.j * AH + AH * (0.3 + rng() * 0.4); }
    else { l.axis = 'h'; l.z = Math.max(a.j, b.j) * AH; l.x = a.i * AW + AW * (0.28 + rng() * 0.44); }
  }
  const linkOf = (p, r) => links.find(l => (l.a === p.id && l.b === r.id) || (l.b === p.id && l.a === r.id));
  // steny = úsečky hraníc bez otvorov (o: v/h smer, kraj: n/s/w/e)
  const walls = [];
  const wall = (a, b, o, own) => { if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.2) walls.push({ a, b, o, own }); };
  for (let j = 0; j < GH; j++) for (let i = 1; i < GW; i++) {
    const L = linkOf(areas[id(i - 1, j)], areas[id(i, j)]), x = i * AW, z0 = j * AH, z1 = z0 + AH, own = [id(i - 1, j), id(i, j)];
    if (L) { wall([x, z0], [x, L.z - GAP], 'v', own); wall([x, L.z + GAP], [x, z1], 'v', own); } else wall([x, z0], [x, z1], 'v', own);
  }
  for (let j = 1; j < GH; j++) for (let i = 0; i < GW; i++) {
    const L = linkOf(areas[id(i, j - 1)], areas[id(i, j)]), z = j * AH, x0 = i * AW, x1 = x0 + AW, own = [id(i, j - 1), id(i, j)];
    if (L) { wall([x0, z], [L.x - GAP, z], 'h', own); wall([L.x + GAP, z], [x1, z], 'h', own); } else wall([x0, z], [x1, z], 'h', own);
  }
  wall([0, 0], [W, 0], 'n', []); wall([0, H], [W, H], 's', []); wall([0, 0], [0, H], 'w', []); wall([W, 0], [W, H], 'e', []);
  const nearWall = (x, z) => { let best = { d: 1e9, w: null }; for (const w of walls) { const d = segD(x, z, w.a, w.b); if (d < best.d) best = { d, w }; } return best; };
  const wallD = (x, z) => nearWall(x, z).d;

  // chodníky: stred oblasti → priechod → stred suseda
  const paths = [];
  for (const l of links) { const a = areas[l.a], b = areas[l.b], m = [l.x, l.z]; paths.push([[a.cx, a.cz], m], [m, [b.cx, b.cz]]); }
  const pathD = (x, z) => { const wx = x + (noise(x * 0.1, z * 0.1, 31) - 0.5) * 3, wz = z + (noise(x * 0.1, z * 0.1, 37) - 0.5) * 3; let d = 1e9; for (const p of paths) d = Math.min(d, segD(wx, wz, p[0], p[1])); return d; };
  const onPath = (x, z) => pathD(x, z) < 1.1;

  const bumps = (x, z) => (noise(x * 0.07, z * 0.07, 1) - 0.5) * 0.8 + (noise(x * 0.24, z * 0.24, 2, 3) - 0.5) * 0.55 + (noise(x * 0.8, z * 0.8, 4, 2) - 0.5) * 0.14;
  const height = (x, z) => {
    const p = smooth(1.6, 0.4, pathD(x, z));
    let y = bumps(x, z) * (1 - p * 0.6) - p * 0.16;
    y += (1 - smooth(0.6, 4.5, wallD(x, z))) * 1.15;      // pri hraniciach zem stúpa do kopca
    return y;
  };
  const inside = (x, z) => x > 2.2 && z > 2.2 && x < W - 2.2 && z < H - 2.2 && wallD(x, z) > 1.6;

  // ---------- banda zo vzorca: počet a zloženie podľa obtiažnosti d (0 = pri štarte zóny 1) + náhoda ----------
  // váhy druhov rastú plynulo s d: zbojník vždy, strelec a rytier od stredu, barbar až ďaleko / v ďalších zónach
  const band = (d, elite) => {
    const n = elite ? 3 + Math.floor(rng() * 2) : Math.min(6, 2 + Math.floor(d * 1.6 + rng() * 1.8));
    const wts = { rogue: 1, hooded: smooth(0.15, 0.6, d) * 0.8, knight: 0.25 + smooth(0, 1, d) * 0.5, barbarian: smooth(0.6, 1.3, d) * 0.7 };
    const roll = () => { let r = rng() * Object.values(wts).reduce((x, y) => x + y, 0); for (const [k, w] of Object.entries(wts)) if ((r -= w) <= 0) return k; return 'rogue'; };
    const types = Array.from({ length: n }, roll);
    if (elite) types[0] = d > 1 ? 'barbarian' : 'knight';   // kapitán
    return { n, types };
  };
  // ---------- obsah oblastí ----------
  const camps = [], finds = [], hides = [], gates = [];
  let building = null;
  const taken = [];
  const clear = (x, z, d) => taken.every(t => Math.hypot(x - t[0], z - t[1]) > d + t[2]);
  const spot = (a, d = 3, onP = false) => {
    for (let k = 0; k < 200; k++) {
      const x = a.i * AW + 5 + rng() * (AW - 10), z = a.j * AH + 4.5 + rng() * (AH - 9);
      if (inside(x, z) && wallD(x, z) > (d >= 4 ? 6 : 3.5) && clear(x, z, d) && (onP || pathD(x, z) > 2.2)) return [x, z];
    }
    return [a.cx, a.cz];
  };
  const take = (x, z, r) => taken.push([x, z, r]);
  for (const a of areas) {
    const x0 = a.i * AW, z0 = a.j * AH;
    if (a.kind === 'boj' || a.kind === 'elita') {
      const [x, z] = spot(a, 4); take(x, z, 4.5);
      const elite = a.kind === 'elita', d = zone - 1 + a.tier;   // obtiažnosť: vzdialenosť od štartu + zóna
      const camp = { id: camps.length, area: a.id, x, z, boss: false, elite, key: !elite, ...band(d, elite) };
      camps.push(camp);
      if (!elite && rng() < 0.6) { const [cx, cz] = spot(a, 3, true); take(cx, cz, 1.5); finds.push({ id: finds.length, kind: 'chest', n: 0, x: cx, z: cz }); }
    }
    if (a.kind === 'boss') { take(a.cx, a.cz, 7); camps.push({ id: camps.length, area: a.id, x: a.cx, z: a.cz, n: 1, boss: true, types: ['barbarian'], adds: 2 + Math.floor(rng() * 2) + zone }); }
    if (a.kind === 'obchod') { const x = x0 + AW * 0.5, z = z0 + AH * 0.42; building = { x, z, r: 2.6, door: [x, z + 2.6], area: a.id }; take(x, z, 4); }
    if (a.kind === 'poklad') { const k = Math.floor(rng() * 3); for (let i = 0; i < 3; i++) { const [x, z] = spot(a, 4); take(x, z, 2); hides.push({ id: i, x, z, key: i === k }); } }
    if (a.kind === 'zamok') { for (const n of [-1, 0]) { const [x, z] = spot(a, 3, true); take(x, z, 2); finds.push({ id: finds.length, kind: 'chest', n, x, z }); } }
    if (a.kind === 'start') { start.sign = [a.cx + 2.5, a.cz - 1.2]; take(a.cx, a.cz, 2.5); take(...start.sign, 1); }
  }
  if (opts.rune) { const a = pick(areas.filter(a => ['boj', 'obchod', 'poklad'].includes(a.kind))); const [x, z] = spot(a, 3, true); take(x, z, 2); finds.push({ id: finds.length, kind: 'rune', n: 10, x, z }); }
  const keysNeeded = camps.filter(c => c.key).length + (hides.length ? 1 : 0);
  // brány v priechodoch do vodcu (kľúče) a do trezoru (číslo)
  for (const [a, kind] of [[boss, 'boss'], [vault, 'lock']]) if (a) {
    const l = links.find(l => l.a === a.id || l.b === a.id);
    gates.push({ kind, axis: l.axis, x: l.x, z: l.z, need: kind === 'boss' ? keysNeeded : 0, area: a.id });
    take(l.x, l.z, 3);
  }

  // ---------- zdobenie ----------
  const props = [];
  // kolízia podľa druhu (polomer pri veľkosti 1, násobí sa veľkosťou) – do skál, stromov a kríkov sa nedá vojsť
  const COLR = [['rock_large', 0.95], ['rock_tall', 0.75], ['tree_', 0.4], ['plant_bushLarge', 0.6], ['plant_bush', 0.4], ['statue_column', 0.4], ['statue_block', 0.65], ['statue_obelisk', 0.6], ['log', 0.55], ['stump', 0.4], ['tent', 1.1], ['campfire', 0.5], ['building_', 1.4]];
  const colOf = m => (COLR.find(([k]) => m.startsWith(k)) || [0, 0])[1];
  const put = (m, x, z, s = 1, r = rng() * 6.28, col = colOf(m)) => props.push({ m, x, z, s, r, col: col || colOf(m) });
  const clearing = (x, z) => !clear(x, z, 0) || onPath(x, z);
  const free = (x, z, d = 1.5) => inside(x, z) && !clearing(x, z) && props.every(p => Math.abs(p.x - x) > d + p.col || Math.abs(p.z - z) > d + p.col || Math.hypot(p.x - x, p.z - z) > d + p.col);
  const moodOf = a => noise(a.i * 3.1 + zone, a.j * 2.3 + (seed % 97), 21);
  const treesOf = a => { const m = moodOf(a); return m > 0.55 ? ['tree_pineDefaultA', 'tree_pineRoundB', 'tree_pineTallA', 'tree_cone'] : m > 0.42 ? ['tree_oak', 'tree_detailed', 'tree_fat', 'tree_pineRoundB'] : ['tree_default', 'tree_tall', 'tree_thin', 'tree_simple', 'tree_oak']; };
  // hranice: zboku vysoký les a skaly, smerom ku kamere (vodorovné) len nízke skaly a kríky, nech nezakrývajú hrdinu
  for (const [x, z] of poisson(W + 8, H + 8, 1.25, rng, (x, z) => { const d = nearWall(x - 4, z - 4); return d.d < (d.w.o === 'n' ? 5 : 1.9) && !(d.w.o === 's' && z - 4 > H + 1); })) {
    const wx = x - 4, wz = z - 4, { w } = nearWall(wx, wz), fort = w.own.includes(boss.id), a = areaAt(wx, wz);
    if (links.some(l => Math.hypot(wx - l.x, wz - l.z) < GAP + 2.2) || onPath(wx, wz)) continue;   // priechody a chodníky ostanú voľné
    if (w.o === 'h' || w.o === 's') put(pick(fort ? ['rock_largeA', 'rock_largeB', 'statue_block'] : ['plant_bushLarge', 'rock_largeA', 'rock_largeB', 'plant_bush', 'rock_largeC', 'plant_bushLarge']), wx, wz, 1 + rng() * 0.5);
    else if (w.o === 'n') put(pick(['rock_tallA', 'rock_tallB', 'rock_largeC', 'rock_largeD', ...treesOf(a)]), wx, wz - rng() * 2, 1.6 + rng() * 1.6);
    else if (fort) put(pick(['rock_tallA', 'rock_tallB', 'statue_column']), wx, wz, 0.9 + rng() * 0.4);
    else if (rng() < 0.22) put(pick(treesOf(a)), wx, wz, 0.65 + rng() * 0.25);           // stromy len občas a nízke, nech nezakrývajú
    else put(pick(['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'plant_bushLarge', 'plant_bushLarge']), wx, wz, 1.2 + rng() * 0.6);
  }
  for (let x = -6 + rng() * 3; x < W + 6; x += 3 + rng() * 4) put(pick(['rock_tallA', 'rock_tallB', 'rock_largeC', 'rock_largeD']), x, -4 - rng() * 3, 3.2 + rng() * 2.5);
  // vnútro oblastí: dominanta, háje, skaly, pne, kmene, kríky
  for (const a of areas) {
    const T = treesOf(a), x0 = a.i * AW, z0 = a.j * AH, inA = (x, z) => x > x0 + 3 && x < x0 + AW - 3 && z > z0 + 3 && z < z0 + AH - 3;
    if (a.kind === 'boss') { const n = 9; for (let i = 0; i < n; i++) { const t = i / n * 6.28; put(rng() < 0.4 ? 'statue_columnDamaged' : 'statue_column', a.cx + Math.cos(t) * 6.5, a.cz + Math.sin(t) * 5, 1, rng() * 6, 0.4); } }
    else if (a.kind !== 'start') for (let k = 0; k < 40; k++) {
      const x = x0 + 6 + rng() * (AW - 12), z = z0 + 4 + rng() * 5; if (!free(x, z, 4)) continue;
      const land = pick(['tower', 'well', 'obelisk', 'ruins', 'none']);
      if (land === 'tower') put(pick(['building_tower_A_blue', 'building_tower_B_blue']), x, z, 1, rng() * 6.28, 1.6);
      else if (land === 'well') put('building_well_blue', x, z, 1, rng() * 6.28, 1.1);
      else if (land === 'obelisk') put('statue_obelisk', x, z, 1, rng() * 6.28, 0.6);
      else if (land === 'ruins') { for (let i = 0; i < 5; i++) { const t = i / 5 * 6.28; put(rng() < 0.4 ? 'statue_columnDamaged' : 'statue_column', x + Math.cos(t) * 2.2, z + Math.sin(t) * 2.2, 1, rng() * 6, 0.4); } }
      break;
    }
    for (const [px, pz] of poisson(AW, AH, 7, rng, (x, z) => free(x0 + x, z0 + z, 3) && inA(x0 + x, z0 + z) && noise((x0 + x) * 0.12, (z0 + z) * 0.12, 22) > 0.55)) {
      const cx = x0 + px, cz = z0 + pz;
      for (let k = 0; k < 2 + Math.floor(rng() * 3); k++) { const t = rng() * 6.28, d = rng() * 1.8, x = cx + Math.cos(t) * d, z = cz + Math.sin(t) * d; if (free(x, z, 1.2) && z < z0 + AH - 5) put(pick(T), x, z, 0.7 + rng() * 0.4, rng() * 6.28, 0.45); }
    }
    for (let k = 0; k < 2 + Math.floor(rng() * 3); k++) { const x = x0 + 4 + rng() * (AW - 8), z = z0 + 4 + rng() * (AH - 8); if (free(x, z)) { put(pick(['stump_old', 'stump_round', 'stump_oldTall']), x, z, 1, rng() * 6.28, 0.4); if (rng() < 0.6) put(pick(['mushroom_redGroup', 'mushroom_tanGroup']), x + 0.7, z + 0.4); } }
    for (let k = 0; k < Math.floor(rng() * 3); k++) { const x = x0 + 4 + rng() * (AW - 8), z = z0 + 4 + rng() * (AH - 8); if (free(x, z, 2)) put(rng() < 0.5 ? 'log_large' : 'log', x, z, 1, rng() * 6.28, 0.7); }
    for (const [px, pz] of poisson(AW, AH, 9, rng, (x, z) => free(x0 + x, z0 + z, 2) && inA(x0 + x, z0 + z) && rng() < 0.4)) {
      const x = x0 + px, z = z0 + pz;
      put(pick(['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD']), x, z, 0.8 + rng() * 0.5, rng() * 6.28, 0.8);
      for (let k = 0; k < 2; k++) put(pick(['rock_smallA', 'rock_smallB', 'rock_smallC', 'rock_smallFlatA']), x + (rng() - 0.5) * 2.4, z + (rng() - 0.5) * 2.4, 0.8 + rng() * 0.6);
    }
    for (const [px, pz] of poisson(AW, AH, 3.2, rng, (x, z) => free(x0 + x, z0 + z, 1) && rng() < 0.25)) put(pick(['plant_bush', 'plant_bushSmall', 'plant_bushLarge']), x0 + px, z0 + pz, 0.9 + rng() * 0.5, rng() * 6.28, 0.3);
  }
  for (const c of camps) if (!c.boss) { put('campfire_stones', c.x + 1.2, c.z + 1.5, 1, 0, 0.5); put('tent_smallClosed', c.x + 2.8, c.z - 2.2, 1, 3.5 + rng(), 1.1); if (rng() < 0.6) put('log_stack', c.x - 0.8, c.z + 2.6, 1, rng() * 6, 0.6); }
  for (const h of hides) put('plant_bushLarge', h.x, h.z, 1.25, rng() * 6.28, 0.6);
  if (building) put('building_tavern_blue', building.x, building.z, 1, 0, building.r);
  if (start.sign) put('sign', ...start.sign, 1, -1.2, 0.2);

  // kvety v trsoch a ťahy trávy
  const flowers = [];
  for (const [cx, cz] of poisson(W, H, 4.5, rng, (x, z) => inside(x, z) && noise(x * 0.1, z * 0.1, 5) > 0.45)) {
    const n = 14 + Math.floor(rng() * 30), r = 0.8 + rng() * 1.4;
    for (let k = 0; k < n; k++) { const t = rng() * Math.PI * 2, d = Math.sqrt(-2 * Math.log(1 - rng() * 0.95)) * r * 0.55, x = cx + Math.cos(t) * d, z = cz + Math.sin(t) * d; if (inside(x, z) && !clearing(x, z)) flowers.push({ x, z, s: 0.6 + rng() * 0.7 }); }
  }
  const grass = poisson(W, H, 0.55, rng, (x, z) => inside(x, z) && !onPath(x, z) && noise(x * 0.16, z * 0.16, 9) > 0.47, 12000).map(([x, z]) => ({ x, z, r: rng() * Math.PI, s: 0.6 + rng() * 0.8 }));

  return { seed, zone, W, H, areas, links, walls, gates, camps, finds, hides, building, start: [start.cx, start.cz], startArea: start.id, bossArea: boss.id, keysNeeded, flowers, grass, props, height, inside, onPath, areaAt };
}
