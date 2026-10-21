// SIMULÁCIA BEHU MAJSTRA (Node): palica = kalkulačka s energiou. Spusti: node scena3d/sim-energia.mjs [semienko] [--odomknute]
// Hráč je „chytrý“: po každej úrovni vyberie z ponuky to, čo mu najviac zvýši damage/s, a vždy si poskladá najlepší vzorec,
// ktorý mu dovolí displej palice, kľúče v ruksaku a energia. Výstup: koľko striel treba na bežného nepriateľa a na vodcu v každej horde.
import { numCost, enemyHpM, hordeSize, hordeInterval, kindWeights, xpFor, xpNeed, levelOffers, nextSpecial, KEY_COST, STAFF_MODELS, staffStats, SHOT_MIN, FACT_CAP, MAX_STARS } from './balance.js';

const seed = +(process.argv[2] || 1), allUnlocked = process.argv.includes('--odomknute');
let a = seed >>> 0; const rng = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ruksak: čísla (hodnoty), znamienka (počty), odomknuté funkcie, hviezdy, displej, palica
const P = { nums: [1, 1], ops: { '+': 1, '-': 0, '×': 0, '÷': 0 }, unlock: {}, stars: {}, slots: 3, staff: 0, kind: 'zakladna', rows: [[]] };
if (allUnlocked) P.unlock = { p: 1, s: 1, q: 1, c: 1, f: 1 };
const run = { pack: P };
const num = v => v * (1 + (P.stars[v] || 0));
const fact = n => { n = Math.min(FACT_CAP, Math.round(n)); let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; };

// VZORY VZORCOV (a ≥ b ≥ c ≥ d sú najlepšie čísla): [názov, počet políčok, potrebné znamienka, funkcie, výpočet, cena energie]
const C = KEY_COST;
const TEMPLATES = [
  ['a', 1, {}, [], ([a]) => a],
  ['a+b', 3, { '+': 1 }, [], ([a, b]) => a + b],
  ['a+b+c', 5, { '+': 2 }, [], ([a, b, c]) => a + b + c],
  ['a+b+c+d', 7, { '+': 3 }, [], ([a, b, c, d]) => a + b + c + d],
  ['a×b', 3, { '×': 1 }, [], ([a, b]) => a * b],
  ['a×b+c', 5, { '×': 1, '+': 1 }, [], ([a, b, c]) => a * b + c],
  ['a×b×c', 5, { '×': 2 }, [], ([a, b, c]) => a * b * c],
  ['a×b×c×d', 7, { '×': 3 }, [], ([a, b, c, d]) => a * b * c * d],
  ['(a+b)×c', 7, { '+': 1, '×': 1 }, ['p'], ([a, b, c]) => (b + c) * a],
  ['(a+b)×(c+d)', 11, { '+': 2, '×': 1 }, ['p'], ([a, b, c, d]) => (a + d) * (b + c)],
  ['a²', 2, {}, ['q'], ([a]) => a * a],
  ['a²×b', 4, { '×': 1 }, ['q'], ([a, b]) => a * a * b],
  ['a²×b²', 5, { '×': 1 }, ['q', 'q'], ([a, b]) => a * a * b * b],
  ['(a+b)²', 6, { '+': 1 }, ['p', 'q'], ([a, b]) => (a + b) ** 2],
  ['a³', 2, {}, ['c'], ([a]) => a ** 3],
  ['a³×b', 4, { '×': 1 }, ['c'], ([a, b]) => a ** 3 * b],
  ['(a+b)³', 6, { '+': 1 }, ['p', 'c'], ([a, b]) => (a + b) ** 3],
  ['a!', 2, {}, ['f'], ([a]) => fact(a)],
  ['a!×b', 4, { '×': 1 }, ['f'], ([a, b]) => fact(a) * b],
  ['(a+b)!', 6, { '+': 1 }, ['p', 'f'], ([a, b]) => fact(a + b)],
  ['(a+b)!×c', 8, { '+': 1, '×': 1 }, ['p', 'f'], ([a, b, c]) => fact(b + c) * a],
];
// cena vzorca = súčet klávesov (čísla, znamienka, funkcie, zátvorky)
function tplCost(t) {
  const [, len, ops, fx] = t; let n = len, e = 0;
  for (const [o, k] of Object.entries(ops)) { e += C[o] * k; n -= k; }
  for (const f of fx) { if (f === 'p') { e += C['(']; n -= 2; } else { e += C[{ q: '²', c: '³', f: '!', s: '√' }[f]]; n -= 1; } }
  return e + n * C.n;   // zvyšok políčok sú čísla (cena čísel sa dopočíta podľa hodnôt v best())
}
const tplNums = t => t[1] - Object.values(t[2]).reduce((x, y) => x + y, 0) - t[3].reduce((x, f) => x + (f === 'p' ? 2 : 1), 0);
function best(stats) {
  const nums = P.nums.map(num).sort((x, y) => y - x);
  let top = null;
  for (const t of TEMPLATES) {
    const [name, len, ops, fx, f] = t, k = tplNums(t);
    if (len > Math.min(P.slots, stats.disp) || k > nums.length) continue;
    if (Object.entries(ops).some(([o, c]) => (P.ops[o] || 0) < c) || fx.some(x => fx.filter(y => y === x).length > (P.unlock[x] === true ? 1 : +P.unlock[x] || 0))) continue;   // funkcie sú kusy
    const used = P.nums.slice().sort((x, y) => num(y) - num(x)).slice(0, k), cost = tplCost(t) - k * C.n + used.reduce((a, v) => a + numCost(v), 0); if (cost > stats.emax) continue;
    const v = f(nums.slice(0, k)) * stats.dmg, rate = Math.min(1 / (SHOT_MIN * stats.cd), stats.regen / cost), dps = v * rate * stats.shots;
    if (!top || dps > top.dps) top = { name, v: Math.round(v), cost, rate, dps };
  }
  return top;
}
const dpsNow = () => best(staffStats(P)).dps;
function apply(g) {
  if (g.t === 'n') { P.nums.push(g.v); const same = P.nums.filter(x => x === g.v); if (same.length >= 3 && (P.stars[g.v] || 0) < MAX_STARS) { for (let i = 0; i < 3; i++) P.nums.splice(P.nums.indexOf(g.v), 1); P.stars[g.v] = (P.stars[g.v] || 0) + 1; P.nums.push(g.v); } }
  else if (g.t === 'o') P.ops[g.v]++;
  else if (g.t === 'spec') P.unlock[g.k] = (+P.unlock[g.k] || 0) + 1;
  else if (g.t === 'slot') P.slots += 2;
  else if (g.t === 'staff') P.staff++;
}
const snap = () => JSON.stringify(P);
function choose(offers) {   // chytrý hráč: skúsi každú ponuku a vezme tú, čo dá najviac damage/s (pri remíze funkcia > znamienko > políčka)
  const s0 = snap(); let pick = null, bv = -1;
  for (const o of offers) {
    const g = o.give; if (!['n', 'o', 'spec', 'slot', 'staff'].includes(g.t)) continue;
    for (let i = 0; i < (o.n || 1); i++) apply(g); const v = dpsNow() + (g.t === 'spec' ? 0.01 : g.t === 'o' ? 0.005 : 0); Object.assign(P, JSON.parse(s0));
    if (v > bv) { bv = v; pick = o; }
  }
  if (pick) for (let i = 0; i < (pick.n || 1); i++) apply(pick.give);
  return pick;
}

