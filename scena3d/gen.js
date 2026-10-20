// Generátor miestností: každá obrazovka zóny sa vypočíta zo semienka a čísla miestnosti. Bez grafiky – dá sa testovať v Node.
// Miestnosť = ohraničená čistinka (okraj stúpa do kopca), vchod vľavo, brána vpravo, v strede horda.
// Kvety v trsoch, ťahy trávy v ostrovčekoch, stromy len po okraji – všetko Poissonovým rozmiestnením a šumom.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise(seed) {
  const h = (x, y, s) => {
    let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041) + Math.imul(seed, 2654435761)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  };
  const sm = t => t * t * (3 - 2 * t);
  const vn = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
    const a = h(xi, yi, s), b = h(xi + 1, yi, s), c = h(xi, yi + 1, s), d = h(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y, s = 0, oct = 4) => { let f = 1, amp = 0.5, sum = 0, n = 0; for (let i = 0; i < oct; i++) { sum += vn(x * f, y * f, s + i * 17) * amp; n += amp; f *= 2; amp *= 0.5; } return sum / n; };
}
// Poissonov disk (Bridson)
export function poisson(W, H, r, rng, ok, max = 100000) {
  const cell = r / Math.SQRT2, gw = Math.ceil(W / cell), gh = Math.ceil(H / cell), grid = new Int32Array(gw * gh).fill(-1);
  const pts = [], active = [];
  const add = (x, z) => { pts.push([x, z]); active.push(pts.length - 1); grid[Math.floor(z / cell) * gw + Math.floor(x / cell)] = pts.length - 1; };
  for (let k = 0; k < 60 && !pts.length; k++) { const x = rng() * W, z = rng() * H; if (ok(x, z)) add(x, z); }
  while (active.length && pts.length < max) {
    const ai = Math.floor(rng() * active.length), [px, pz] = pts[active[ai]];
    let placed = false;
    for (let k = 0; k < 24; k++) {
      const a = rng() * Math.PI * 2, d = r * (1 + rng()), x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
      let far = true;
      for (let j = Math.max(0, gz - 2); j <= Math.min(gh - 1, gz + 2) && far; j++)
        for (let i = Math.max(0, gx - 2); i <= Math.min(gw - 1, gx + 2); i++) {
          const q = grid[j * gw + i]; if (q >= 0 && (pts[q][0] - x) ** 2 + (pts[q][1] - z) ** 2 < r * r) { far = false; break; }
        }
      if (far && ok(x, z)) { add(x, z); placed = true; break; }
    }
    if (!placed) active.splice(ai, 1);
  }
  return pts;
}

