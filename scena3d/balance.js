// ROVNOVÁHA MAJSTRA – všetko na jednom mieste, len vzorce (žiadne ručné tabuľky). Bez grafiky – dá sa testovať v Node.
//
// Myšlienka (ako Balatro): nepriatelia silnejú EXPONENCIÁLNE, hráč stíha len tak, že skladá silnejšie vzorce.
// Sčítanie rastie pomaly, násobenie rýchlo, mocnina a faktoriál najrýchlejšie → matematika = sila.
//
//   w = poradie hordy v behu (1, 2, 3 …), z = zóna (1, 2, 3 …)
//   obtiažnosť  D(w, z) = 1,22^(w−1) · 3,3^(z−1)
//   život       HP = druh · 4 · D            (zbojník 1, strelec 1, rytier 1,6, barbar 2,2, kapitán ×1,8, vodca ×9)
//   veľkosť     n = min(14, 2 + ⌊0,7 · w⌋ + (z − 1))
//   interval    t = max(9, 24 − 1,3 · w) s, prvá horda po 8 s; nepriatelia ×2,2 rýchlejší, banda ťa zacíti zo 14 m
//   vodca hordy každá 6. horda (w = 6, 12, 18 …): jeden silný nepriateľ + sprievod, odmena = špeciálny kláves
//   skúsenosti  XP za zabitie = ⌈HP / 3⌉,  ďalšia úroveň = ⌈12 · 1,45^(L−1)⌉  → každá úroveň je ťažšia
//   úroveň      výber 1 z 3 (nový kláves, lepšie číslo, viac políčok, palica, špeciálna funkcia)