const KH = { rogue: 1, hooded: 1, knight: 1.6, barbarian: 2.2 };
let L = 1, xp = 0, t = 0, out = [];
console.log(`semienko ${seed}${allUnlocked ? ' · všetko odomknuté' : ''}\n`);
console.log('zóna horda úr  vzorec            dmg  energia  strely/s  dps   | bežný HP  striel | vodca HP  striel | čistenie / interval');
for (let z = 1; z <= 8; z++) {
  for (let w = 1; w <= 10; w++) {
    const st = staffStats(P), b = best(st), kw = kindWeights(w, z), sum = Object.values(kw).reduce((x, y) => x + y, 0);
    const avgKind = Object.entries(kw).reduce((x, [k, v]) => x + KH[k] * v / sum, 0);
    const n = w === 10 ? Math.max(3, hordeSize(w, z) - 3) : hordeSize(w, z), boss = w === 5 || w === 10;
    const hp = Math.round(enemyHpM('rogue', w, z) * avgKind), bhp = boss ? enemyHpM('barbarian', w, z, { boss: w === 10 ? 2 : 1 }) : 0;
    const total = hp * (n - (boss ? 1 : 0)) + bhp, clear = total / b.dps, iv = hordeInterval(w) + (w === 10 ? 12 : 0);
    out.push({ z, w, L, b, hp, bhp, clear, iv });
    console.log(`${z}    ${String(w).padStart(2)}   ${String(L).padStart(2)}  ${b.name.padEnd(16)} ${String(b.v).padStart(5)}  ${String(b.cost).padStart(3)}/${String(st.emax).padStart(3)}  ${b.rate.toFixed(2).padStart(6)}  ${String(Math.round(b.dps)).padStart(5)} | ${String(hp).padStart(7)}  ${String(Math.ceil(hp / b.v)).padStart(5)} | ${boss ? String(Math.round(bhp)).padStart(7) + '  ' + String(Math.ceil(bhp / b.v)).padStart(5) : '      –      –'} | ${clear.toFixed(1).padStart(6)} s / ${iv.toFixed(0)} s${clear > iv ? '  ← NESTÍHA' : ''}`);
    // XP za hordu, potom úrovne a výber
    xp += xpFor(hp) * (n - (boss ? 1 : 0)) + (boss ? xpFor(bhp) : 0);
    while (xp >= xpNeed(L)) { xp -= xpNeed(L); L++; const off = levelOffers(L, run, rng, []); const p = choose(off.items); if (process.argv.includes('-v')) console.log(`        úr. ${L}: ${off.items.map(o => o.title).join(' / ')} → ${p ? p.title : '—'}`); }
    if (w === 10) { const sp = nextSpecial(P.unlock); if (sp) P.unlock[sp.k] = 1; }
    if (w === 10 && z < 8) { // obchodník po vodcovi: kúpi lepší model palice, keď môže (mince ≈ 25 + 10·z)
      const coins = 25 + 30 * z, s0 = P.kind; let bk = s0, bd = dpsNow(); for (const [k, m] of Object.entries(STAFF_MODELS)) { if (m.price > coins) continue; P.kind = k; const d = dpsNow(); if (d > bd) { bd = d; bk = k; } } P.kind = bk; if (bk !== s0) console.log(`        obchod: palica ${STAFF_MODELS[bk].name}`);
    }
  }
}
const n = out.length, avgShots = out.reduce((x, o) => x + Math.ceil(o.hp / o.b.v), 0) / n;
console.log(`\npriemer striel na bežného nepriateľa: ${avgShots.toFixed(1)} · hôrd, ktoré nestíha: ${out.filter(o => o.clear > o.iv).length}/${n} · konečná úroveň ${L}`);
