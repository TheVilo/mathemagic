import { itemN } from './vylepsenia.js';
// PALICA SO SLOTMI (Majster, podľa Magicraftu): 1. slot = základné číslo, ďalšie sloty = operácie (moduly) ako karty.
// Kalkulačka počíta ZĽAVA DOPRAVA, krok za krokom: 3 → +4 → ×2 = 14, ale 3 → ×2 → +4 = 10 → poradie je hádanka.
// Každý modul má číslo aj živel a stojí energiu. Dva rovnaké moduly sa spoja (+3 a +3 → +6, ×2 a ×2 → ×3).
// Bez grafiky – dá sa testovať v Node.

// moduly: o = operácia, v = číslo (pri funkciách nie je), cena energie, živel, vzácnosť
export const MOD = {
  '+': { name: 'zem', text: 'omráči', cost: () => 1 },
  '-': { name: 'oheň', text: 'odčítané dohorí', cost: () => 1 },
  '×': { name: 'vzduch', text: 'odhodí', cost: () => 2 },
  '÷': { name: 'voda', text: 'rozdelí na kvapky', cost: () => 2 },
  '√': { name: 'koreň', text: 'zakorení · prerazí štít', cost: () => 3 },
  '²': { name: 'mocnina', text: 'obrovské číslo', cost: () => 4 },
  '³': { name: 'mocnina', text: 'ešte väčšie číslo', cost: () => 6 },
  '!': { name: 'faktoriál', text: 'najväčšie číslo', cost: () => 8 },
  // ŠPECIÁLNE ÚTOKY = matematické konštanty (legendárne): násobia výsledok a menia tvar útoku
  'π': { name: 'Ludolfovo číslo', text: '×π · zasiahne všetkých v kruhu s polomerom π m', cost: () => 5 },
  'e': { name: 'Eulerovo číslo', text: '×e · preskakuje ďalej, zakaždým ÷ e', cost: () => 5 },
  'φ': { name: 'Zlatý rez', text: '×φ · 5 strel, každá ďalšia ÷ φ', cost: () => 4 },
};
export const numCostW = v => v <= 4 ? 1 : v <= 7 ? 2 : 3;   // základné číslo: väčšie = drahšie
export const CONST = { 'π': Math.PI, 'e': Math.E, 'φ': (1 + Math.sqrt(5)) / 2 };
export const modLabel = m => m.t === 'num' ? String(m.v) : CONST[m.o] ? '×' + m.o : (m.o === '²' || m.o === '³' || m.o === '!') ? 'x' + m.o : m.o === '√' ? '√' : m.o + m.v;
export const modCost = m => m.t === 'num' ? numCostW(m.v) : MOD[m.o].cost(m.v);
export const modRar = m => m.t === 'num' ? (m.v >= 8 ? 'e' : m.v >= 5 ? 'v' : 'b') : CONST[m.o] ? 'l' : m.o === '²' || m.o === '³' || m.o === '!' ? 'l' : m.o === '√' ? 'e' : m.o === '×' || m.o === '÷' ? (m.v >= 4 ? 'e' : 'v') : (m.v >= 7 ? 'v' : 'b');
export const sameMod = (a, b) => a && b && a.t === b.t && a.o === b.o && a.v === b.v;

// počet slotov podľa palice (+1 slot za každé „+2 políčka“ v ruksaku)
export const WAND_SLOTS = { zakladna: 3, rychla: 3, tazka: 4, dvojita: 3, vedecka: 5, graficka: 6 };
// VIAC PALÍC (ako Magicraft): najviac 4, každá má svoj druh (počet jamiek, rýchlosť, pravidlo); strieľajú PO RADE 1 → 2 → 3 → 4
export const MAX_WANDS = 4;
export const wandKind = (pack, i) => (pack.wands && pack.wands[i] && pack.wands[i].kind) || (i === 1 && pack.kind2) || pack.kind || 'zakladna';
export const wandSlots = (pack, i) => (WAND_SLOTS[wandKind(pack, i)] || 3) + Math.max(0, Math.floor(((pack.slots || 3) - 3) / 2));
// nová palica: do voľného miesta, inak null (treba vybrať, ktorú vymeniť)
export function addWand(pack, kind) { if (pack.wands.length >= MAX_WANDS) return null; pack.wands.push({ kind, slots: [{ t: 'num', v: 1 }] }); return pack.wands.length - 1; }
// výmena: moduly prejdú na novú palicu, čo sa nezmestí, ide do ruksaku
export function replaceWand(pack, i, kind) { const old = pack.wands[i]; pack.wands[i] = { kind, slots: [] }; const n = wandSlots(pack, i); pack.wands[i].slots = old.slots.slice(0, n); pack.bag.push(...old.slots.slice(n)); }

export const newWand = (kind = 'zakladna') => ({ kind, slots: [{ t: 'num', v: 1 }, { t: 'mod', o: '+', v: 1 }] });