export const KIND_HP = { rogue: 1, hooded: 1, knight: 1.6, barbarian: 2.2, innkeeper: 1 };
export const difficulty = (w, z) => Math.pow(1.22, Math.max(0, w - 1)) * Math.pow(3.3, Math.max(0, z - 1));
export const enemyHpM = (kind, w, z, { boss = false, elite = false } = {}) => Math.max(2, Math.round((KIND_HP[kind] || 1) * 4 * difficulty(w, z) * (boss === 2 ? 9 : boss ? 6 : elite ? 1.8 : 1)));
export const hordeSize = (w, z) => Math.min(14, 2 + Math.floor(0.7 * w) + (z - 1));
export const hordeInterval = w => Math.max(9, 24 - 1.3 * w);   // hordy chodia často – nečaká sa
export const ENEMY_SPEED = 2.2;   // Majster: nepriatelia bežia po hráčovi (×2,2 oproti Učňovi)
export const AGGRO = 14;          // z koľkých metrov si ťa banda všimne
export const isBossWave = w => w > 0 && w % 6 === 0;
export const xpFor = hp => Math.ceil(hp / 3);
export const xpNeed = L => Math.ceil(8 * Math.pow(1.45, L - 1));
// druhy nepriateľov plynulo podľa obtiažnosti (log, aby sa zloženie menilo pozvoľna)
export function kindWeights(w, z) {
  const d = Math.log(difficulty(w, z)) / Math.log(2.4);   // ≈ 0 na začiatku, 1 po zóne 1, …
  return { rogue: 1, hooded: Math.min(0.8, Math.max(0, d - 0.1) * 1.6), knight: 0.25 + Math.min(1, d) * 0.6, barbarian: Math.min(0.9, Math.max(0, d - 0.5)) };
}
// ŠPECIÁLNE FUNKCIE (klávesy kalkulačky): každá je matematika, ktorá zväčšuje výsledok
//   ( )  zátvorky – poradie výpočtu      √  odmocnina – prerazí štít
//   x²   druhá mocnina                    x³  tretia mocnina
//   !    faktoriál (do 7! = 5040)
export const SPECIALS = [
  { k: 'p', key: '( )', name: 'Zátvorky', text: 'najprv sa počíta v zátvorke: (2+3)×4 = 20' },
  { k: 's', key: '√', name: 'Odmocnina', text: '√16 = 4 · prerazí štít' },
  { k: 'q', key: 'x²', name: 'Druhá mocnina', text: '5² = 25' },
  { k: 'c', key: 'x³', name: 'Tretia mocnina', text: '3³ = 27' },
  { k: 'f', key: '!', name: 'Faktoriál', text: '4! = 1·2·3·4 = 24 (až do 12!)' },
];
// vodcovia zón a vodcovia hôrd dávajú špeciálne funkcie v tomto poradí
export const nextSpecial = unlock => SPECIALS.find(s => !unlock[s.k]) || null;
// FUNKCIE = KUSY: unlock[k] je počet kusov (staré uloženie true = 1); každý kus sa dá vo vzorcoch použiť raz
export const specOwned = (U, k) => U && U[k] === true ? 1 : (U && +U[k]) || 0;
export const specAdd = (U, k) => { U[k] = specOwned(U, k) + 1; };
// 8 VODCOV ZÓN (Majster) – každý má matematickú vlastnosť; 1. a 8. sú pevné, 2.–7. sa zamiešajú podľa semienka behu.
// raw = výsledok vzorca (pred násobičmi), v = damage. Vráti nový damage (záporný = lieči) a hlášku.
const isPrime = n => { if (n < 2 || n % 1) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
export const BOSSES = {
  kral:   { name: 'Kráľ plusov',        hint: 'privoláva posily',                         hit: (raw, v) => [v] },
  parny:  { name: 'Strážca párnych',    hint: 'zraní ho len PÁRNY výsledok',              hit: (raw, v) => raw % 2 ? [1, 'Len párne!'] : [v] },
  prvo:   { name: 'Prvočíselník',       hint: 'plnú silu má len PRVOČÍSLO (2, 3, 5, 7, 11…)', hit: (raw, v) => isPrime(raw) ? [v * 2, 'Prvočíslo! ×2'] : [Math.ceil(v / 4), 'Nie je prvočíslo'] },
  troj:   { name: 'Trojhlavý',          hint: 'zraní ho len NÁSOBOK 3',                   hit: (raw, v) => raw % 3 ? [1, 'Len násobky 3!'] : [v] },
  zrkadlo:{ name: 'Zrkadlo',            hint: 'výsledok pod 20 ho LIEČI',                 hit: (raw, v) => raw < 20 ? [-v, 'Lieči sa! Väčšie číslo!'] : [v] },
  stit:   { name: 'Štít z nuly',        hint: 'štít sa obnovuje – √ ho prerazí',          hit: (raw, v) => [v] },
  delic:  { name: 'Delič',              hint: 'pri zásahu sa delí na menších',            hit: (raw, v) => [v] },
  nula:   { name: 'Veľká Nula',         hint: 'finálny vodca – menej ako 50 ju nezraní',  hit: (raw, v) => v < 50 ? [0, 'Menej ako 50 nestačí!'] : [v] },
};
export function bossOf(zone, seed) {
  if (zone >= 8) return zone === 8 ? 'nula' : Object.keys(BOSSES)[(seed + zone * 7) % 7];   // po 8. zóne nekonečno: vodcovia sa opakujú
  if (zone === 1) return 'kral';
  const mid = ['parny', 'prvo', 'troj', 'zrkadlo', 'stit', 'delic'];
  let a = seed >>> 0; for (let i = mid.length - 1; i > 0; i--) { a = (a * 1103515245 + 12345) >>> 0; const k = a % (i + 1); [mid[i], mid[k]] = [mid[k], mid[i]]; }
  return mid[zone - 2];
}
export const FINAL_ZONE = 8;
export const bossHpMul = id => id === 'nula' ? 3 : id === 'zrkadlo' ? 1.3 : 1;   // násobí základný život vodcu

// ============ VÝBER PO ÚROVNI ============
// Každá úroveň: s pravdepodobnosťou P_CALC ponuka 3 VECÍ DO KALKULAČKY (čísla, znamienka, funkcie), inak 3 KARTY (efekty, palica…).
// Silné veci sú vzácne a prídu až neskôr: váha = základ · g(L, L_min),  g = 0 pod L_min, inak 1 − e^(−(L − L_min + 1) / 3)
// Čísla: váha čísla v = e^(−(v − μ)² / 2σ²),  μ = 1 + 0,5·L (typické ponúkané číslo rastie s úrovňou), σ = 1,6
export const P_CALC = 0.6;
export const gate = (L, Lmin) => L < Lmin ? 0 : 1 - Math.exp(-(L - Lmin + 1) / 3);
export const ITEMS = [   // veci do kalkulačky okrem čísel
  { id: '+', t: 'o', v: '+', Lmin: 1, w: 1.0, title: 'Znamienko +', text: 'zem: omráči, každé ďalšie + dlhšie' },
  { id: '-', t: 'o', v: '-', Lmin: 2, w: 0.5, title: 'Znamienko −', text: 'oheň: odčítané číslo dohorí (9−3 = 6 + 3 horí) · záporné lieči' },
  { id: '×', t: 'o', v: '×', Lmin: 4, w: 0.55, title: 'Znamienko ×', text: 'vzduch: odhodí, väčší činiteľ = ďalej' },
  { id: '÷', t: 'o', v: '÷', Lmin: 6, w: 0.35, title: 'Znamienko ÷', text: 'voda: 12÷3 = 3 kvapky po 4 · spomalí' },
  { id: 'p', t: 'spec', k: 'p', Lmin: 6, w: 0.35, title: 'Zátvorky ( )', text: '(2+3)×4 = 20 – počíta sa najprv v zátvorke' },
  { id: 's', t: 'spec', k: 's', Lmin: 8, w: 0.3, title: 'Odmocnina √', text: '√ zakorení nepriateľa na mieste a prerazí štít' },
  { id: 'q', t: 'spec', k: 'q', Lmin: 10, w: 0.25, title: 'Mocnina x²', text: '6² = 36 · jeden kus' },
  { id: 'c', t: 'spec', k: 'c', Lmin: 14, w: 0.22, title: 'Mocnina x³', text: '4³ = 64' },
  { id: 'f', t: 'spec', k: 'f', Lmin: 18, w: 0.16, title: 'Faktoriál !', text: '5! = 120 (až do 12!)' },
  { id: 'slot', t: 'slot', Lmin: 2, w: 0.7, title: '+2 políčka', text: 'dlhší vzorec na displeji' },
];
export const numWeight = (v, L) => Math.exp(-((v - (1 + 0.5 * L)) ** 2) / (2 * 1.6 * 1.6));
function pickW(pool, rng) { const sum = pool.reduce((a, b) => a + b.w, 0); let r = rng() * sum; const i = pool.findIndex(p => (r -= p.w) <= 0); return pool.splice(i < 0 ? pool.length - 1 : i, 1)[0]; }
export function calcOffers(L, run, rng = Math.random, n = 3) {
  const P = run.pack, U = P.unlock || {}, pool = [];
  // malé čísla (1–4) prídu po dvoch kusoch (dlhší vzorec, rýchlejšie ★), veľké po jednom a drahšie na energiu
  for (let v = 1; v <= 9; v++) { const w = numWeight(v, L) * 1.6, two = v <= 4; if (w > 0.02) pool.push({ id: 'n' + v, w, n: two ? 2 : 1, title: two ? `2× číslo ${v}` : `Číslo ${v}`, text: `⚡${numCost(v)} za kláves${two ? ' · dva kusy' : ''}${(P.stars && P.stars[v]) ? ` · máš ${v}${'★'.repeat(P.stars[v])}` : ''}`, give: { t: 'n', v } }); }
  for (const it of ITEMS) {
    if (it.t === 'spec' && specOwned(U, it.k) >= (it.k === 'p' ? 2 : 2)) continue;   // najviac 2 kusy jednej funkcie
    if (it.t === 'slot' && P.slots >= 13) continue;
    const w = it.w * gate(L, it.Lmin); if (w > 0) pool.push({ id: it.id, w, title: it.title, text: it.text, give: it.t === 'o' ? { t: 'o', v: it.v } : it.t === 'spec' ? { t: 'spec', k: it.k } : { t: 'slot' } });
  }
  // v jednej ponuke najviac jedno číslo – zvyšok sú znamienka, funkcie, políčka
  const out = []; while (out.length < n && pool.length) { const o = pickW(pool, rng); out.push(o); if (o.give.t === 'n') for (let i = pool.length - 1; i >= 0; i--) if (pool[i].give.t === 'n') pool.splice(i, 1); }
  return out;
}
export function cardOffers(L, run, cards, rng = Math.random, n = 3) {
  const P = run.pack, pool = cards.map(c => ({ id: 'card' + c.id, w: 1, title: c.name, text: c.text, give: { t: 'card', id: c.id } }));
  if (P.staff < 5) pool.push({ id: 'staff', w: 1.2, title: 'Lepšia palica', text: '+25 % damage, +15 % energie a dobíjania', give: { t: 'staff' } });
  if (P.rows.length < 3) pool.push({ id: 'row', w: 0.6 * gate(L, 5), title: 'Ďalšie kúzlo', text: 'nový riadok – kúzla sa striedajú', give: { t: 'row' } });
  pool.push({ id: 'magnet', w: 0.5, title: 'Magnet', text: 'kryštály priťahuješ z väčšej diaľky', give: { t: 'magnet' } });
  // nová palica (model kalkulačky) – len lepšia než tá, čo máš (podľa ceny), vzácnosť podľa modelu
  const cur = STAFF_MODELS[P.kind] || STAFF_MODELS.zakladna;
  for (const [k, m] of Object.entries(STAFF_MODELS)) if (k !== P.kind && m.price > cur.price) pool.push({ id: 'pal-' + k, w: 0.3, title: `Palica ${m.name}`, text: `${m.text} · ⚡${m.emax} +${m.regen}/s · displej ${m.disp}`, give: { t: 'pal', k } });
  for (const p of pool) { const r = p.give.t === 'pal' ? STAFF_RAR[p.give.k] : CARD_RAR[p.give.id || p.give.t] || 'v'; p.w *= RAR_W[r] * gate(L, RAR_L[r]); }
  const live = pool.filter(p => p.w > 0), out = []; while (out.length < n && live.length) out.push(pickW(live, rng));
  return out;
}
// ============ VZÁCNOSŤ (karty aj klávesy) ============
// Bežná · Vzácna · Epická · Legendárna – rám a váha. Kartám sa váha násobí RAR_W a otvára sa až od úrovne RAR_L (gate).
export const RARITY = { b: { name: 'Bežná', col: '#b8b8b8' }, v: { name: 'Vzácna', col: '#5aa6ff' }, e: { name: 'Epická', col: '#b07ad8' }, l: { name: 'Legendárna', col: '#f0c040' } };
const RAR_W = { b: 1, v: 0.6, e: 0.3, l: 0.12 }, RAR_L = { b: 1, v: 2, e: 5, l: 9 };
const KEY_RAR = { '+': 'b', '-': 'b', '×': 'v', '÷': 'v', p: 'v', slot: 'v', s: 'e', q: 'l', c: 'l', f: 'l' };   // funkcie sú vzácne KUSY (x² legendárne)
export const STAFF_RAR = { zakladna: 'b', rychla: 'v', tazka: 'v', dvojita: 'e', vedecka: 'e', graficka: 'l' };
export const CARD_RAR = { horenie: 'v', plamen: 'e', kamen: 'v', zemetras: 'e', vir: 'v', naraz: 'e', lad: 'v', dazd: 'e', magnet: 'b', heart: 'b', srdce: 'b', retaz: 'v', ohen: 'v', stit: 'v', cas: 'v', ozvena: 'v', staff: 'v', otras: 'e', plocha: 'e', blesk: 'e', row: 'e', krat: 'l', krit: 'l' };
export function rarityOf(o) {
  const g = o.give || {};
  if (g.t === 'n') return g.v >= 8 ? 'e' : g.v >= 6 ? 'v' : 'b';
  if (g.t === 'o') return KEY_RAR[g.v] || 'b';
  if (g.t === 'spec') return KEY_RAR[g.k] || 'e';
  if (g.t === 'slot') return 'v';
  if (g.t === 'card') return CARD_RAR[g.id] || 'v';
  if (g.t === 'pal') return STAFF_RAR[g.k] || 'v';
  return CARD_RAR[g.t] || 'b';
}
// VÝBER PO ÚROVNI: 3 miesta, každé je náhodne kláves (P_CALC) alebo karta → miešajú sa, vyberáš medzi nimi
export function levelOffers(L, run, rng = Math.random, cards = []) {
  const calc = calcOffers(L, run, rng, 99), cpool = cardOffers(L, run, cards, rng, 99), out = [];
  for (let k = 0; k < 3; k++) {
    const src = (rng() < P_CALC && calc.length) || !cpool.length ? calc : cpool; if (!src.length) break;
    out.push(src.splice(0, 1)[0]);
  }
  for (const o of out) o.rar = rarityOf(o);
  return { type: 'mix', items: out };
}

// ============ PALICA = KALKULAČKA S ENERGIOU (ako palica v Magicrafte) ============
// Každý kláves vo vzorci stojí energiu; výstrel zoberie súčet. Energia sa dobíja (regen/s) do maxima palice (emax).
// Silné kombo je drahé → hra sa dá „rozbiť“ až s veľkou palicou. Najkratší čas medzi výstrelmi SHOT_MIN · cd.
//   cena:   číslo 1 · + − 1 · × ÷ 2 · ( ) 1+1 · √ 3 · x² 4 · x³ 6 · ! 8
//   displej = model palice + 2 za každé „+2 políčka“; úroveň palice (karta/obchod): damage +25 %, energia a dobíjanie +15 %
export const KEY_COST = { n: 1, d: 1, '+': 1, '-': 1, '×': 2, '÷': 2, '(': 1, ')': 1, '√': 3, '²': 4, '³': 6, '!': 8 };
export const SHOT_MIN = 0.35;
export const STAFF_MODELS = {
  zakladna: { name: 'Základná', text: 'vyvážená', price: 0, disp: 3, emax: 8, regen: 4, cd: 1, dmg: 1, shots: 1 },
  rychla:   { name: 'Rýchla', text: 'rýchle dobíjanie, menší damage', price: 30, disp: 3, emax: 8, regen: 7, cd: 0.6, dmg: 0.8, shots: 1 },
  tazka:    { name: 'Ťažká', text: 'veľká batéria, pomalšia', price: 35, disp: 5, emax: 24, regen: 4.5, cd: 1.4, dmg: 1.3, shots: 1 },
  dvojita:  { name: 'Dvojitá', text: 'zasiahne 2 nepriateľov', price: 45, disp: 4, emax: 14, regen: 5, cd: 1.1, dmg: 0.75, shots: 2 },
  vedecka:  { name: 'Vedecká', text: 'dlhý displej, veľká energia', price: 70, disp: 7, emax: 30, regen: 7, cd: 1, dmg: 1, shots: 1 },
  graficka: { name: 'Grafická', text: 'najväčšia batéria – na faktoriály', price: 120, disp: 9, emax: 50, regen: 10, cd: 1, dmg: 1, shots: 1 },
};
export function staffStats(pack) {
  const m = STAFF_MODELS[pack.kind] || STAFF_MODELS.zakladna, lv = pack.staff || 0, k = 1 + 0.15 * lv;
  return { ...m, disp: m.disp + Math.max(0, (pack.slots || 3) - 3), emax: Math.round(m.emax * k), regen: m.regen * k, dmg: m.dmg * (1 + 0.25 * lv) };
}
// cena vzorca zo zoznamu tokenov ({ t, v })
// číslo: väčšie = drahšie (1–4 → 1, 5–7 → 2, 8–9 → 3) – výber čísla je obchod medzi silou a energiou
export const numCost = v => v <= 4 ? 1 : v <= 7 ? 2 : 3;
export const spellCost = toks => toks.reduce((s, x) => s + (x ? (x.t === 'n' ? numCost(x.v) : x.t === 'd' ? KEY_COST.n : KEY_COST[x.v] ?? 1) : 0), 0);
// faktoriál do 7! = 5040 počas 8 zón; v nekonečne (po Veľkej Nule) až do 12! – vtedy sa hra smie rozbiť
export const FACT_CAP = 7, FACT_CAP_ENDLESS = 12;
export const MAX_STARS = 2;   // 3 rovnaké čísla → ★ (×2), ★★ (×3) – viac nie
