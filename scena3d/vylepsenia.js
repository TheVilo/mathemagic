// VYLEPŠENIA (Majster, ako predmety v Brotate): pravidlá na VLASTNOSTI ČÍSEL – párne, nepárne, prvočísla, deliteľnosť, štvorce…
// Zbierajú sa bez limitu a sčítavajú sa (n = počet kusov). Hráč skladá palicu tak, aby výsledok spĺňal pravidlá, ktoré má.
// Bez grafiky – dá sa testovať v Node.

const fmt = x => String(Math.round(x * 100) / 100).replace('.', ',');
export const isPrime = n => { if (n < 2 || !Number.isInteger(n)) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
export const isSquare = n => n > 0 && Number.isInteger(Math.sqrt(n));

// icon = krátky matematický zápis vlastnosti (kreslí sa pixelovým písmom), rar = vzácnosť, L = od ktorej úrovne sa ponúka
export const ITEMS = {
  plus:    { name: 'Ostrejšie plus', icon: '+1', rar: 'b', L: 1, text: n => `každé + na palici je o ${n} väčšie` },
  parne:   { name: 'Párne', icon: '2n', rar: 'b', L: 1, text: n => `párny výsledok zraní ×${fmt(1 + 0.5 * n)}` },
  zivot:   { name: 'Život', icon: '+5', rar: 'b', L: 1, text: n => `najviac života +5 (spolu +${5 * n})` },
  male:    { name: 'Malé a rýchle', icon: '≤5', rar: 'b', L: 1, text: n => `výsledok do 5: strieľaš o ${Math.min(60, 15 * n)} % rýchlejšie` },
  bateria: { name: 'Batéria', icon: '⚡+4', rar: 'b', L: 1, text: n => `palica má o ${4 * n} ⚡ viac` },
  neparne: { name: 'Nepárne', icon: '2n+1', rar: 'v', L: 2, text: n => `nepárny výsledok vystrelí ešte ${n}× na ďalšieho` },
  tretina: { name: 'Tretiny', icon: '÷3', rar: 'v', L: 2, text: n => `výsledok deliteľný 3 pošle ${2 * n} strely po (výsledok ÷ 3)` },
  dvojcif: { name: 'Dvojciferné', icon: '≥10', rar: 'v', L: 3, text: n => `výsledok 10 a viac zraní o ${25 * n} % viac` },
  krat:    { name: 'Lacné krát', icon: '×−1', rar: 'v', L: 3, text: n => `každé × stojí o ${n} ⚡ menej (najmenej 1)` },
  nula:    { name: 'Presne nula', icon: '=0', rar: 'v', L: 2, text: n => `zabitie presne do nuly vylieči ${2 * n} života` },
  hojenie: { name: 'Hojenie', icon: '+1/s', rar: 'v', L: 3, text: n => `+1 život každých ${fmt(12 / n)} s` },
  prvo:    { name: 'Prvočísla', icon: 'p', rar: 'e', L: 4, text: n => `prvočíselný výsledok (2, 3, 5, 7, 11…) preskočí na ${n} ďalších` },
  okruhle: { name: 'Okrúhle', icon: '10k', rar: 'e', L: 5, text: n => `výsledok deliteľný 10 vybuchne · polomer ${1 + n} m` },
  stvorec: { name: 'Štvorce', icon: 'n²', rar: 'e', L: 5, text: n => `výsledok 1, 4, 9, 16, 25… zraní ×${1 + n}` },
};
export const itemN = (pack, id) => (pack && pack.items && pack.items[id]) || 0;
export const addItem = (pack, id) => { pack.items = pack.items || {}; pack.items[id] = (pack.items[id] || 0) + 1; };

// palica: moduly upravené vylepšeniami (Ostrejšie plus)
export const boostSlots = (pack, slots) => { const p = itemN(pack, 'plus'); return p ? slots.map(m => m && m.t === 'mod' && m.o === '+' ? { ...m, v: m.v + p } : m) : slots; };

// PRAVIDLÁ VÝSLEDKU: násobok poškodenia + čo sa ešte stane; tags = zápis, ktorý sa ukáže pri čarodejníkovi („párne ×1,5“)
export function applyRules(pack, raw, rule = null) {   // rule = vstavané pravidlá palice, ktorá strieľa
  let k = 1; const tags = [], fx = { extra: 0, split3: 0, prime: 0, boom: 0, fast: 1 };
  const n = id => itemN(pack, id) + ((rule && rule[id]) || 0);
  if (raw > 0 && raw % 2 === 0 && n('parne')) { k *= 1 + 0.5 * n('parne'); tags.push(`párne ×${fmt(1 + 0.5 * n('parne'))}`); }
  if (raw % 2 === 1 && n('neparne')) { fx.extra = n('neparne'); tags.push(`nepárne +${fx.extra}`); }
  if (raw >= 10 && n('dvojcif')) { k *= 1 + 0.25 * n('dvojcif'); tags.push(`≥10 ×${fmt(1 + 0.25 * n('dvojcif'))}`); }
  if (isSquare(raw) && n('stvorec')) { k *= 1 + n('stvorec'); tags.push(`${Math.sqrt(raw)}² ×${1 + n('stvorec')}`); }
  if (raw >= 3 && raw % 3 === 0 && n('tretina')) { fx.split3 = 2 * n('tretina'); tags.push(`${raw}÷3 = ${raw / 3}`); }
  if (isPrime(raw) && n('prvo')) { fx.prime = n('prvo'); tags.push(`${raw} prvočíslo`); }
  if (raw > 0 && raw % 10 === 0 && n('okruhle')) { fx.boom = 1 + n('okruhle'); tags.push(`${raw} bum`); }
  if (raw > 0 && raw <= 5 && n('male')) fx.fast = 1 - Math.min(0.6, 0.15 * n('male'));
  return { k, tags, fx };
}

// PONUKA pri úrovni / u obchodníka: váha podľa vzácnosti, silnejšie až od úrovne L
const RW = { b: 1, v: 0.6, e: 0.3, l: 0.12 };
export function itemOffers(L, pack, rng = Math.random, n = 3) {
  const pool = Object.entries(ITEMS).filter(([, it]) => L >= it.L).map(([id, it]) => ({ id, w: RW[it.rar] * (itemN(pack, id) ? 1.3 : 1) }));   // čo už máš, príde o niečo častejšie (stavanie)
  const out = [];
  while (out.length < n && pool.length) {
    const sum = pool.reduce((a, b) => a + b.w, 0); let r = rng() * sum, i = pool.findIndex(p => (r -= p.w) <= 0); if (i < 0) i = pool.length - 1;
    const { id } = pool.splice(i, 1)[0], it = ITEMS[id], have = itemN(pack, id);
    out.push({ id: 'it-' + id, give: { t: 'item', id }, title: it.name + (have ? ` ${have + 1}` : ''), text: it.text(have + 1), rar: it.rar, icon: it.icon });
  }
  return out;
}