// VÝPOČET zľava doprava; text so zátvorkami, aby bol matematicky správny: ((3+4)×2)
export function evalWand(slots, cap = 7) {
  const s = (slots || []).filter(Boolean);
  if (!s.length || s[0].t !== 'num') return null;
  const fact = n => { n = Math.max(0, Math.min(cap, Math.round(n))); let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; };
  let v = s[0].v, text = String(s[0].v), ops = [], div = 0, sub = 0, mul = 0, low = true;   // low = posledná operácia bola + alebo − (pri × treba zátvorku)
  for (const m of s.slice(1)) {
    if (m.t !== 'mod') continue;
    const o = m.o; ops.push(o);
    if (o === '+' || o === '-') { v = o === '+' ? v + m.v : v - m.v; if (o === '-') sub += m.v; text += o + m.v; low = true; continue; }
    const wrap = low && text.length > 1 && /[+\-]/.test(text.slice(1)) ? '(' + text + ')' : text;
    if (o === '×') { v *= m.v; mul = Math.max(mul, m.v); text = wrap + '×' + m.v; }
    else if (o === '÷') { div = Number.isInteger(v / m.v) ? m.v : 0; v = v / m.v; text = wrap + '÷' + m.v; }
    else if (o === '²') { v = v * v; text = wrap + '²'; }
    else if (o === '³') { v = v ** 3; text = wrap + '³'; }
    else if (o === '!') { v = fact(v); text = wrap + '!'; }
    else if (o === '√') { v = Math.sqrt(Math.max(0, v)); text = '√' + wrap; }
    else if (CONST[o]) { v *= CONST[o]; text = wrap + '×' + o; }
    low = false;
  }
  return { value: v, text, ops, div, sub: Math.max(0, sub), mul };
}
// cena výstrelu; vylepšenie Lacné krát zníži cenu každého × (najmenej 1)
export const wandCost = (slots, pack) => { const k = itemN(pack, 'krat'); return (slots || []).filter(Boolean).reduce((a, m) => a + (k && m.o === '×' ? Math.max(1, modCost(m) - k) : modCost(m)), 0); };

// ZÍSKANIE MODULU: rovnaký už máš → spoja sa; inak do prvého voľného slotu palice A (B), inak do ruksaku
export function acquireMod(pack, m) {
  const all = [...pack.wands.flatMap(w => w.slots), ...pack.bag];
  const same = all.find(x => sameMod(x, m) && x.t === 'mod');
  if (same && m.t === 'mod') {
    if (same.o === '+' || same.o === '-') same.v *= 2; else if (same.o === '×' || same.o === '÷') same.v += 1; else { pack.bag.push({ ...m }); return 'bag'; }
    return 'merge';
  }
  if (m.t === 'num') { const w = pack.wands[0]; if (!w.slots[0] || m.v > w.slots[0].v) { if (w.slots[0]) pack.bag.push(w.slots[0]); w.slots[0] = { ...m }; return 'base'; } pack.bag.push({ ...m }); return 'bag'; }
  for (let i = 0; i < pack.wands.length; i++) { const w = pack.wands[i]; if (w.slots.length < wandSlots(pack, i)) { w.slots.push({ ...m }); return 'slot' + i; } }
  pack.bag.push({ ...m }); return 'bag';
}

// PONUKA MODULOV pri úrovni a u obchodníka: čísla okolo μ = 1 + 0,5·L, × ÷ od úrovne 3, funkcie vzácne a neskôr
const gate = (L, Lmin) => L < Lmin ? 0 : 1 - Math.exp(-(L - Lmin + 1) / 3);
const nw = (v, L) => Math.exp(-((v - (1 + 0.5 * L)) ** 2) / (2 * 1.8 * 1.8));
export function wandOffers(L, run, rng = Math.random, n = 3) {
  const pool = [];
  const add = (m, w) => { if (w > 0.01) pool.push({ m, w }); };
  for (let v = 1; v <= 9; v++) { add({ t: 'mod', o: '+', v }, nw(v, L) * 1.0); add({ t: 'mod', o: '-', v }, nw(v, L) * 0.5 * gate(L, 2)); }
  for (let v = 2; v <= 5; v++) { add({ t: 'mod', o: '×', v }, 0.5 * gate(L, 3) * Math.exp(-(v - 2) * 0.7)); add({ t: 'mod', o: '÷', v }, 0.35 * gate(L, 4) * Math.exp(-(v - 2) * 0.7)); }
  for (let v = 2; v <= 9; v++) add({ t: 'num', v }, nw(v, L) * 0.5);
  add({ t: 'mod', o: '√' }, 0.25 * gate(L, 6)); add({ t: 'mod', o: '²' }, 0.2 * gate(L, 9)); add({ t: 'mod', o: '³' }, 0.12 * gate(L, 14)); add({ t: 'mod', o: '!' }, 0.08 * gate(L, 18));
  add({ t: 'mod', o: 'π' }, 0.14 * gate(L, 4)); add({ t: 'mod', o: 'e' }, 0.12 * gate(L, 5)); add({ t: 'mod', o: 'φ' }, 0.12 * gate(L, 6));   // špeciálne útoky
  const out = [];
  while (out.length < n && pool.length) {
    const sum = pool.reduce((a, b) => a + b.w, 0); let r = rng() * sum; let i = pool.findIndex(p => (r -= p.w) <= 0); if (i < 0) i = pool.length - 1;
    const { m } = pool.splice(i, 1)[0];
    const M = MOD[m.o];
    out.push({ id: 'w' + modLabel(m), w: 1, give: { t: 'wmod', m }, title: m.t === 'num' ? `Základ ${m.v}` : `Modul ${modLabel(m)}`, text: m.t === 'num' ? `palica začína číslom ${m.v} · ⚡${numCostW(m.v)}` : `${M.name}: ${M.text} · ⚡${modCost(m)}` });
  }
  return out;
}
