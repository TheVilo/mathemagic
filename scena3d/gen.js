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
export function genRoom(seed, index) {
  const rng = mulberry32(seed * 1009 + index * 7919 + 1), noise = makeNoise(seed * 31 + index * 97 + 7);
  const W = 32, H = 22, boss = index === ROOMS - 1, mid = H / 2;
  const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
  const gapIn = (x, z) => x < 6 && Math.abs(z - mid) < 2.6, gapOut = (x, z) => x > W - 6 && Math.abs(z - mid) < 2.6;
  const edge = (x, z) => Math.min(x, z, W - x, H - z);
  const height = (x, z) => {
    let y = (noise(x * 0.07, z * 0.07, 1) - 0.5) * 1.3;
    const rim = 1 - smooth(0.5, 4.2, edge(x, z));
    if (!gapIn(x, z) && !gapOut(x, z)) y += rim * rim * 3.4;
    return y;
  };
  const inside = (x, z) => edge(x, z) > 2.2 || ((gapIn(x, z) || gapOut(x, z)) && x > -1 && x < W + 1);

  const start = [1.2, mid], gate = [W - 0.8, mid];
  const camp = boss ? { x: W * 0.62, z: mid, n: 1, boss: true } : { x: W * (0.55 + rng() * 0.12), z: mid + (rng() - 0.5) * 5, n: Math.min(5, 2 + Math.floor(index * 0.6)), boss: false };
  const tier = index / (ROOMS - 1);

  // nálezy: číslo 3 v tretej miestnosti, číslo 4 v piatej, mince inde
  const finds = [];
  const spot = () => { for (let k = 0; k < 50; k++) { const x = 8 + rng() * (W - 16), z = 4 + rng() * (H - 8); if (Math.hypot(x - camp.x, z - camp.z) > 6) return [x, z]; } return [W / 2, 5]; };
  if (index === 2) { const [x, z] = spot(); finds.push({ kind: 'rune', n: 3, x, z }); }
  if (index === 4) { const [x, z] = spot(); finds.push({ kind: 'chest', n: 4, x, z }); }
  if (index === 1 || index === 3) { const [x, z] = spot(); finds.push({ kind: 'chest', n: 0, x, z }); }

  const clearing = (x, z) => Math.hypot(x - camp.x, z - camp.z) < (boss ? 7 : 4.5) || finds.some(f => Math.hypot(x - f.x, z - f.z) < 2) || Math.abs(z - mid) < 1.6;
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
  const grass = poisson(W, H, 0.5, rng, (x, z) => edge(x, z) > 1 && noise(x * 0.16, z * 0.16, 9) > 0.47, 2600).map(([x, z]) => ({ x, z, r: rng() * Math.PI, s: 0.6 + rng() * 0.8 }));
  // stromy len po okraji (rám miestnosti), pár kameňov
  const trees = poisson(W, H, 2.4, rng, (x, z) => edge(x, z) < 2.6 && !gapIn(x, z) && !gapOut(x, z)).map(([x, z]) => ({ x, z, type: noise(x * 0.2, z * 0.2, 3) > 0.5 ? 1 : rng() < 0.3 ? 2 : 0, s: 0.75 + rng() * 0.5, r: rng() * 6.28 }));
  const rocks = poisson(W, H, 6, rng, (x, z) => inside(x, z) && !clearing(x, z) && rng() < 0.35).map(([x, z]) => ({ x, z, s: 0.4 + rng() * 0.5, r: rng() * 6.28 }));

  return { seed, index, boss, W, H, mid, start, gate, camp, tier, finds, flowers, grass, trees, rocks, height, inside };
}
