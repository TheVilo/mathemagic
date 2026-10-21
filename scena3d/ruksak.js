// Ruksak = kalkulačka kúziel (režim Pokročilý). Do políčok skladáš vzorec z nájdených dielov: □ (kocka = náhodné číslo),
// pevné čísla a znamienka. Pri zoslaní sa kocky hodia, ty vypočítaš výsledok = damage. Znamienka pridajú živly.
// Všetko zo vzorcov – korisť, životy nepriateľov aj ceny. Bez grafiky – dá sa testovať v Node.

// začiatok: 1 + 1 z pevných čísel; lepšie čísla, rozšírenie ruksaku a kocky □ sa nachádzajú, nové znamienko dá vodca
// rows = kúzla (riadky kalkulačky, max 3) – v súboji sa striedajú v poradí ako na palici v Magicrafte; staff = úroveň palice
export const newPack = () => ({ slots: 3, inv: [{ id: 1, t: 'n', v: 1 }, { id: 2, t: 'o', v: '+' }, { id: 3, t: 'n', v: 1 }], rows: [[1, 2, 3]], staff: 0, next: 4 });
export function migratePack(p) { if (!p.rows) { p.rows = [p.spell || []]; delete p.spell; } p.rows = p.rows.map(r => r.filter(x => x != null)); p.staff = p.staff || 0; return p; }
export const MAX_ROWS = 3, MAX_STAFF = 3;
export const allIds = pack => new Set(pack.rows.flat().filter(x => x != null));
const tok = (pack, id) => pack.inv.find(x => x.id === id);
export const isNum = x => x && (x.t === 'd' || x.t === 'n');
// vzorec je hotový: číslo, znamienko, číslo, … (nepárna dĺžka, začína a končí číslom)
// vzorec bez prázdnych políčok na konci (prázdne políčko v strede = nehotový vzorec)
export const used = arr => { const s = [...arr]; while (s.length && s[s.length - 1] == null) s.pop(); return s; };
export function spellOk(pack, r = 0) {
  const ids = used(pack.rows[r] || []); if (!ids.length) return false; if (ids.includes(null)) return false;
  const s = ids.map(id => tok(pack, id));
  return s.length % 2 === 1 && s.every((x, i) => x && (i % 2 ? x.t === 'o' : isNum(x)));
}
export const label = x => x.t === 'd' ? '□' : String(x.v);
export const dieMax = run => (run.range <= 5 ? 4 : 9);

// hod: kocky dostanú čísla tak, aby výsledok bol vždy celé nezáporné číslo (počíta sa zľava doprava).
// Pevné číslo sa nikdy nemení: ak by nesedelo (7 od menšieho, delenie so zvyškom), kocky sa hodia znova.
function tryRoll(run, rng, r) {
  const pack = run.pack, s = used(pack.rows[r] || []).map(id => tok(pack, id)), M = dieMax(run);
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  let cur = s[0].t === 'd' ? ri(1, Math.min(M, run.range - 1)) : s[0].v;
  const parts = [cur], ops = [];
  for (let i = 1; i < s.length; i += 2) {
    const op = s[i].v, nt = s[i + 1], die = nt.t === 'd'; let n;
    if (op === '+') n = die ? ri(1, cur < run.range ? Math.max(1, Math.min(M, run.range - cur)) : M) : nt.v;   // kocka drží súčet v rozsahu
    else if (op === '-') { if (!die && nt.v > cur) return null; n = die ? ri(cur > 0 ? 1 : 0, cur) : nt.v; }
    else if (op === '×') n = die ? ri(1, Math.min(5, M)) : nt.v;
    else { // ÷ len bezo zvyšku
      if (!die && (nt.v === 0 || cur % nt.v)) return null;
      const divs = []; for (let d = 1; d <= Math.max(1, cur); d++) if (cur % d === 0) divs.push(d);
      n = die ? divs[ri(0, divs.length - 1)] : nt.v;
    }
    cur = op === '+' ? cur + n : op === '-' ? cur - n : op === '×' ? cur * n : cur / n;
    parts.push(op, n); ops.push(op);
  }
  return { text: parts.join(''), answer: cur, ops };
}
export function rollSpell(run, rng = Math.random, row = 0) { if (!spellOk(run.pack, row)) return null; for (let k = 0; k < 60; k++) { const r = tryRoll(run, rng, row); if (r) return r; } return null; }
// vzorec je hotový a dá sa aj vypočítať (napr. 2 − 7 nikdy nevyjde)
export const spellWorks = (run, row = 0) => spellOk(run.pack, row) && !!rollSpell(run, Math.random, row);
export const workingRows = run => run.pack.rows.map((_, i) => i).filter(i => spellWorks(run, i));
// sila vzorca: najmenej / priemer / najviac (200 hodov)
export function strength(run, rng = Math.random, row = 0) {
  if (!spellWorks(run, row)) return null;
  let lo = 1e9, hi = 0, sum = 0; for (let k = 0; k < 200; k++) { const a = rollSpell(run, rng, row).answer; lo = Math.min(lo, a); hi = Math.max(hi, a); sum += a; }
  return { lo, hi, avg: Math.round(sum / 200) };
}

