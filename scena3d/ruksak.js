// Ruksak = kalkulačka kúziel (režim Pokročilý). Do políčok skladáš vzorec z nájdených dielov: □ (kocka = náhodné číslo),
// pevné čísla a znamienka. Pri zoslaní sa kocky hodia, ty vypočítaš výsledok = damage. Znamienka pridajú živly.
// Všetko zo vzorcov – korisť, životy nepriateľov aj ceny. Bez grafiky – dá sa testovať v Node.

import { FACT_CAP, FACT_CAP_ENDLESS, FINAL_ZONE, spellCost } from './balance.js';

// začiatok: 1 + 1 z pevných čísel; lepšie čísla, rozšírenie ruksaku a kocky □ sa nachádzajú, nové znamienko dá vodca
// rows = kúzla (riadky kalkulačky, max 3) – v súboji sa striedajú v poradí ako na palici v Magicrafte; staff = úroveň palice
export const newPack = () => ({ slots: 3, inv: [{ id: 1, t: 'n', v: 1 }, { id: 2, t: 'o', v: '+' }, { id: 3, t: 'n', v: 1 }], rows: [[1, 2, 3]], staff: 0, next: 4 });
export function migratePack(p) { if (!p.rows) { p.rows = [p.spell || []]; delete p.spell; } p.rows = p.rows.map(r => r.filter(x => x != null)); p.staff = p.staff || 0; p.kind = p.kind || 'zakladna'; return p; }
export const MAX_ROWS = 3, MAX_STAFF = 3;
export const allIds = pack => new Set(pack.rows.flat().filter(x => x != null));
// špeciálne klávesy (odomknú bossovia, natrvalo): zátvorky a odmocnina – nespotrebúvajú sa, v riadku majú záporné id
export const SPECIAL = { [-1]: { id: -1, t: 'p', v: '(' }, [-2]: { id: -2, t: 'p', v: ')' }, [-3]: { id: -3, t: 's', v: '√' }, [-4]: { id: -4, t: 'x', v: '²' }, [-5]: { id: -5, t: 'x', v: '³' }, [-6]: { id: -6, t: 'x', v: '!' } };
const tok = (pack, id) => id < 0 ? SPECIAL[id] : pack.inv.find(x => x.id === id);
export const tokOf = tok;
export const isNum = x => x && (x.t === 'd' || x.t === 'n');
export const used = arr => { const s = [...arr]; while (s.length && s[s.length - 1] == null) s.pop(); return s; };
export const label = x => x.t === 'd' ? '□' : String(x.v);
export const dieMax = run => (run.range <= 5 ? 4 : 9);

