// ROVNOVÁHA MAJSTRA – všetko na jednom mieste, len vzorce (žiadne ručné tabuľky). Bez grafiky – dá sa testovať v Node.
//
// Myšlienka (ako Balatro): nepriatelia silnejú EXPONENCIÁLNE, hráč stíha len tak, že skladá silnejšie vzorce.
// Sčítanie rastie pomaly, násobenie rýchlo, mocnina a faktoriál najrýchlejšie → matematika = sila.
//
//   w = poradie hordy v behu (1, 2, 3 …), z = zóna (1, 2, 3 …)
//   obtiažnosť  D(w, z) = 1,22^(w−1) · 2,4^(z−1)
//   život       HP = druh · 4 · D            (zbojník 1, strelec 1, rytier 1,6, barbar 2,2, kapitán ×1,8, vodca ×9)
//   veľkosť     n = min(14, 2 + ⌊0,7 · w⌋ + (z − 1))
//   interval    t = max(12, 34 − 1,6 · w) s
//   vodca hordy každá 6. horda (w = 6, 12, 18 …): jeden silný nepriateľ + sprievod, odmena = špeciálny kláves
//   skúsenosti  XP za zabitie = ⌈HP / 3⌉,  ďalšia úroveň = ⌈12 · 1,45^(L−1)⌉  → každá úroveň je ťažšia
//   úroveň      výber 1 z 3 (nový kláves, lepšie číslo, viac políčok, palica, špeciálna funkcia)

export const KIND_HP = { rogue: 1, hooded: 1, knight: 1.6, barbarian: 2.2, innkeeper: 1 };
export const difficulty = (w, z) => Math.pow(1.22, Math.max(0, w - 1)) * Math.pow(2.4, Math.max(0, z - 1));
export const enemyHpM = (kind, w, z, { boss = false, elite = false } = {}) => Math.max(2, Math.round((KIND_HP[kind] || 1) * 4 * difficulty(w, z) * (boss ? 9 : elite ? 1.8 : 1)));
export const hordeSize = (w, z) => Math.min(14, 2 + Math.floor(0.7 * w) + (z - 1));
export const hordeInterval = w => Math.max(12, 34 - 1.6 * w);
export const isBossWave = w => w > 0 && w % 6 === 0;
export const xpFor = hp => Math.ceil(hp / 3);
export const xpNeed = L => Math.ceil(12 * Math.pow(1.45, L - 1));
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

// VÝBER PO ÚROVNI (1 z 3) – generovaný: čím vyššia úroveň, tým väčšie čísla a silnejšie ponuky
export function levelOffers(L, run, rng = Math.random) {
  // ÚROVEŇ = VYLEPŠENIA (nie čísla – tie sú len na mape). Vylepšenie klávesu: 7 → 7★ (×2) → 7★★ (×3) …
  const P = run.pack, pool = [], stars = P.stars || {};
  const owned = [...new Set(P.inv.filter(t => t.t === 'n').map(t => t.v))].sort((a, b) => b - a);
  for (const v of owned.slice(0, 4)) { const s = stars[v] || 0; if (s < 4) pool.push({ id: 'star' + v, w: 3, title: `Kláves ${v}${'★'.repeat(s + 1)}`, text: `každá ${v} vo vzorci sa ráta ako ${v * (s + 2)} (×${s + 2})`, give: { t: 'star', v } }); }
  pool.push({ id: 'magnet', w: 1, title: 'Magnet', text: 'kryštály skúseností priťahuješ z väčšej diaľky', give: { t: 'magnet' } });
  pool.push({ id: 'heart', w: 1, title: '+1 srdce', text: 'viac životov do konca behu', give: { t: 'heart' } });
  if (P.slots < 13) pool.push({ id: 'slot', w: 2, title: '+2 políčka', text: 'dlhší vzorec na displeji', give: { t: 'slot' } });
  if (P.staff < 5) pool.push({ id: 'staff', w: 2, title: 'Lepšia palica', text: '+25 % damage, rýchlejšie nabíjanie', give: { t: 'staff' } });
  if (P.rows.length < 3) pool.push({ id: 'row', w: 1, title: 'Ďalšie kúzlo', text: 'nový riadok – kúzla sa striedajú', give: { t: 'row' } });
  const sp = nextSpecial(P.unlock || {}); if (sp && L >= 3) pool.push({ id: 'spec', w: 1 + L * 0.15, title: `${sp.key} ${sp.name}`, text: sp.text, give: { t: 'spec', k: sp.k } });
  const out = [];
  while (out.length < 3 && pool.length) { const sum = pool.reduce((a, b) => a + b.w, 0); let r = rng() * sum; const i = pool.findIndex(p => (r -= p.w) <= 0); out.push(pool.splice(i < 0 ? 0 : i, 1)[0]); }
  return out;
}