export const ROOMS = 7; // 6 miestností s hordou + boss
// kind: boj | poklad | zamok | elita | obchod | boss (z mapy zóny), opts.rune = v miestnosti leží runa „do 10“
export function genRoom(seed, index, kind = index === ROOMS - 1 ? 'boss' : 'boj', opts = {}) {
  const rng = mulberry32(seed * 1009 + index * 7919 + 1), noise = makeNoise(seed * 31 + index * 97 + 7);
  const W = 32, H = 22, boss = kind === 'boss', mid = H / 2, fight = boss || kind === 'boj' || kind === 'elita';
  const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
  const gapIn = (x, z) => x < 6 && Math.abs(z - mid) < 2.6, gapOut = (x, z) => x > W - 6 && Math.abs(z - mid) < 2.6;
  const edge = (x, z) => Math.min(x, z, W - x, H - z);
  // vyšliapaný chodník: krivka od vchodu k bráne, kľukatí sa podľa sínusu a šumu
  const ph = rng() * 6.28, amp = 1.5 + rng() * 2.5;
  const pathZ = x => mid + Math.sin(x * 0.19 + ph) * amp * smooth(2, 9, x) * smooth(2, 9, W - x) + (noise(x * 0.08, 3, 13) - 0.5) * 2;
  const pathD = (x, z) => Math.abs(z - pathZ(x));
  // zem nie je rovná: veľké vlny + hrbole + drobné nerovnosti (tri vrstvy šumu)
  const bumps = (x, z) => (noise(x * 0.07, z * 0.07, 1) - 0.5) * 0.8 + (noise(x * 0.24, z * 0.24, 2, 3) - 0.5) * 0.55 + (noise(x * 0.8, z * 0.8, 4, 2) - 0.5) * 0.14;
  const height = (x, z) => {
    let y = bumps(x, z);
    const p = smooth(1.6, 0.4, pathD(x, z));                    // na chodníku je zem nižšie a hladšia
    y = y * (1 - p * 0.6) - p * 0.16;
    const rim = 1 - smooth(0.5, 4.2, edge(x, z));
    y += rim * 0.5;                                               // okraj len mierne stúpa, hranicu tvoria stromy
    return y;
  };
  const onPath = (x, z) => pathD(x, z) < 1.1;
  const inside = (x, z) => edge(x, z) > 2.2 || ((gapIn(x, z) || gapOut(x, z)) && x > -1 && x < W + 1);

  const start = [1.2, pathZ(1.2)], gate = [W - 0.8, mid];
  const cx0 = W * (0.55 + rng() * 0.12);
  const camp = !fight ? null : boss ? { x: W * 0.62, z: pathZ(W * 0.62), n: 1, boss: true } : { x: cx0, z: pathZ(cx0) + (rng() - 0.5) * 3, n: kind === 'elita' ? 3 : Math.min(5, 3 + Math.floor(index / 3)), boss: false, elite: kind === 'elita' };
  const tier = index / (ROOMS - 1);
  // zloženie bandy podľa hĺbky v zóne: najprv zbojníci, potom rytieri a strelci, nakoniec barbari
  if (camp && !boss) camp.types = camp.elite ? ['knight', 'rogue', 'rogue'] : index < 2 ? ['rogue', 'rogue', 'knight'] : index < 4 ? ['rogue', 'hooded', 'knight', 'rogue'] : ['barbarian', 'rogue', 'hooded', 'rogue', 'knight'];

  // nálezy: truhlice (karta alebo mince), runa „do 10“, v pokladovej miestnosti kľúč v jednom z troch kríkov, v obchode krčma
  const finds = [], hides = [];
  const building = kind === 'obchod' ? { x: W * 0.5, z: 8.2, r: 2.6 } : null;
  if (building) building.door = [building.x, building.z + 2.6];
  const far = (x, z, d) => (!camp || Math.hypot(x - camp.x, z - camp.z) > d) && (!building || Math.hypot(x - building.x, z - building.z) > 5) && finds.every(f => Math.hypot(x - f.x, z - f.z) > 4) && hides.every(f => Math.hypot(x - f.x, z - f.z) > 5);
  const spot = (d = 6) => { for (let k = 0; k < 80; k++) { const x = 8 + rng() * (W - 16), z = 5 + rng() * (H - 10); if (far(x, z, d)) return [x, z]; } return [W / 2, 6]; };
  if (opts.rune) { const [x, z] = spot(); finds.push({ kind: 'rune', n: 10, x, z }); }
  if (kind === 'poklad') { const k = Math.floor(rng() * 3); for (let i = 0; i < 3; i++) { const [x, z] = spot(); hides.push({ x, z, key: i === k }); } const [x, z] = spot(); finds.push({ kind: 'chest', n: -1, x, z }); }
  if (kind === 'zamok') { const [x, z] = spot(); finds.push({ kind: 'chest', n: -1, x, z }); }
  if (kind === 'boj' && index % 2) { const [x, z] = spot(); finds.push({ kind: 'chest', n: 0, x, z }); }

  const clearing = (x, z) => (camp && Math.hypot(x - camp.x, z - camp.z) < (boss ? 7 : 4.5)) || (building && Math.hypot(x - building.x, z - building.z) < building.r + 1.5) || finds.some(f => Math.hypot(x - f.x, z - f.z) < 2) || hides.some(f => Math.hypot(x - f.x, z - f.z) < 1.6) || onPath(x, z);
  // kvety: trsy okolo stredov, kde je šum vysoký (ako na inšpirácii)
  const flowers = [];
  for (const [cx, cz] of poisson(W, H, 4.5, rng, (x, z) => inside(x, z) && noise(x * 0.1, z * 0.1, 5) > 0.45)) {
    const n = 14 + Math.floor(rng() * 30), r = 0.8 + rng() * 1.4;
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(-2 * Math.log(1 - rng() * 0.95)) * r * 0.55;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (inside(x, z) && !clearing(x, z)) flowers.push({ x, z, s: 0.6 + rng() * 0.7 });
    }
  }
  // tmavé ťahy trávy v ostrovčekoch
  const grass = poisson(W, H, 0.5, rng, (x, z) => edge(x, z) > 1 && !onPath(x, z) && noise(x * 0.16, z * 0.16, 9) > 0.47, 2600).map(([x, z]) => ({ x, z, r: rng() * Math.PI, s: 0.6 + rng() * 0.8 }));
  // stromy len po okraji (rám miestnosti), pár kameňov
  // veci vo svete: názov modelu, poloha, otočenie, veľkosť, polomer na zrážky
  const props = [], pick = a => a[Math.floor(rng() * a.length)];
  const put = (m, x, z, s = 1, r = rng() * 6.28, col = 0) => props.push({ m, x, z, s, r, col });
  const free = (x, z, d = 1.5) => inside(x, z) && !clearing(x, z) && props.every(p => Math.hypot(p.x - x, p.z - z) > d + p.col);
  // dominanta miestnosti (vypočítaná podľa semienka): ruina zo stĺpov, vežička, studňa alebo obelisk
  const land = boss ? 'ruins' : pick(['ruins', 'tower', 'well', 'obelisk', 'tower']);
  for (let k = 0; k < 40; k++) {
    const x = 8 + rng() * (W - 16), z = rng() < 0.5 ? 5 + rng() * 2.5 : H - 5 - rng() * 2.5;
    if (!free(x, z, 4)) continue;
    if (land === 'ruins') { const n = 5 + Math.floor(rng() * 3); for (let i = 0; i < n; i++) { const a = i / n * 6.28; put(rng() < 0.4 ? 'statue_columnDamaged' : 'statue_column', x + Math.cos(a) * 2.2, z + Math.sin(a) * 2.2, 1, rng() * 6, 0.4); } put('statue_block', x, z, 1, rng() * 6, 0.6); }
    else if (land === 'tower') put(rng() < 0.5 ? 'building_tower_A_blue' : 'building_tower_B_blue', x, z, 1, rng() * 6.28, 1.6);
    else if (land === 'well') put('building_well_blue', x, z, 1, rng() * 6.28, 1.1);
    else put('statue_obelisk', x, z, 1, rng() * 6.28, 0.6);
    break;
  }
  // stromy: hustý rám po okraji + pár hájikov vnútri; druh podľa šumu (každá miestnosť má iný ráz)
  const mood = noise(index * 3.1, seed % 97, 21);
  const TREES = mood > 0.55 ? ['tree_pineDefaultA', 'tree_pineRoundB', 'tree_pineTallA', 'tree_cone'] : mood > 0.4 ? ['tree_oak', 'tree_detailed', 'tree_fat', 'tree_pineRoundB'] : ['tree_default', 'tree_tall', 'tree_thin', 'tree_simple', 'tree_oak'];
  // stromy vzadu a po bokoch; na strane ku kamere (dole) len nízke veci, aby nezakrývali výhľad
  for (const [x, z] of poisson(W, H, 2.3, rng, (x, z) => edge(x, z) < 2.8 && z < H - 3.2 && !gapIn(x, z) && !gapOut(x, z))) put(pick(TREES), x, z, 0.8 + rng() * 0.5, rng() * 6.28, 0.45);
  for (const [x, z] of poisson(W, H, 1.6, rng, (x, z) => z > H - 2.8 && x > 1 && x < W - 1)) put(pick(['plant_bush', 'plant_bushSmall', 'rock_smallA', 'rock_smallB', 'stump_round', 'plant_bushSmall']), x, z, 0.9 + rng() * 0.5, rng() * 6.28, 0.3);
  for (let x = 3 + rng() * 4; x < W - 3; x += 6 + rng() * 6) put(rng() < 0.5 ? 'log_large' : 'log', x, H - 1.6 + (rng() - 0.5), 1, rng() * 0.6 - 0.3 + (rng() < 0.5 ? 0 : 3.14), 0.5);
  // hory v pozadí: rad vysokých skál za zadným okrajom
  for (let x = -6 + rng() * 3; x < W + 6; x += 3 + rng() * 4) put(pick(['rock_tallA', 'rock_tallB', 'rock_largeC', 'rock_largeD']), x, -3.5 - rng() * 3, 3.2 + rng() * 2.5, rng() * 6.28, 0);
  for (const [x, z] of poisson(W, H, 7, rng, (x, z) => free(x, z, 3) && noise(x * 0.12, z * 0.12, 22) > 0.62)) for (let k = 0; k < 2 + Math.floor(rng() * 3); k++) { const a = rng() * 6.28, d = rng() * 1.8; if (free(x + Math.cos(a) * d, z + Math.sin(a) * d, 1.2)) put(pick(TREES), x + Math.cos(a) * d, z + Math.sin(a) * d, 0.7 + rng() * 0.4, rng() * 6.28, 0.45); }
  // tábor hordy: ohnisko a stany za ním
  if (camp && !boss) { put('campfire_stones', camp.x + 1.2, camp.z + 1.5, 1, 0, 0.5); put('tent_smallClosed', camp.x + 2.8, camp.z - 2.2, 1, 3.5 + rng(), 1.1); if (rng() < 0.6) put('log_stack', camp.x - 0.8, camp.z + 2.6, 1, rng() * 6, 0.6); }
  // padnuté kmene, pne, skupiny kameňov, kríky, huby
  for (let k = 0, n = Math.floor(rng() * 3); k < n; k++) { const [x, z] = spot(); if (free(x, z, 2)) put(rng() < 0.5 ? 'log_large' : 'log', x, z, 1, rng() * 6.28, 0.7); }
  for (let k = 0; k < 2 + Math.floor(rng() * 3); k++) { const [x, z] = spot(); if (free(x, z)) { put(pick(['stump_old', 'stump_round', 'stump_oldTall']), x, z, 1, rng() * 6.28, 0.4); if (rng() < 0.6) put(pick(['mushroom_redGroup', 'mushroom_tanGroup']), x + 0.7, z + 0.4, 1, rng() * 6, 0); } }
  for (const [x, z] of poisson(W, H, 8, rng, (x, z) => free(x, z, 2) && rng() < 0.4)) {
    put(pick(['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'rock_tallA', 'rock_tallB']), x, z, 0.8 + rng() * 0.6, rng() * 6.28, 0.8);
    for (let k = 0; k < 2; k++) put(pick(['rock_smallA', 'rock_smallB', 'rock_smallC', 'rock_smallFlatA']), x + (rng() - 0.5) * 2.4, z + (rng() - 0.5) * 2.4, 0.8 + rng() * 0.6, rng() * 6.28, 0);
  }
  for (const [x, z] of poisson(W, H, 3, rng, (x, z) => edge(x, z) > 2.6 && edge(x, z) < 4.5 && free(x, z, 1) && rng() < 0.5)) put(pick(['plant_bush', 'plant_bushLarge', 'plant_bushSmall']), x, z, 0.9 + rng() * 0.5, rng() * 6.28, 0.3);
  if (index === 0) put('sign', 4, pathZ(4) + 1.6, 1, -1.2, 0.2);
  const trees = [], rocks = [];

  for (const h of hides) put('plant_bushLarge', h.x, h.z, 1.25, rng() * 6.28, 0.6);
  if (building) put('building_tavern_blue', building.x, building.z, 1, 0, building.r);
  return { seed, index, kind, boss, W, H, mid, start, gate, camp, tier, finds, hides, building, flowers, grass, trees, rocks, props, land, height, inside, onPath };
}