// VÝPOČET VZORCA so správnym poradím: zátvorky → √ → × ÷ → + −  (gramatika: výraz = člen (± člen)*, člen = faktor (×÷ faktor)*,
// faktor = číslo | □ | ( výraz ) | √ faktor). Vráti hodnotu, text a zoznam znamienok (živly) alebo null, keď vzorec nie je hotový.
function evalSpell(toks, die, stars = null, cap = 12) {
  let i = 0; const ops = []; let div = 0, divOk = false, sub = 0, mul = 0, depth = 0;   // posledné delenie: deliteľ a či vyšlo bezo zvyšku
  // za číslom / zátvorkou môže ísť JEDNA funkcia: ² ³ ! (reťaz 9²² by hru rozbila hneď)
  // faktoriál do 7! počas 8 zón, v nekonečne do 12! = 479 001 600 – vtedy sa hra dá „rozbiť“
  const fact = n => { n = Math.max(0, Math.min(cap, Math.round(n))); let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; };
  const factor = () => {
    let f = primary(); if (!f) return null;
    if (toks[i] && toks[i].t === 'x') { const o = toks[i++].v; ops.push(o); f = o === '²' ? { v: f.v * f.v, s: f.s + '²' } : o === '³' ? { v: f.v ** 3, s: f.s + '³' } : { v: fact(f.v), s: f.s + '!' }; if (toks[i] && toks[i].t === 'x') return null; }   // len jedna funkcia za sebou (9²² nie)
    return f;
  };
  const primary = () => {
    const t = toks[i];
    if (!t) return null;
    if (t.t === 'n') { i++; const m = 1 + ((stars && stars[t.v]) || 0), v = t.v * m; return { v, s: String(v) }; }   // vylepšený kláves 7★ = 14
    if (t.t === 'd') { i++; const v = die(); return { v, s: String(v) }; }
    if (t.t === 's') { i++; ops.push('√'); const f = factor(); return f && { v: Math.sqrt(Math.max(0, f.v)), s: '√' + f.s }; }
    if (t.t === 'p' && t.v === '(') { i++; depth++; const e = expr(); depth--; if (!e || !toks[i] || toks[i].v !== ')') return null; i++; return { v: e.v, s: '(' + e.s + ')' }; }
    return null;
  };
  const term = () => {
    let a = factor(); if (!a) return null;
    while (toks[i] && toks[i].t === 'o' && (toks[i].v === '×' || toks[i].v === '÷')) { const o = toks[i++].v; ops.push(o); const b = factor(); if (!b) return null; if (o === '×') mul = Math.max(mul, Math.min(Math.abs(a.v), Math.abs(b.v))); if (o === '÷') { div = b.v; divOk = !!b.v && Number.isInteger(a.v / b.v); } a = { v: o === '×' ? a.v * b.v : (b.v ? a.v / b.v : 0), s: a.s + o + b.s }; }
    return a;
  };
  const expr = () => {
    let a = term(); if (!a) return null;
    while (toks[i] && toks[i].t === 'o' && (toks[i].v === '+' || toks[i].v === '-')) { const o = toks[i++].v; ops.push(o); const b = term(); if (!b) return null; if (o === '-' && depth === 0) sub += b.v; a = { v: o === '+' ? a.v + b.v : a.v - b.v, s: a.s + o + b.s }; }
    return a;
  };
  const e = expr();
  if (!e || i !== toks.length) return null;
  return { value: e.v, text: e.s, ops, div: divOk ? div : 0, sub: Math.max(0, sub), mul };
}
export function spellOk(pack, r = 0) {
  const ids = used(pack.rows[r] || []); if (!ids.length || ids.includes(null)) return false;
  const t = ids.map(id => tok(pack, id)); if (t.some(x => !x)) return false;
  return !!evalSpell(t, () => 1);
}
// hod: kocky □ padnú náhodne (1 … max podľa rozsahu); damage = výsledok zaokrúhlený, nie menej ako 0 (≈ pri odmocnine a delení)
function tryRoll(run, rng, r) {
  const pack = run.pack, t = used(pack.rows[r] || []).map(id => tok(pack, id)), M = dieMax(run);
  const res = evalSpell(t, () => 1 + Math.floor(rng() * M), pack.stars, run.zone > FINAL_ZONE ? FACT_CAP_ENDLESS : FACT_CAP); if (!res) return null;
  const answer = Math.max(0, Math.round(res.value));
  return { text: res.text, answer, value: res.value, div: res.div, sub: res.sub, mul: res.mul, exact: Math.abs(res.value - Math.round(res.value)) < 1e-9, ops: res.ops };
}
export function rollSpell(run, rng = Math.random, row = 0) { if (!spellOk(run.pack, row)) return null; return tryRoll(run, rng, row); }
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
// energia kúzla = súčet cien klávesov (balance.js KEY_COST)
export const rowCost = (pack, r) => spellCost(used(pack.rows[r] || []).map(id => tok(pack, id)));
export const cooldown = (pack, row) => (0.35 + used(pack.rows[row] || []).filter(x => x != null).length * 0.12) * (1 - pack.staff * 0.15);
export const MAX_SLOTS = 9;