// život nepriateľa = druh × typická sila kúzla podľa rozsahu čísel (zbojník padne na 1–2 zásahy)
const KIND_HP = { rogue: 1, hooded: 1, knight: 1.6, barbarian: 2.2, innkeeper: 1 };
export function enemyHp(run, kind, boss, elite) {
  const S = Math.max(3, Math.round(run.range * 0.8 + (run.zone - 1) * 2));
  return Math.round(S * (boss ? 7 : (KIND_HP[kind] || 1) * (elite ? 1.6 : 1)));
}

// korisť: znamienko (len odomknuté), kocka, alebo pevné číslo s váhou 1/v (malé častejšie, veľké vzácne a silné)
// korisť: rozšírenie ruksaku (vzácne), znamienko (len už získané od vodcu), kocka □ (vzácna), inak pevné číslo s váhou 1/v
export function lootToken(run, rng = Math.random, tier = 0) {
  const ops = ['+', ...run.ops.filter(o => o !== '+')], r = rng();
  if (r < 0.06 + tier * 0.1 && run.pack.slots < MAX_SLOTS) return { t: 'slot' };
  if (r < 0.1 + tier * 0.12 && run.pack.rows.length < MAX_ROWS) return { t: 'row' };
  if (r < 0.2 + tier * 0.08) return { t: 'o', v: ops[Math.floor(rng() * ops.length)] };
  if (r < 0.3) return { t: 'd' };
  const top = Math.min(9, run.range), w = []; let sum = 0;
  for (let v = 1; v <= top; v++) { sum += 1 / v; w.push(sum); }
  const x = rng() * sum; return { t: 'n', v: 1 + w.findIndex(c => x <= c) };
}
export const MAX_INV = 14;
export function addToken(pack, t) {
  if (t.t === 'slot') { pack.slots = Math.min(MAX_SLOTS, pack.slots + 2); return true; }
  if (t.t === 'row') { if (pack.rows.length < MAX_ROWS) pack.rows.push([]); return true; } if (pack.inv.length >= MAX_INV) return false; pack.inv.push({ ...t, id: pack.next++ }); return true; }
// cena ďalších dvoch políčok rastie s veľkosťou ruksaku
export const slotPrice = pack => 4 + pack.slots * 3;
export const rowPrice = pack => 6 + pack.rows.length * 8;      // ďalšie kúzlo (riadok)
export const staffPrice = pack => 8 + pack.staff * 7;          // lepšia palica: kratšie nabíjanie, väčšie svetlo
export const cooldown = (pack, row) => (0.35 + used(pack.rows[row] || []).filter(x => x != null).length * 0.12) * (1 - pack.staff * 0.15);
export const MAX_SLOTS = 9;
