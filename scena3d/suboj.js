// Súboj na mieste: banda sa zdvihne od ohňa a ide naraz, každý bojovník má nad hlavou vlastný príklad.
// Napíšeš výsledok → kúzlo vyletí z kryštálu palice do toho, komu patrí. Karty z Knihy kúziel pridávajú efekty.
import { THREE, scene, camera, spark, burst, pix, shortNum } from './svet.js';
import { hero, crystal, crystalLight, heroPlay, makeFighter, lamp } from './postavy.js';
import { makeProblem, lvl } from './karty.js';
import { rollSpell, spellWorks, enemyHp, workingRows, rowCost, used, tokOf } from './ruksak.js';
import { staffStats, manaStats, SHOT_MIN } from './balance.js';
import { evalWand, wandKind, CONST } from './wand.js';
import { applyRules, itemN } from './vylepsenia.js';
import { kresbaMat, setOrbs } from './kresba.js';
import { efekt, akord, dopad } from './zvuk.js';
import { addImpact, drawImpacts, mainOp } from './dopad.js';

let G = null;
export function initFight(g) { G = g; }
export const fight = { rings: [], on: false, enemies: [], bolts: [], streak: 0, input: '', shield: 0, aim: null, boss: null, slow: 1 };
const spells = [], chains = [];
// pevná zásoba svetiel: nové svetlo v scéne = prekompilovanie všetkých materiálov (sekanie), preto sa len požičiavajú
const POOL = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffffff, 0, 5, 1.6); l.busy = false; scene.add(l); return l; });
function borrow(color, dist = 4.5) { const l = POOL.find(x => !x.busy) || POOL[0]; l.busy = true; l.color.set(color); l.distance = dist; l.intensity = 0; return l; }
function giveBack(l) { if (!l) return; l.busy = false; l.intensity = 0; }
const targets = () => [...fight.enemies.filter(e => e.state !== 'dead'), ...fight.bolts.filter(b => !b.adv)];   // strely Majstra sa nedajú zostreliť ani nemajú štítok
export { targets };

// výsledky na scéne sa nesmú biť (ani 1 a 10 naraz), aby kúzlo vždy vedelo, kam letieť
const clash = (a, b) => { const x = String(a), y = String(b); return x.startsWith(y) || y.startsWith(x); };
function fresh(kind, self) {
  let p;
  for (let k = 0; k < 80; k++) { p = makeProblem(G.run, kind); if (!targets().some(t => t !== self && t.p && clash(t.p.answer, p.answer))) break; }
  p.born = G.now; return p;
}

// ---------- štítky nad hlavami ----------
function makeTag(t, name) {
  const el = document.createElement('div'); el.className = 'tag';
  // Majster: bez mena – len život (číslo) a štít; Učeň: meno + srdiečka
  el.innerHTML = fight.adv && G.run.mode === 'pokrocily' ? `<div class="nm"><span class="hp"></span></div><div class="pr"></div>` : `${name ? `<div class="nm">${name}<span class="hp"></span></div>` : ''}<div class="pr"></div>`;
  G.tagsEl.appendChild(el); t.el = el;
}
function renderTag(t) {
  t.w = 0;
  if (fight.adv && !t.bolt) { // Pokročilý: nad hlavou je život ako číslo, kúzlo ho zníži o výsledok
    if (t.el.classList.contains('bossbar')) { t.el.querySelector('.pr').innerHTML = `<i class="hpb"><b style="width:${Math.round(Math.max(0, t.hp) / (t.maxHp || 1) * 100)}%"></b></i>`; return; }
    t.el.querySelector('.pr').innerHTML = pix(shortNum(Math.max(0, t.hp)));
    t.el.classList.toggle('shield', !!t.shield); t.el.classList.toggle('match', fight.target === t);
    const hp = t.el.querySelector('.hp'); if (hp) hp.innerHTML = t.shield ? '<b class="sh"></b>' : '';
    return;
  }
  t.el.querySelector('.pr').innerHTML = pix(t.p.text);
  t.el.classList.toggle('minus', t.p.op === '-');
  t.el.classList.toggle('shield', !!t.shield);
  const hp = t.el.querySelector('.hp'); if (hp) hp.innerHTML = (t.shield ? '<b class="sh"></b>' : '') + '<i></i>'.repeat(Math.max(0, t.hp));
}
const targetPos = t => t.bolt ? t.mesh.position.clone() : t.g.position.clone().add(new THREE.Vector3(0, t.h * 0.55, 0));
// štítky sa nesmú prekrývať: ten vyššie na obrazovke sa posunie ešte vyššie
export function drawTags(camera) {
  const placed = [];
  const list = targets().map(t => {
    const v = (t.bolt ? t.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)) : t.g.position.clone().add(new THREE.Vector3(0, t.h + 0.35, 0))).project(camera);
    if (!t.w) { t.w = t.el.offsetWidth; t.hh = t.el.offsetHeight + 14; }
    return { t, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }).sort((a, b) => b.y - a.y);
  for (const a of list) {
    for (let k = 0; k < 6; k++) {
      const hit = placed.find(b => Math.abs(a.x - b.x) < (a.t.w + b.t.w) / 2 + 4 && a.y > b.y - b.t.hh && a.y - a.t.hh < b.y);
      if (!hit) break;
      a.y = hit.y - hit.t.hh;
    }
    placed.push(a);
    a.t.el.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, -100%)`;
  }
}

// ---------- začiatok súboja ----------
// band = bojovníci sediaci pri ohni (z hra.js), opts.boss / opts.elite
export function startFight(band, opts = {}) {
  Object.assign(fight, { on: true, enemies: [], bolts: [], streak: 0, input: '', aim: null, boss: null, opts, summoned: 0, adv: G.run.mode === 'pokrocily', target: null, roll: null, charged: null, cd: 0, cdMax: 1, row: 0, combo: 0, lastHit: -9, hb: null });
  fight.shield = lvl(G.run, 'stit');
  for (const f of band) addEnemy(f, opts.boss && f.size > 1.2, opts.elite && f === band[0]);
  if (fight.adv) newRoll();
  G.renderStreak(); renderInput();
}
// Pokročilý: z vzorca v ruksaku sa hodí nový príklad (□ = náhodné číslo)
function newRoll() { fight.roll = spellWorks(G.run) ? rollSpell(G.run) : null; if (fight.roll) fight.roll.born = G.now; }
const aimAt = () => { const live = fight.enemies.filter(e => e.state !== 'dead'); if (fight.target && live.includes(fight.target)) return fight.target; return live.sort((a, b) => a.g.position.distanceTo(hero.position) - b.g.position.distanceTo(hero.position))[0] || null; };
export function setTarget(e) { if (!fight.adv || !fight.enemies.includes(e) || e.state === 'dead') return; fight.target = e; for (const t of fight.enemies) if (t.el) renderTag(t); if (fight.charged) fireAt(e); }
// MAJSTER (ako Magicraft): kúzla sú v ruksaku, v súboji sa nepočíta – klik = výstrel kam mieriš.
// Výsledok vzorca = damage aj sila efektu; dlhší vzorec sa dlhšie nabíja. Vedľa = kúzlo dopadne na zem.
// kúzla (riadky ruksaku) sa striedajú v poradí 1 → 2 → 3 → 1, preskočia sa nehotové
// DVE PALICE: ľavá (B) má vlastný riadok P.bRow, vlastnú energiu run.energy2 a vlastný čas medzi výstrelmi; pravá (A) strieda ostatné riadky
const hasB = () => !G.run.pack.wands && !!(G.run.pack.kind2 && G.run.pack.bRow != null && (G.run.pack.wands || G.run.pack.rows)[G.run.pack.bRow]);
const rowsOk = () => workingRows(G.run).filter(i => !(hasB() && i === G.run.pack.bRow));
// palice po rade: rýchlosť, sila a pravidlo podľa palice, ktorá je na rade; mana spoločná (manaStats)
export const handStats = h => { const P = G.run.pack; if (P.wands) { const S = staffStats({ ...P, kind: wandKind(P, curRow()) }), M = manaStats(P); return { ...S, emax: M.emax, regen: M.regen }; } return h === 'b' ? staffStats({ ...P, kind: P.kind2 }) : staffStats(P); };
export const handEnergy = h => { const k = h === 'b' ? 'energy2' : 'energy', m = handStats(h).emax; return Math.min(m, G.run[k] ?? m); };
export const curRow = () => { const ok = rowsOk(); return ok.includes(fight.row) ? fight.row : ok[0] ?? 0; };
function nextRow() { const ok = rowsOk(); if (!ok.length) return; const i = ok.indexOf(curRow()); fight.row = ok[(i + 1) % ok.length]; }
let lastAim = null;
// energia palice (run.energy); nový beh začína plnou
export const energy = () => handEnergy('a');
export function fireAt(e, groundPoint = null, hand = 'a') {
  if (hand === 'b' && !hasB()) return false;
  const cdK = hand === 'b' ? 'cd2' : 'cd';
  if (G.run.mode !== 'pokrocily' || fight[cdK] > 0) return false;   // Majster strieľa kedykoľvek (aj mimo súboja)
  const row = hand === 'b' ? G.run.pack.bRow : curRow(), r = rollSpell(G.run, Math.random, row); if (!r) { G.say(hand === 'b' ? 'Ľavá palica: vzorec v Knihe nie je hotový.' : 'Kniha: vzorec kúzla nie je hotový.'); return false; }
  let t = e && fight.enemies.includes(e) && e.state !== 'dead' ? e : null;
  if (!t && !groundPoint) t = aimAt();
  if (!t && !groundPoint) return false;
  if (!t) { const g = new THREE.Object3D(); g.position.copy(groundPoint); t = { fake: true, g, h: 0, el: { classList: { add() {}, remove() {} } } }; }
  lastAim = { p: targetPos(t), t: G.now };
  // PALICA = KALKULAČKA S ENERGIOU: výstrel stojí súčet cien klávesov; bez energie sa nestrieľa (dobíja sa samo)
  const SK = handStats(hand), cost = rowCost(G.run.pack, row), E = handEnergy(hand);
  if (E + 1e-6 < cost) { fight.lowE = G.now; fight.lowH = hand; G.say(`Málo energie: kúzlo stojí ${cost}, palica má ${Math.floor(E)}/${SK.emax}.`, 1200); renderInput(); return false; }
  G.run[hand === 'b' ? 'energy2' : 'energy'] = E - cost;
  fight[cdK] = SHOT_MIN * SK.cd; if (hand === 'a') { fight.cdMax = fight.cd; nextRow(); }
  // − ZÁPORNÝ VÝSLEDOK (3 − 8 = −5): kúzlo nezraní, ale vylieči |−5| = 5 života; nabíja sa 12 s
  if (r.value < 0) {
    if ((fight.healT || 0) > G.now) { G.say(`Liečenie sa nabíja ešte ${Math.ceil(fight.healT - G.now)} s.`, 1200); return true; }
    fight.healT = G.now + 12; const hl = Math.abs(Math.round(r.value)); G.heal && G.heal(hl, true); G.floatText(`<span style="color:#ff6a5a">${pix(String(Math.round(r.value)))} → +${hl} života</span>`, hero.position.clone().add(new THREE.Vector3(0, 2.6, 0)), 'dmg');
    burst(hero.position.clone().add(new THREE.Vector3(0, 1, 0)), 90, 2.5, 0xff6a5a, 0.9); renderInput(); return true;
  }
  // karty: Násobič ×1,5 / ×2; Kritický zásah: šanca 8 % (+10 / +22 % s kartou) na ×2 a väčšie znamienka
  let v = Math.round(r.answer * [1, 1.5, 2][lvl(G.run, 'krat')] * SK.dmg);   // palica: model × úroveň (+25 % za úroveň)
  const crit = Math.random() < [0, 0.18, 0.3][lvl(G.run, 'krit')]; if (crit) v *= 2;   // kritický len s kartou
  // VYLEPŠENIA: pravidlá na vlastnosti výsledku (párne, prvočísla, deliteľnosť…) – vylepsenia.js
  const RU = applyRules(G.run.pack, r.answer, SK.rule); v = Math.round(v * RU.k);
  if (RU.fx.fast < 1) fight[cdK] *= RU.fx.fast;
  if (RU.tags.length && !t.fake && G.now - (fight.tagT || 0) > 0.7) { fight.tagT = G.now; G.floatText(`<span style="color:#ffd25a">${RU.tags.join(' · ')}</span>`, hero.position.clone().add(new THREE.Vector3(0, 2.9, 0))); }
  // ÷ ROZDELENIE: 12 ÷ 3 = 3 strely po 4 na troch najbližších (spolu ako delenec) – delí sa len bezo zvyšku, najviac 6 striel
  if (r.div >= 2 && !t.fake) {
    const n = Math.min(8, Math.min(6, r.div) + [0, 1, 2][lvl(G.run, 'dazd')]), near = fight.enemies.filter(o => o !== t && o.state !== 'dead').sort((a, b) => a.g.position.distanceTo(t.g.position) - b.g.position.distanceTo(t.g.position)).slice(0, n - 1);
    near.forEach((o, i) => cast(o, { v, raw: r.answer, op: '÷', ops: r.ops, text: r.text, extra: true, hand, delay: 0.08 * (i + 1), power: Math.min(1.6, Math.max(0.15, v / 12)) }));
    if (near.length) G.floatText(`÷ ${r.div} strely`, hero.position.clone().add(new THREE.Vector3(0, 2.6, 0)));
  }
  const fireK = r.answer > 0 ? v / r.answer : SK.dmg;   // horenie sa násobí rovnako ako zásah (palica, karty, kritický)
  cast(t, { v, raw: r.answer, op: r.ops[0] || null, ops: r.ops, text: r.text, cost, hand, crit, burn: Math.round((r.sub || 0) * fireK), mul: r.mul || 0, plus: r.ops.filter(o => o === '+').length, power: Math.min(1.6, Math.max(0.15, v / 12)) });
  // Dvojitá palica: druhé kúzlo na ďalšieho najbližšieho
  if (SK.shots > 1 && !t.fake) { const t2 = fight.enemies.filter(o => o !== t && o.state !== 'dead').sort((a, b) => a.g.position.distanceTo(t.g.position) - b.g.position.distanceTo(t.g.position))[0]; if (t2) cast(t2, { v, raw: r.answer, op: r.ops[0] || null, ops: r.ops, text: r.text, extra: true, delay: 0.12, power: Math.min(1.6, Math.max(0.15, v / 12)) }); }
  if (!t.fake) {   // vylepšenia: ďalšie strely (nepárne, prvočísla, tretiny) a výbuch okrúhleho čísla
    const tp = t.g.position.clone(), taken = [];
    const near = (from, k) => fight.enemies.filter(o => o !== t && o.state !== 'dead' && !taken.includes(o)).sort((a, b) => a.g.position.distanceTo(from) - b.g.position.distanceTo(from)).slice(0, k);
    const shot = (o, val, op, i) => { taken.push(o); cast(o, { v: val, raw: r.answer, op, ops: r.ops, text: r.text, extra: true, hand, delay: 0.1 * (i + 1), power: Math.min(1.6, Math.max(0.15, val / 12)) }); };
    near(hero.position, RU.fx.extra).forEach((o, i) => shot(o, v, r.ops[0] || null, i));
    near(tp, RU.fx.prime).forEach((o, i) => shot(o, v, r.ops[0] || null, i));
    near(tp, RU.fx.split3).forEach((o, i) => shot(o, Math.max(1, Math.round(v / 3)), '÷', i));
    if (RU.fx.boom) { const rad = RU.fx.boom; setTimeout(() => { if (!fight.on) return; burst(tp.clone().add(new THREE.Vector3(0, 0.5, 0)), 160, rad * 2.5, 0xffd25a, 1); G.shake(0.4); for (const o of fight.enemies) if (o !== t && o.state !== 'dead' && o.g.position.distanceTo(tp) < rad) advHit(o, { v: Math.round(v / 2), raw: 0, extra: true, op: '×' }); }, 350); }
  }
  // ŠPECIÁLNE ÚTOKY – konštanty na palici: π = kruh s polomerom π m okolo teba, e = preskakuje a zakaždým ÷ e, φ = 5 strel, každá ÷ φ
  if (!t.fake && r.ops.some(o => CONST[o])) {
    const base = { raw: r.answer, ops: r.ops, text: r.text, extra: true, hand }, others = () => fight.enemies.filter(o => o !== t && o.state !== 'dead');
    const hit = (o, val, op, d) => cast(o, { ...base, v: Math.max(1, Math.round(val)), op, delay: d, power: Math.min(1.6, Math.max(0.15, val / 12)) });
    if (r.ops.includes('π')) {
      fight.rings.push({ x: hero.position.x, z: hero.position.z, r: Math.PI, t: 0, c: '#ffd25a' });
      others().filter(o => o.g.position.distanceTo(hero.position) < Math.PI).forEach((o, i) => hit(o, v, 'π', 0.04 * i));
      G.floatText('<span style="color:#ffd25a">π · kruh 3,14 m</span>', hero.position.clone().add(new THREE.Vector3(0, 3.1, 0)));
    }
    if (r.ops.includes('e')) {
      let from = t.g.position, val = v; const taken = [t], steps = [v];
      for (let k = 0; k < 4; k++) { val /= Math.E; if (val < 1) break; const n = fight.enemies.filter(o => !taken.includes(o) && o.state !== 'dead').sort((a, b) => a.g.position.distanceTo(from) - b.g.position.distanceTo(from))[0]; if (!n || n.g.position.distanceTo(from) > 7) break; taken.push(n); hit(n, val, 'e', 0.18 * (k + 1)); from = n.g.position; steps.push(Math.round(val)); }
      if (steps.length > 1) G.floatText(`<span style="color:#8dff98">e · ${steps.join(' → ')}</span>`, hero.position.clone().add(new THREE.Vector3(0, 3.1, 0)));
    }
    if (r.ops.includes('φ')) {
      const n = others().sort((a, b) => a.g.position.distanceTo(hero.position) - b.g.position.distanceTo(hero.position)).slice(0, 4);
      n.forEach((o, k) => hit(o, v / Math.pow((1 + Math.sqrt(5)) / 2, k + 1), 'φ', 0.12 * (k + 1)));
      if (n.length) G.floatText(`<span style="color:#f0c040">φ · ${[v, ...n.map((_, k) => Math.round(v / Math.pow(1.618, k + 1)))].join(', ')}</span>`, hero.position.clone().add(new THREE.Vector3(0, 3.1, 0)));
    }
  }

  if (!t.fake && fight.on) { fight.streak++; G.stats.ok++; G.renderStreak(); }   // Majster: žiadny blesk zadarmo – na začiatku len strieľaš a veci zbieraš
  renderInput(); return true;
}
// klik na obrazovku: nepriateľ do 90 px od kurzora = zásah, inak kúzlo letí na zem pod kurzorom
export function fireAtScreen(x, y, camera, groundPoint, hand = 'a') {
  if (G.run.mode !== 'pokrocily') return false;
  let best = null, bd = 90;
  for (const e of fight.enemies) { if (e.state === 'dead') continue; const v = targetPos(e).project(camera), sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight, d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = e; } }
  fireAt(best, best ? null : groundPoint, hand); return true;
}
// HORDA (Majster): pridá bojovníkov do prebiehajúceho súboja, alebo ho začne
export function joinFight(fs, opts = {}) {
  if (!fight.on) return startFight(fs, opts);
  for (const f of fs) addEnemy(f, false, false);
  fight.opts.horde = (fight.opts.horde || 0) + (opts.horde || 0); fight.opts.hb = (fight.opts.hb || 0) + (opts.hb || 0); fight.opts.zb = (fight.opts.zb || 0) + (opts.zb || 0);
}
function addEnemy(f, isBoss, isElite) {
  const e = Object.assign(f, { state: f.sitting ? 'stand' : 'walk', t: 0, hp: f.d.hp, shield: !!f.d.shield, flash: 0, shoot: 2.5 + Math.random() * 2, knock: 0, frozen: 0, burn: 0 });
  e.name = f.d.name;
  if (isBoss) { e.hp = 6; e.shield = false; e.name = 'Vodca zbojníkov'; e.speed = 0.32; fight.boss = e; }
  if (isElite) { e.hp = 3; e.name = 'Kapitán'; }
  if (fight.adv) {
    const tr = (isBoss && fight.opts.trait) || f.trait;
    e.hp = e.maxHp = f.dummy ? 6 : G.enemyHp ? G.enemyHp(f.kind, f.zb ? 2 : isBoss || f.hb, isElite, tr) : enemyHp(G.run, f.kind, isBoss, isElite);
    if (f.hb) { e.name = f.zb ? 'Vodca zóny' : 'Vodca hordy'; fight.hb = e; }
    if (tr) { e.trait = tr; e.name = G.bossTrait(tr).name; if (tr === 'stit') e.shield = true; }
  }   // Majster: život podľa vlny a zóny (balance.js)
  e.speed = e.speed || f.d.speed;
  if (e.state === 'stand') f.play('Sit_Floor_StandUp', 0.1); else f.play(f.d.walk);
  if (!fight.adv) e.p = fresh(e.shield ? 'missing' : isBoss ? 'normal' : f.d.prob, e);
  makeTag(e, e.name); renderTag(e);
  if (fight.adv) { e.el.style.pointerEvents = 'none'; if (!(e.hb || e.zb || isBoss)) e.el.style.display = 'none'; else e.el.classList.add('bossbar'); }   // HORDOVKA: bez čísel nad bežnými nepriateľmi, nič sa neklikne; vodca má pruh života
  fight.enemies.push(e);
  return e;
}
// vodca si privolá posily
function summon(n) {
  for (let k = 0; k < n; k++) {
    const f = makeFighter('rogue', 1, G.room);
    const b = fight.boss.g.position, a = Math.random() * 6.28;
    f.g.position.set(b.x + Math.cos(a) * 2.5, 0, b.z + Math.sin(a) * 2.5);
    addEnemy(f);
    burst(f.g.position.clone().add(new THREE.Vector3(0, 1, 0)), 60, 3, 0xd43a3a);
  }
  G.say('Vodca volá posily!');
}

// ---------- šípy strelca ----------
function shootBolt(e) {
  const mesh = new THREE.Group();
  mesh.add(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a3a })));
  mesh.position.copy(e.g.position).add(new THREE.Vector3(0, 1.3, 0)); scene.add(mesh);
  const b = { bolt: true, mesh, from: mesh.position.clone(), t: 0, dur: 9 };
  if (fight.adv) { b.dur = 1.6; b.to = hero.position.clone().add(new THREE.Vector3(0, 1.1, 0)); b.el = { remove() {}, classList: { add() {}, remove() {}, toggle() {} } }; }   // Majster: šíp letí rovno na miesto, kde si bol – uhni alebo dashni
  else { b.p = fresh('easy', b); makeTag(b); b.el.classList.add('bolt'); renderTag(b); }
  fight.bolts.push(b);
}
function removeBolt(b, hitHero) {
  const i = fight.bolts.indexOf(b); if (i >= 0) fight.bolts.splice(i, 1);
  scene.remove(b.mesh); b.el.remove();
  burst(b.mesh.position, hitHero ? 40 : 70, 3, hitHero ? 0xff7a3a : 0xffd25a, 0.7);
}

// ---------- VAROVANIE PRED ÚTOKOM (Majster) ----------
// červený obrys na zemi ukáže, KAM útok dopadne; výplň rastie a keď je plná, udrie. Kto z neho vyjde (alebo dashne), nedostane.
// kruh = úder zblízka, pás = rozbeh barbara, čiara = mierenie strelca (posledných 0,4 s bliká = zamknuté, už nesleduje)
// kreslí sa ostro na vlastné plátno nad hrou (v 1-bit vykreslení by sa tenké čiary stratili)
const teleCv = document.createElement('canvas'); teleCv.id = 'tele'; teleCv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2'; document.body.appendChild(teleCv);
const tctx = teleCv.getContext('2d');
function makeTele(kind, { r = 1, len = 8, w = 1, fan = 0 } = {}) { return { kind, r, len, w, fan, x: 0, z: 0, angle: 0, fill: 0, blink: false }; }
function setTele(t, x, z, angle, fill, blink = false) { t.x = x; t.z = z; if (angle != null) t.angle = angle; t.fill = Math.min(1, fill); t.blink = blink; }
function dropTele(e) { e.tele = null; }
const _v = new THREE.Vector3();
export function drawTele(cam) {
  const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  if (teleCv.width !== Math.round(W * dpr)) { teleCv.width = Math.round(W * dpr); teleCv.height = Math.round(H * dpr); }
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.clearRect(0, 0, W, H);
  { const now = performance.now(), dt = Math.min(0.1, (now - (drawTele.last || now)) / 1000); drawTele.last = now;
    drawImpacts(tctx, (x, z) => { _v.set(x, G.height(x, z) + 0.05, z).project(cam); return [(_v.x + 1) / 2 * W, (1 - _v.y) / 2 * H]; }, dt); }
  if (!fight.on) return;
  const P = (x, z) => { _v.set(x, G.height(x, z) + 0.05, z).project(cam); return [(_v.x + 1) / 2 * W, (1 - _v.y) / 2 * H]; };
  const poly = pts => { tctx.beginPath(); pts.forEach(([x, y], i) => i ? tctx.lineTo(x, y) : tctx.moveTo(x, y)); tctx.closePath(); };
  for (let i = fight.rings.length - 1; i >= 0; i--) {   // kruh π: rozbehne sa z čarodejníka na polomer π
    const g = fight.rings[i]; g.t += 1 / 60; if (g.t > 0.6) { fight.rings.splice(i, 1); continue; }
    const k = Math.min(1, g.t / 0.25), pts = Array.from({ length: 40 }, (_, j) => { const a = j / 40 * 6.283; return P(g.x + Math.cos(a) * g.r * k, g.z + Math.sin(a) * g.r * k); });
    tctx.globalAlpha = 1 - Math.max(0, (g.t - 0.25) / 0.35); tctx.lineWidth = 4; tctx.strokeStyle = g.c; poly(pts); tctx.stroke(); tctx.globalAlpha = 1;
  }
  for (const b of fight.bolts) if (b.adv) {   // strela = číslica (tieň na zemi + číslo vo vzduchu)
    const p = b.mesh.position, [gx, gy] = P(p.x, p.z);
    tctx.fillStyle = 'rgba(0,0,0,.45)'; tctx.beginPath(); tctx.ellipse(gx, gy, 9, 4, 0, 0, 6.283); tctx.fill();
    _v.copy(p).project(cam); const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H, big = b.digit === 0 ? 34 : 28;
    tctx.save(); tctx.translate(x, y);
    let ch = String(b.digit);
    if (b.wave) { const rot = b.t * 9; tctx.rotate(rot); if (Math.floor(rot / Math.PI) % 2) ch = b.digit === 6 ? '9' : '6'; tctx.scale(1, 0.75); }   // tanier sa krúti: 6 ↔ 9
    else if (b.digit === 0) tctx.rotate(b.t * 6);   // nula sa kotúľa
    tctx.font = `700 ${big}px 'Pixelify Sans', monospace`; tctx.textAlign = 'center'; tctx.textBaseline = 'middle';
    tctx.lineWidth = 6; tctx.strokeStyle = '#0e0e10'; tctx.strokeText(ch, 0, 0);
    tctx.fillStyle = b.digit === 1 ? '#ffd25a' : b.wave ? '#7fe8d8' : b.digit === 8 || b.digit === 4 ? '#ff9a5a' : '#ff6a3a'; tctx.fillText(ch, 0, 0);
    tctx.restore();
  }
  for (const e of fight.enemies) {
    const t = e.tele; if (!t || (t.blink && Math.floor(G.now * 14) % 2)) continue;
    tctx.lineWidth = 2; tctx.strokeStyle = '#ff3a2a'; tctx.fillStyle = 'rgba(255,58,42,.45)';
    if (t.kind === 'disc') {
      const ring = k => Array.from({ length: 28 }, (_, i) => { const a = i / 28 * 6.283; return P(t.x + Math.cos(a) * t.r * k, t.z + Math.sin(a) * t.r * k); });
      poly(ring(1)); tctx.fillStyle = 'rgba(255,58,42,.12)'; tctx.fill(); tctx.stroke();
      poly(ring(Math.max(0.02, t.fill))); tctx.fillStyle = 'rgba(255,58,42,.55)'; tctx.fill();
      continue;
    }
    for (const da of t.fan ? [-t.fan, 0, t.fan] : [0]) {
      const a = t.angle + da, dx = Math.sin(a), dz = Math.cos(a), px = Math.cos(a), pz = -Math.sin(a), hw = Math.max(0.07, t.w / 2);
      const quad = (l0, l1, w) => [P(t.x + dx * l0 + px * w, t.z + dz * l0 + pz * w), P(t.x + dx * l1 + px * w, t.z + dz * l1 + pz * w), P(t.x + dx * l1 - px * w, t.z + dz * l1 - pz * w), P(t.x + dx * l0 - px * w, t.z + dz * l0 - pz * w)];
      if (t.w > 0.4) { poly(quad(0, t.len, hw)); tctx.fillStyle = 'rgba(255,58,42,.12)'; tctx.fill(); tctx.stroke(); poly(quad(0, t.len * t.fill, hw)); tctx.fillStyle = 'rgba(255,58,42,.5)'; tctx.fill(); }
      else { tctx.setLineDash([6, 5]); const [x0, y0] = P(t.x, t.z), [x1, y1] = P(t.x + dx * t.len, t.z + dz * t.len); tctx.beginPath(); tctx.moveTo(x0, y0); tctx.lineTo(x1, y1); tctx.stroke(); tctx.setLineDash([]);
        poly(quad(0, t.len * t.fill, 0.12)); tctx.fillStyle = t.fill >= 1 ? '#ff3a2a' : 'rgba(255,58,42,.6)'; tctx.fill(); }
    }
  }
}
// STRELY = ČÍSLA (Majster): nepriatelia strieľajú číslice a každá letí podľa svojho tvaru
//   1 rovná a najrýchlejšia (čiarka) · 2 3 4 5 7 rovno · 0 pomalá kotúľajúca sa obruč, väčšia
//   8 = dve gule: po chvíli sa rozdelí na 4 a 4 (8 = 4 + 4) · 6 a 9 = lietajúci tanier: krúti sa (6 ↔ 9) a letí vlnovito
// ZÁSAH: číslo strely = koľko života ti zoberie (8 = −8); 0 nezraní
const DIGIT_SPEED = { 1: 1.35, 0: 0.6, 6: 0.7, 9: 0.7, 8: 0.85 };
function digitFor(e) {
  const z = G.run.zone || 1;
  if (e.d.fan) return 1 + Math.floor(Math.random() * Math.min(3, z + 1));   // vrhač: malé čísla 1–3
  const pool = z <= 1 ? [1, 2, 3, 4, 6, 8, 9, 0] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
  return pool[Math.floor(Math.random() * pool.length)];
}
function numBolt(pos, dir, digit, speed, life, extra = {}) {
  const mesh = new THREE.Group(); mesh.position.copy(pos); scene.add(mesh);   // poloha; kreslí sa ako číslica na plátne #tele
  fight.bolts.push({ bolt: true, adv: true, digit, mesh, dir: dir.clone().setY(0).normalize(), v: dir.clone().setY(0).normalize().multiplyScalar(speed), sp: speed, life, t: 0, r: digit === 0 ? 0.8 : 0.55, el: { remove() {}, classList: { add() {}, remove() {}, toggle() {} } }, ...extra });
}
function shootAdv(e, dir) {
  const D = e.d, base = D.shotSpeed || 14, digit = digitFor(e);
  for (const a of D.fan ? [-D.fan, 0, D.fan] : [0]) {
    const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a), sp = base * (DIGIT_SPEED[digit] || 1);
    numBolt(e.g.position.clone().add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(d, 0.5), d, digit, sp, ((D.range || 9) + 4) / sp, { split: digit === 8 ? 0.35 : 0, wave: digit === 6 || digit === 9 ? 1 : 0 });
  }
}
function boltHit(b) {   // číslo strely = koľko života zoberie; 0 nezraní
  if (b.digit === 0) { G.floatText('0 · nič', hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))); return; }
  hurtHero(b.digit);
}

// ---------- písanie výsledku ----------
export function fightPress(k) {
  if (!fight.on || G.over) return;
  if (k === '←') { fight.input = fight.input.slice(0, -1); return renderInput(); }
  if (!/^[0-9]$/.test(k)) return;
  if (fight.adv) return;   // Majster v súboji nepočíta – strieľa klikom
  fight.input += k;
  const live = targets().filter(t => !t.locked), inp = fight.input;
  const exact = live.find(t => String(t.p.answer) === inp);
  const longer = live.some(t => String(t.p.answer).length > inp.length && String(t.p.answer).startsWith(inp));
  if (exact && !longer) {
    const ms = G.now - exact.p.born, fast = ms < 3.5 + (exact.p.text.length > 4 ? 2 : 0);
    fight.streak++; G.stats.ok++;
    cast(exact, { fast, ms, v: exact.p.answer, op: exact.p.op });
    fight.input = ''; renderInput();
    if (fight.streak >= 5) { fight.streak = 0; setTimeout(chainLightning, 450); }
    G.renderStreak();
    return;
  }
  if (!longer) { // taký výsledok tu nikto nemá
    fight.streak = 0; G.renderStreak(); G.stats.bad++;
    G.inpEl.classList.remove('bad'); void G.inpEl.offsetWidth; G.inpEl.classList.add('bad');
    fight.input = ''; renderInput(k); return;
  }
  renderInput();
}
function advPress() {
  const r = fight.roll; if (!r) { fight.input = ''; G.say('Kniha: vzorec kúzla nie je hotový.'); return renderInput(); }
  const ans = String(r.answer), inp = fight.input;
  if (ans.startsWith(inp) && inp.length < ans.length) return renderInput();
  if (inp === ans) {
    const ms = G.now - r.born, fast = ms < 3 + r.text.length * 0.6;
    fight.streak++; G.stats.ok++;
    fight.charged = { fast, ms, v: r.answer, op: r.ops[0] || null, ops: r.ops };
    fight.input = ''; renderInput(); G.renderStreak();
    G.say(fight.streak === 1 ? 'Nabité! Ťukni na nepriateľa – vystrelíš.' : 'Nabité!', 1400);
    return;
  }
  fight.streak = 0; G.renderStreak(); G.stats.bad++;
  G.inpEl.classList.remove('bad'); void G.inpEl.offsetWidth; G.inpEl.classList.add('bad');
  fight.input = ''; renderInput();
}
// ENERGIA (Majster): veľké batérie s číslom nad spodným panelom – A pravá palica, B ľavá; čiarka = cena aktuálneho kúzla
export function renderEnergy() {
  let el = document.getElementById('energy'); if (!el) { el = document.createElement('div'); el.id = 'energy'; document.body.appendChild(el); }
  const P = G.run.pack, bar = h => { const S = handStats(h), E = handEnergy(h), row = h === 'b' ? P.bRow : curRow(), c = rowCost(P, row), low = fight.lowE && fight.lowH === h && G.now - fight.lowE < 0.6;
    return `<div class="eb${low ? ' low' : ''}${E + 1e-6 >= c ? ' ok' : ''}"><span class="eh">${P.wands ? (P.wands.length > 1 ? 'palica ' + (curRow() + 1) : 'mana') : h === 'b' ? 'B' : 'A'}</span><i><b style="width:${Math.round(E / S.emax * 100)}%"></b><u style="left:${Math.min(100, Math.round(c / S.emax * 100))}%"></u></i><span class="en">${Math.floor(E)}/${S.emax}</span></div>`; };
  el.innerHTML = bar('a') + (hasB() ? bar('b') : '');
}
export function renderInput(wrong) {
  if (fight.adv && fight.on) {
    const P = G.run.pack, SK = staffStats(P), txt = row => P.wands ? ((P.wands[row] && evalWand(P.wands[row].slots)) || {}).text || '' : used(P.rows[row] || []).map(id => { const t = tokOf(P, id); return t ? (t.t === 'd' ? '?' : t.v) : ''; }).join('');
    const ok = rowsOk(), cur = curRow(), nx = ok.length > 1 ? ok[(ok.indexOf(cur) + 1) % ok.length] : null;
    G.inpEl.innerHTML = `${ok.length ? `<span class="ph">${cur + 1}</span>` + pix(txt(cur)) : '<span class="ph">poskladaj kúzlo v Knihe</span>'}<span class="ph">⚡${rowCost(P, cur)}</span>${hasB() ? `<span class="ph">· B: ${txt(P.bRow) || '—'}</span>` : ''}${nx !== null ? `<span class="ph">ďalej ${nx + 1}: ${txt(nx)}</span>` : '<span class="ph">klik</span>'}`; return; }
  G.inpEl.innerHTML = wrong ? pix(wrong) : fight.input ? pix(fight.input) : '<span class="ph">výsledok</span>';
  for (const t of targets()) t.el.classList.toggle('match', !!fight.input && String(t.p.answer).startsWith(fight.input) && !t.locked);
}

// ---------- KÚZLO = MATEMATICKÉ ZNAMIENKO (Mathemagic: matematika všade) ----------
// + − × ÷ ako 3D znak vo farbe živlu, natočený ku kamere a točí sa; stopa za ním = živel (kamienky, kvapky, plamene, vír)
const MB = c => new THREE.MeshBasicMaterial({ color: c });
const OPCOL = { 'π': 0xffd25a, 'e': 0x8dff98, 'φ': 0xf0c040, '+': 0xc8923a, '-': 0x4fa8ff, '×': 0xff5a22, '÷': 0x7fe8d8, '√': 0xb07ad8, '²': 0xffd25a, '³': 0xffa040, '!': 0xff3a6a };
function signMesh(op, color, k = 1) {
  const sign = new THREE.Group(), m = MB(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.15));
  const bar = (w, h, x = 0, y = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w * k, h * k, 0.09 * k), m); o.position.set(x * k, y * k, 0); sign.add(o); };
  if (op === '+' || op === '×') { bar(0.46, 0.11); bar(0.11, 0.46); if (op === '×') sign.rotation.z = Math.PI / 4; }
  else if (op === '-') bar(0.48, 0.11);
  else if (op === '÷') { bar(0.46, 0.1); bar(0.11, 0.11, 0, 0.17); bar(0.11, 0.11, 0, -0.17); }
  else if (op === '√') { const a = new THREE.Mesh(new THREE.BoxGeometry(0.1 * k, 0.22 * k, 0.09 * k), m); a.position.set(-0.17 * k, -0.08 * k, 0); a.rotation.z = 0.6; sign.add(a); const b = new THREE.Mesh(new THREE.BoxGeometry(0.1 * k, 0.5 * k, 0.09 * k), m); b.position.set(-0.03 * k, 0.02 * k, 0); b.rotation.z = -0.35; sign.add(b); bar(0.3, 0.09, 0.2, 0.25); }   // odmocnina
  else if (op === '²' || op === '³') { const a = new THREE.Mesh(new THREE.BoxGeometry(0.1 * k, 0.34 * k, 0.09 * k), m); a.position.set(-0.1 * k, 0, 0); a.rotation.z = -0.55; sign.add(a); const b = a.clone(); b.position.x = 0.1 * k; b.rotation.z = 0.55; sign.add(b); if (op === '³') bar(0.32, 0.08, 0, -0.22); }   // mocnina = strieška ^
  else if (op === '!') { bar(0.12, 0.34, 0, 0.08); bar(0.12, 0.12, 0, -0.22); }   // faktoriál
  else { bar(0.44, 0.1, 0, 0.09); bar(0.44, 0.1, 0, -0.09); }   // bez znamienka = „=“
  return sign;
}
// zložité kúzlo = roj znamienok, každé vo farbe svojho živlu (multifarebné); prvé v strede, ostatné okolo neho krúžia
export function elementShape(op, color, ops = null) {
  const g = new THREE.Group(), sign = signMesh(op, color); g.add(sign);
  const orbit = (ops || []).slice(1).map((o, i, a) => { const s = signMesh(o, OPCOL[o] || 0xf2efe6, 0.55); s.userData.a = i / a.length * Math.PI * 2; g.add(s); return s; });
  g.traverse(o => o.layers.enable(4));
  g.userData = { op, sign, color, orbit };
  return g;
}
const STOPA = { '+': [0xc8923a, 0x8a6a3a], '-': [0x4fa8ff, 0xd8f0ff], '×': [0xff5a22, 0xffd25a], '÷': [0x7fe8d8, 0xffffff], '√': [0xb07ad8, 0xe0c8ff], '²': [0xffd25a, 0xffffff], '³': [0xffa040, 0xffd25a], '!': [0xff3a6a, 0xffffff] };
export function animShape(g, t, dir) {
  const { op, sign } = g.userData;
  g.quaternion.copy(camera.quaternion);              // znak vždy čitateľný (ku kamere)
  sign.rotation.z = (op === '×' ? Math.PI / 4 : 0) + Math.sin(t * 9) * 0.35;   // kýva sa, nečitateľne sa netočí
  for (const s of g.userData.orbit || []) { const a = s.userData.a + t * 7; s.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.05); }
  const c = STOPA[op] || [0xf2efe6, 0xffffff], p = g.position;
  for (let n = 0; n < 3; n++) {
    const col = c[Math.random() < 0.6 ? 0 : 1];
    if (op === '+') spark(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)), (Math.random() - 0.5), -1.5, (Math.random() - 0.5), 0.6, col);          // kamienky padajú
    else if (op === '-') spark(p, (Math.random() - 0.5) * 0.6, -0.4 - Math.random(), (Math.random() - 0.5) * 0.6, 0.5, col);                                                                        // kvapky
    else if (op === '×') spark(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)), (Math.random() - 0.5) * 0.5, 1.6 + Math.random(), (Math.random() - 0.5) * 0.5, 0.45, col);   // plamene hore
    else if (op === '÷') { const a = t * 14 + n * 2.1; spark(p.clone().add(new THREE.Vector3(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0)), -Math.sin(a) * 2, Math.cos(a) * 2, 0, 0.4, col); }             // vír
    else spark(p, (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5), 0.4, col);
  }
}

// ---------- kúzla (letia z kryštálu palice) ----------
// ŠTYRI ŽIVLY: + zem (popraská, zastaví), − voda (zamrzne), × oheň (zapáli, šíri sa), ÷ vzduch (odsunie)
const COL = { 'π': 0xffd25a, 'e': 0x8dff98, 'φ': 0xf0c040, '+': 0xc8923a, '-': 0xff5a22, '×': 0x7fe8d8, '÷': 0x4fa8ff, '√': 0xb07ad8, '²': 0xffd25a, '³': 0xffa040, '!': 0xff3a6a };
const PRI_OPS = ['π', 'e', 'φ', '!', '³', '²', '√', '÷', '×', '-', '+'];
const GLYPH = { '+': 3, '-': 2, '×': 4, '÷': 5, '√': 6, '²': 9, '³': 9, '!': 6 };
function cast(t, info) {
  t.locked = true; t.el.classList.add('locked');
  info.op = info.op || (t.p && t.p.op);
  const mo = PRI_OPS.some(o => (info.ops || []).includes(o)) ? mainOp(info) : null;   // strela letí vo farbe najsilnejšieho gemu (Lukáš 26. 10.)
  const color = info.color || COL[info.op] || (mo && COL[mo]) || (fight.adv ? 0xf2efe6 : COL['+']);
  kresbaMat.uniforms.uSpellG.value = GLYPH[info.op] || 3;
  // SALVA: každé znamienko vzorca letí ako samostatný znak vo svojej farbe, krátko po sebe; damage nesie posledný
  const vol = fight.adv && !info.extra && info.ops && info.ops.length > 1 ? info.ops.slice(1) : [];
  vol.forEach((o, i) => { const vo = elementShape(o, OPCOL[o]); vo.visible = false; scene.add(vo); spells.push({ t: -i * 0.09, target: t, color: OPCOL[o], info: { visual: true, op: o, power: info.power, crit: info.crit }, orb: vo, light: null, from: new THREE.Vector3() }); });
  if (vol.length) info.delay = vol.length * 0.09;
  const orb = elementShape(info.op, color);
  const light = borrow(color); orb.visible = false; scene.add(orb);
  spells.push({ t: info.delay ? -info.delay : 0, target: t, color, info, orb, light, from: new THREE.Vector3() });
  if (!info.extra && !info.visual) akord(info.ops && info.ops.length ? info.ops : [info.op || '+'], info.power ?? 1);   // salva = akord znamienok
  if (!info.extra) { heroPlay('Spellcast_Shoot', 0.08, G.run.mode === 'pokrocily' ? 0.25 : 0.9); fight.aim = t; }   // Majster sa môže hýbať aj pri streľbe
  // Ozvena: veľký výsledok vystrelí aj druhé kúzlo na iného
  const oz = lvl(G.run, 'ozvena');
  if (oz && !info.extra && (info.v ?? t.p.answer) >= (oz > 1 ? 4 : 6)) {
    const other = targets().find(x => x !== t && !x.locked);
    if (other) cast(other, { extra: true, delay: 0.25, color: 0xc9a0ff, v: fight.adv ? Math.ceil((info.v || 0) / 2) : undefined });
  }
  // Zlatá ruka
  const zl = lvl(G.run, 'zlato');
  if (zl && info.fast && !info.extra) G.addCoins(zl, t);
}
// SVETLO KÚZIEL: každé letiace kúzlo osvetlí okolie (3,5 m), pri dopade krátko väčší záblesk (6 m)
function spellLights() { setOrbs(spells.filter(s => s.orb && !s.info.visual).slice(-4).map(s => ({ x: s.orb.position.x, z: s.orb.position.z, c: s.color, r: s.hit ? 3 + 3 * Math.max(0, s.flash) : 3.5 }))); }
// KÚZLO = VEĽKÉ FAREBNÉ ZNAMIENKO: každá strela letí ako jasné + − × ÷ vo farbe živlu (ostré, mimo ditheringu), pri dopade sa rozprskne
const SIGN = { 'π': 'π', 'e': 'e', 'φ': 'φ', '+': '+', '-': '-', '×': '×', '÷': '÷', '√': '√', '²': '²', '³': '³', '!': '!' };
function spellSign(s) {
  const el = document.createElement('div'); el.className = 'spsign'; el.style.color = '#' + s.color.toString(16).padStart(6, '0');
  el.innerHTML = pix(SIGN[s.info.op] || '+'); el.style.display = 'none'; document.body.appendChild(el); return el;
}
function updateSpells(dt) {
  for (let i = spells.length - 1; i >= 0; i--) {
    const s = spells[i]; s.t += dt;
    if (s.t < 0) continue;
    const cw = crystal.getWorldPosition(new THREE.Vector3());
    if (s.t < 0.22) { // nabitie na kryštáli
      const k = s.t / 0.22;
      crystal.scale.set(1 + k, (1 + k) * 1.6, 1 + k); crystalLight.color.set(s.color); crystalLight.intensity = 3 + k * 14;
      for (let n = 0; n < 4; n++) { const a = Math.random() * 6.28, r = 0.9; spark(new THREE.Vector3(cw.x + Math.cos(a) * r, cw.y + (Math.random() - 0.5) * 0.8, cw.z + Math.sin(a) * r), -Math.cos(a) * 3.5, 0, -Math.sin(a) * 3.5, 0.25, s.color); }
      s.from.copy(cw);   // z kryštálu palice (ruka drží palicu pevne pred sebou)
    } else if (s.t < 0.56) { // let
      const k = (s.t - 0.22) / 0.34, e = k * k * (3 - 2 * k), to = targetPos(s.target);
      const pw = s.info.power ?? 1; s.orb.visible = !fight.adv; if (s.light) { s.light.intensity = 4 + 12 * pw; s.light.distance = 2.5 + 3 * pw; }
      const prev = s.orb.position.clone(); s.orb.position.lerpVectors(s.from, to, e); s.orb.position.y += Math.sin(e * Math.PI) * 1.2; if (s.light) s.light.position.copy(s.orb.position); animShape(s.orb, s.t, s.orb.position.clone().sub(prev));
      if (fight.adv) { if (!s.sign) s.sign = spellSign(s); const v = s.orb.position.clone().project(camera); s.sign.style.display = ''; s.sign.style.left = (v.x + 1) / 2 * innerWidth + 'px'; s.sign.style.top = (1 - v.y) / 2 * innerHeight + 'px'; }
      s.orb.scale.setScalar((s.info.power !== undefined ? 0.9 + s.info.power * 0.35 : s.info.fast ? 1.25 : 1.0) * (s.info.crit ? 1.6 : 1) * (1 + Math.sin(s.t * 40) * 0.08));   // znamienká, pri kritickom väčšie
      crystal.scale.set(1, 1.6, 1);
      for (let n = 0; n < (s.info.fast ? 8 : 5); n++) spark(s.orb.position, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 0.5, s.color);
    } else if (!s.hit) {
      s.hit = true; s.flash = 1; if (s.sign) s.sign.classList.add('pop');
      const p = targetPos(s.target);
      if (s.info.visual) { burst(targetPos(s.target), 40, 2.5, s.color, 0.6); s.flash = 0.5; continue; }   // znak salvy: len záblesk, damage nesie posledný
      const pw = s.info.power ?? (s.info.fast ? 1.4 : 1);
      if (s.info.crit && !s.target.fake) { G.floatText('KRITICKÝ ×2', s.target); G.shake(0.6); efekt('zasah', 0.95, 0.7); }
      else efekt('zasah', s.target.fake ? 0.25 : 0.45 + Math.min(0.4, pw * 0.2), s.target.fake ? 1.4 : 0.9 + Math.random() * 0.2);
      burst(p, Math.round(110 * pw), 2 + 3 * pw, s.color); burst(p, Math.round(30 * pw), 1 + pw, 0xffffff, 0.5);
      if (fight.adv) { const op = mainOp(s.info); addImpact(p.x, p.z, op, COL[op] || s.color, pw); dopad(op, pw); }   // dopad podľa kúzla + stopa na zemi + zvuk
      if (pw > 1.1) G.shake(0.25 * pw);
      if (s.target.fake) { G.floatText('vedľa', s.target); }
      else if (!s.target.bolt) { if (s.info.ops && s.info.ops.length > 1) [...new Set(s.info.ops)].slice(1).forEach(o => zivel(s.target, { op: o, quiet: true })); zivel(s.target, s.info); }
      hitTarget(s.target, s.info);
    } else {
      s.flash -= dt * 3; const pw = s.info.power ?? 1;
      s.orb.scale.setScalar(Math.max(0.001, s.flash * (s.info.fast ? 1.6 : 0.6 + 0.8 * pw))); if (s.light) s.light.intensity = Math.max(0, s.flash) * (8 + 22 * pw);
      if (s.flash <= 0) { scene.remove(s.orb); if (s.light) giveBack(s.light); if (s.sign) s.sign.remove(); spells.splice(i, 1); }
    }
  }
}
// efekt živla pri zásahu
const flash = kresbaMat.uniforms.uFlash.value;
// ŽIVLY PODĽA MATEMATIKY: + zem (omráči, každé + dlhšie) · − oheň (odčítané číslo dohorí) · × vzduch (odhodí podľa činiteľa) · ÷ voda (kvapky, spomalí)
const near = (e, r = 3, n = 1) => fight.enemies.filter(o => o !== e && o.state !== 'dead' && o.g.position.distanceTo(e.g.position) < r).sort((a, b) => a.g.position.distanceTo(e.g.position) - b.g.position.distanceTo(e.g.position)).slice(0, n);
export function ignite(e, amount, spread = true) {   // HORENIE: amount sa rozloží na trvanie, tiká každých 0,5 s; karty Dlhé horenie a Plameň
  if (!amount || e.state === 'dead') return;
  const pl = lvl(G.run, 'plamen'), dur = 3 + [0, 2, 4][lvl(G.run, 'horenie')];
  amount = Math.round(amount * [1, 1.5, 2][pl]);
  e.fire = { left: (e.fire ? e.fire.left : 0) + amount, t: Math.max(e.fire ? e.fire.t : 0, dur), acc: 0, tick: 0 }; e.burn = Math.max(e.burn || 0, dur);
  if (spread) for (const o of near(e, 3, pl > 1 ? 2 : 1)) ignite(o, Math.ceil(amount * 0.5), false);   // preskočí na suseda (s Plameňom na dvoch)
}
function zivel(e, info) {
  const op = info.op, p = targetPos(e), g = e.g.position.clone(); g.y += 0.1;
  if (!op) burst(p, 120, 4, 0xf2efe6);   // kúzlo bez znamienka = čistá mágia
  if (op === '+') { // ZEM: popraská, nepriateľ sa zastaví – každé ďalšie + o 0,5 s dlhšie
    e.stun = 1.2 + 0.5 * Math.max(0, (info.plus || 1) - 1); G.shake(0.55); flash.set(0.85, 0.7, 0.45, 0.2);
    if (fight.adv && !info.extra) {
      const zt = lvl(G.run, 'zemetras'); if (zt) for (const o of near(e, zt > 1 ? 3 : 2, 99)) o.stun = Math.max(o.stun || 0, e.stun * 0.7);   // Zemetrasenie
      const km = lvl(G.run, 'kamen'); if (km && G.now > (fight.kamenT || 0) && (fight.shield || 0) < km) { fight.shield = (fight.shield || 0) + 1; fight.kamenT = G.now + (km > 1 ? 4 : 6); G.floatText('Kamenný štít', hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))); }   // Kamenný štít
    }
    for (let n = 0; n < 90; n++) { const a = Math.random() * 6.28, r = Math.random() * 1.8; spark(g.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)), Math.cos(a) * 0.6, 1 + Math.random() * 2, Math.sin(a) * 0.6, 0.7, Math.random() < 0.5 ? 0xc8923a : 0x8a6a3a); }
    G.floatText('Zem!', e);
  } else if (op === '-') { // OHEŇ: odčítané číslo dohorí postupne a preskočí na suseda
    G.shake(0.6); flash.set(1, 0.55, 0.3, 0.3);
    burst(p, 220, 5, 0xff5a22); burst(p, 90, 3, 0xffd25a, 1.2);
    if (fight.adv) { if (info.burn) { ignite(e, info.burn); G.floatText(`Horí ${pix('+' + info.burn)}`, e); } }
    else { e.burn = Math.max(e.burn || 0, 4); G.floatText('Horí!', e); }
  } else if (op === '×') { // VZDUCH: odhodí – čím väčší činiteľ, tým ďalej
    e.knock = Math.max(e.knock || 0, Math.min(9, 2 + 1.2 * Math.max(1, info.mul || 1))); G.shake(0.4); flash.set(0.85, 1, 0.95, 0.2);
    if (fight.adv && !info.extra) {
      const vr = lvl(G.run, 'vir'); if (vr) for (const o of near(e, vr > 1 ? 3 : 2, 99)) o.knock = Math.max(o.knock || 0, 3);   // Víchor
      const nr = lvl(G.run, 'naraz'), nb = nr && near(e, 2.5, 1)[0]; if (nb && info.v) setTimeout(() => nb.state !== 'dead' && advHit(nb, { v: Math.round(info.v * (nr > 1 ? 0.5 : 0.3)), raw: 0, extra: true, op: '×' }), 200);   // Náraz
    }
    for (let n = 0; n < 120; n++) { const a = Math.random() * 6.28, r = 0.3 + Math.random() * 1.2; spark(p.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.random() * 1.2 - 0.4, Math.sin(a) * r)), -Math.sin(a) * 4, 0.5, Math.cos(a) * 4, 0.6, Math.random() < 0.5 ? 0x7fe8d8 : 0xffffff); }
    G.floatText('Odfúknutý!', e);
  } else if (op === '÷') { // VODA: kvapky (rozdelenie robí fireAt) a spomalí
    const wasWet = (e.wet || 0) > 0, ld = lvl(G.run, 'lad');
    e.wet = Math.max(e.wet || 0, 3); G.shake(0.3); flash.set(0.7, 0.85, 1, 0.25);
    if (fight.adv && ld && wasWet) { e.frozen = Math.max(e.frozen || 0, ld > 1 ? 2.5 : 1.5); G.floatText('Ľad!', e); }   // Ľad: voda na mokrého = zamrzne
    burst(p, 120, 3, 0x4fa8ff, 1.2); burst(p, 60, 1.5, 0xd8f0ff, 1.4);
    if (!fight.adv) { e.frozen = Math.max(e.frozen || 0, 2.5); G.floatText('Zamrzol!', e); } else G.floatText('Mokrý', e);
  }
  if (info.quiet || fight.adv) return;   // Majster: číslo zásahu ukáže advHit (skutočný damage + vzorec)
  // číslo zásahu vo farbe živla
  G.floatText(`<span style="color:#${(COL[op] || 0xffffff).toString(16).padStart(6, '0')}">${pix('-' + (info.v ?? ''))}</span>`, e, 'dmg');
}
function hitTarget(t, info = {}) {
  if (t.fake) return;
  if (t.bolt) { if (fight.bolts.includes(t)) removeBolt(t); return; }
  const e = t; e.locked = false; e.el.classList.remove('locked'); e.flash = 1;
  if (e.state === 'dead') return;
  if (info.fast && !info.extra) G.floatText(e.hp > 1 ? 'Rýchlo! ×2' : 'Rýchlo!', e);
  // Mráz: rýchla odpoveď zmrazí cieľ
  const mr = lvl(G.run, 'mraz');
  if (mr && !info.extra && info.ms !== undefined && info.ms < (mr > 1 ? 3 : 2)) { e.frozen = mr > 1 ? 5 : 3; G.floatText('Zmrznutý!', e); burst(targetPos(e), 60, 3, 0x9fd8ff); }
  // Oheň: zásah podpáli
  if (lvl(G.run, 'ohen')) e.burn = 4;
  if (fight.adv) return advHit(e, info);
  if (e.shield) { // štít padol, rytier ostáva
    e.shield = false; e.p = fresh('normal', e); renderTag(e);
    e.state = 'hit'; e.t = 0; e.play('Block_Hit', 0.05, true); e.knock = info.fast ? 1.6 : 0.8;
    G.floatText('Štít rozbitý!', e); afterHit(info); return;
  }
  e.hp -= info.fast && !info.extra && e.hp > 1 ? 2 : 1;   // Učeň: rýchla odpoveď = dvojnásobný zásah
  if (e === fight.boss && (e.hp === 4 || e.hp === 2) && fight.summoned < (e.hp === 4 ? 1 : 2)) { fight.summoned++; setTimeout(() => fight.on && summon(2), 600); }
  if (e.hp <= 0) {
    e.state = 'dead'; e.t = 0; e.play('Death_A', 0.05); e.el.remove();
    e.knock = info.fast ? 1.4 : 0.6;
    afterHit(info); checkEnd(); return;
  }
  e.p = fresh(e === fight.boss ? (e.hp % 2 ? 'three' : 'normal') : e.kind === 'barbarian' ? 'three' : 'normal', e); renderTag(e);
  e.state = 'hit'; e.t = 0; e.play('Hit_A', 0.05, true); e.knock = info.fast ? 2 : 1; e.charging = false;
  afterHit(info);
}
// Pokročilý: výsledok kúzla = damage; štít zoberie polovicu a praskne; presný zásah (na nulu) = minca
// KOMBÁ: zásahy rýchlo po sebe (do 2,5 s) = +15 % za každý; živly navzájom: ľad + oheň = para ×2, zem + vzduch = výbuch ×1,5
let comboHit = false;
function advHit(e, info) {
  let v = info.v ?? Math.ceil(e.maxHp / 2);
  if (!info.extra) {
    fight.combo = G.now - fight.lastHit < 2.5 ? fight.combo + 1 : 1; fight.lastHit = G.now;
    const ops = info.ops || [];
    if ((e.wet > 0 || e.frozen > 0) && ops.includes('-')) { v *= 2; e.wet = 0; e.frozen = 0; G.floatText('Para! ×2', e); burst(targetPos(e), 160, 4, 0xffffff, 1.2); }   // voda + oheň
    else if (e.stun > 0 && ops.includes('×')) { v = Math.round(v * 1.5); e.knock = 6; G.floatText('Výbuch zeme! ×1,5', e); }   // zem + vzduch
    // KOMBO DVOCH PALÍC: zásah z druhej ruky do 1 s na toho istého nepriateľa – rovnaký výsledok = Dvojica ×2, násobok = ×1,5
    const lh = e.lastHand; comboHit = false;
    if (lh && info.hand && lh.h !== info.hand && G.now - lh.t < 1) {
      const a = Math.round(lh.raw), b = Math.round(info.raw ?? 0);
      if (a > 0 && a === b) { comboHit = true; v *= 2; G.floatText(`Dvojica ${a} = ${b} · ×2`, e); burst(targetPos(e), 140, 4, 0xffd25a, 1); }
      else if (a > 1 && b > 1 && (a % b === 0 || b % a === 0)) { comboHit = true; v = Math.round(v * 1.5); G.floatText(`Násobok ${Math.max(a, b)} ÷ ${Math.min(a, b)} · ×1,5`, e); burst(targetPos(e), 90, 3, 0x7fd6ff, 0.9); }
    }
    if (info.hand) e.lastHand = { h: info.hand, raw: info.raw ?? 0, t: G.now };
  }
  if (e.shield) { e.shield = false; if ((info.ops || []).includes('√')) G.floatText('√ prerazila štít!', e); else { v = Math.floor(v / 2); G.floatText('Štít rozbitý!', e); } }   // odmocnina ide cez štít
  if (e.trait && !info.extra) {   // vodca zóny: matematická vlastnosť
    const [nv, msg] = G.bossTrait(e.trait).hit(info.raw ?? v, v); if (msg) G.floatText(msg, e); v = nv;
    if (v < 0) { e.hp = Math.min(e.maxHp, e.hp - v); renderTag(e); return; }
    if (e.trait === 'delic' && v > 0 && fight.summoned < 4 && v > e.maxHp * 0.08) { fight.summoned++; setTimeout(() => fight.on && summon(2), 300); }
  }
  // PRAVIDLO ZÓNY (prostredie): výsledok, ktorý ho spĺňa, zraní ×2 (napr. v horách párne)
  if (G.zoneRule && G.zoneRule.f(Math.round(info.raw ?? 0))) { v *= 2; if (!info.extra) comboHit = true; }
  const before = e.hp; e.hp -= v;
  const st = G.run.st; if (st) { st.dmg += Math.min(v, Math.max(0, before)); st.hit = Math.max(st.hit, v); if (e.hp <= 0 && before > 0) st.kills++; }
  if (e.hp === 0 && before > 0 && !info.extra) e.exact = true;
  if (e.hp <= 0 && before > 0 && G.onKill) G.onKill(e, info);   // skúsenosti
  if (e === fight.boss) { const f = e.hp / e.maxHp; if ((f < 0.67 && fight.summoned < 1) || (f < 0.34 && fight.summoned < 2)) { fight.summoned++; setTimeout(() => fight.on && summon(2), 600); } }
  dmgText(e, info, v, comboHit || e.hp === 0);
  if (e.hp <= 0) {
    // PRESNE DO NULY: kúzlo vráti energiu a padne dvakrát viac kryštálov
    if (e.hp === 0 && before > 0 && !info.extra && itemN(G.run.pack, 'nula')) G.heal(2 * itemN(G.run.pack, 'nula'), true);   // vylepšenie Presne nula
    if (e.hp === 0 && before > 0 && !info.extra) { const c = info.cost || 0; if (c) G.run.energy = Math.min(staffStats(G.run.pack).emax, energy() + c); G.floatText(`Presne! ⚡+${c}`, e); if (!fight.adv) G.addCoins(1, e); }
    e.state = 'dead'; e.t = 0; e.play('Death_A', 0.05); e.el.remove(); e.knock = info.fast ? 1.4 : 0.6;
    if (fight.target === e) fight.target = null;
    afterHit(info); checkEnd(); return;
  }
  if (info.dot) { renderTag(e); return; }   // horenie: len číslo, nepriateľ sa nezastaví
  if (fight.adv && e.tele) { renderTag(e); e.flash = 1; majsterFx(e, info, v); afterHit(info); return; }   // počas varovania sa útok nezastaví – treba uhnúť
  renderTag(e); e.state = 'hit'; e.t = 0; e.play('Hit_A', 0.05, true); e.knock = info.fast ? 2 : 1; e.charging = false;
  majsterFx(e, info, v);
  afterHit(info);
}
// číslo zásahu (Majster): navrchu vzorec, ktorý palica vypočítala (3×4), pod ním skutočný damage aj s bonusmi (−15)
// ZLÚČENÉ ČÍSLA: zásahy do toho istého nepriateľa do 1 s sa sčítajú do jedného rastúceho čísla (−12, −24, −36), veľké skrátene (12,4k);
// vzorec nad číslom len pri komba alebo presnom zásahu – v dave nie je obrazovka zahltená
function dmgText(e, info, v, special = false) {
  const c = `#${(COL[info.op] || 0xffffff).toString(16).padStart(6, '0')}`, f = special && info.text && /[^0-9]/.test(info.text) ? info.text : '';
  const live = e._dEl && e._dEl.isConnected && G.now - e._dT < 1;
  e._dSum = (live ? e._dSum : 0) + Math.max(0, Math.round(v)); e._dT = G.now;
  const html = `${f ? `<span class="fx">${pix(f)}</span>` : ''}<span style="color:${c}">${pix('-' + shortNum(e._dSum))}</span>`;
  if (live) { e._dEl.innerHTML = html; e._dEl.classList.remove('bump'); void e._dEl.offsetWidth; e._dEl.classList.add('bump'); clearTimeout(e._dEl._t); e._dEl._t = setTimeout(() => e._dEl && e._dEl.remove(), 1100); return; }
  e._dEl = G.floatText(html, e, 'dmg');
}
// efekty z Knihy (Majster): plošný zásah, otras zeme, blesk
let shotN = 0;
function majsterFx(e, info, v) {
  if (info.extra) return;
  const ot = lvl(G.run, 'otras'); if (ot && e.state !== 'dead') e.stun = Math.max(e.stun || 0, ot > 1 ? 1.5 : 0.8);
  // ODMOCNINA = KOREŇ: zakorení nepriateľa na mieste (2,5 s) – √ zmenší číslo, ale zastaví toho, kto je najbližšie
  if ((info.ops || []).includes('√') && e.state !== 'dead') { e.stun = Math.max(e.stun || 0, 2.5); G.floatText('√ zakorenený!', e); }
  const pl = lvl(G.run, 'plocha');
  if (pl) for (const o of fight.enemies) if (o !== e && o.state !== 'dead' && o.g.position.distanceTo(e.g.position) < 2.4) advHit(o, { v: Math.max(1, Math.round(v * (pl > 1 ? 0.7 : 0.4))), extra: true });
  const bl = lvl(G.run, 'blesk'); shotN++;
  if (bl && shotN % (bl > 1 ? 2 : 3) === 0) fight.enemies.filter(o => o !== e && o.state !== 'dead').sort((a, b) => a.g.position.distanceTo(e.g.position) - b.g.position.distanceTo(e.g.position)).slice(0, 2)
    .forEach(o => { zap(targetPos(e), targetPos(o)); advHit(o, { v: Math.max(1, Math.round(v / 2)), extra: true }); });
}
// Reťaz: každá 3. (2.) správna v rade preskočí bleskom na ďalšieho
function afterHit(info) {
  const rz = lvl(G.run, 'retaz');
  if (!rz || info.extra || info.chain) return;
  if (fight.streak > 0 && fight.streak % (rz > 1 ? 2 : 3) === 0) {
    const next = targets().find(x => !x.locked);
    if (next) { zap(crystal.getWorldPosition(new THREE.Vector3()), targetPos(next)); hitTarget(next, { extra: true, chain: true }); }
  }
}
function zap(from, to) {
  const group = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0xfff27a }), pts = [from.clone()];
  for (let k = 1; k < 7; k++) pts.push(from.clone().lerp(to, k / 7).add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7)));
  pts.push(to.clone());
  for (let k = 0; k < pts.length - 1; k++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, pts[k].distanceTo(pts[k + 1])), mat);
    seg.position.copy(pts[k]).lerp(pts[k + 1], 0.5); seg.lookAt(pts[k + 1]); seg.layers.enable(4); group.add(seg);
  }
  const light = borrow(0xfff27a, 8); light.intensity = 20; light.position.copy(to);
  scene.add(group); chains.push({ group, life: 0.45, light });
  burst(to, 90, 5, 0xfff27a);
}
// Veľké kúzlo: 5 správnych za sebou → blesk na všetkých
function chainLightning() {
  if (!fight.on) return;
  G.say('Reťazový blesk!'); G.shake(0.6);
  heroPlay('Spellcast_Shoot', 0.05, 1.1);
  let prev = crystal.getWorldPosition(new THREE.Vector3());
  for (const t of targets().filter(t => !t.locked)) { const to = targetPos(t); zap(prev, to); hitTarget(t, { fast: true, extra: true }); prev = to; }
  G.renderStreak();
}

// ---------- úder do čarodejníka ----------
// ŽIVOT JE ČÍSLO (Majster): úder aj strela odčítajú svoje číslo; zbojník 2, rytier 4, barbar 6 – krát číslo zóny, vodca ×2
const MELEE = { rogue: 2, vrhac: 2, hooded: 2, knight: 4, barbarian: 6 };
const meleeDmg = e => (MELEE[e.kind] || 2) * (G.run.zone || 1) * (e.hb ? 2 : 1);
function hurtHero(dmg = 1) {
  if (G.over || G.dashing) return;
  efekt('zasah', 0.85, 0.55);
  if (fight.shield > 0) { fight.shield--; G.say('Štít ťa ochránil!'); burst(hero.position.clone().add(new THREE.Vector3(0, 1.1, 0)), 70, 3, 0xcfd2da, 0.6); return; }
  fight.streak = 0; G.renderStreak();
  heroPlay('Hit_A', 0.05, 0.7);
  burst(hero.position.clone().add(new THREE.Vector3(0, 1, 0)), 50, 3, 0xd43a3a, 0.6);
  if (fight.adv && G.night) dmg *= 2;   // noc: zásahy ×2
  if (fight.adv) G.floatText(`<span style="color:#ff5a4a">${pix('-' + dmg)}</span>`, hero.position.clone().add(new THREE.Vector3(0, 2.4, 0)), 'dmg');
  G.hurt(fight.adv ? dmg : 1);
}
function checkEnd() {
  if (fight.enemies.some(e => e.state !== 'dead')) return;
  for (const e of fight.enemies) dropTele(e);
  for (const b of [...fight.bolts]) removeBolt(b);
  fight.on = false;
  G.onWin(fight.opts);
}
export function endFight() { // pri prehre / odchode
  for (const t of targets()) t.el && t.el.remove();
  for (const e of fight.enemies) dropTele(e);
  for (const b of [...fight.bolts]) removeBolt(b);
  fight.on = false; fight.enemies = []; fight.aim = null;
}

// ---------- slučka súboja ----------
const toHero = new THREE.Vector3();
// MAJSTER – správanie nepriateľov: každý útok má varovanie (červené na zemi), aby sa dalo uhnúť
//   zblízka: dobehne → zastaví sa, pod ním sa naplní kruh (rogue 0,6 s, rytier 0,75, barbar 0,95) → úder do kruhu
//   barbar: z 2,5–6 m sa zaprie (0,8 s, pás 7 m) → rozbeh rovno po páse, potom chvíľu oddychuje
//   strelec / vrhač: drží odstup, mieri (čiara ťa sleduje, posledných 0,4 s bliká a stojí) → strela letí rovno
const ADV_STATES = new Set(['walk', 'charge', 'attack', 'back', 'aim', 'windup', 'chargeup', 'rush']);
const WINDUP = { rogue: 0.6, knight: 0.75, barbarian: 0.95 };
function separate(e) { const pos = e.g.position; for (const o of fight.enemies) if (o !== e && o.state !== 'dead') { const dx = pos.x - o.g.position.x, dz = pos.z - o.g.position.z, dd = Math.hypot(dx, dz); if (dd < 1.1 && dd > 0.001) { pos.x += dx / dd * (1.1 - dd) * 0.5; pos.z += dz / dd * (1.1 - dd) * 0.5; } } }
function advAI(e, dist, sp, edt) {
  const pos = e.g.position, D = e.d, reach = 1.15 + (e.size - 1);
  if (!e.tele && (e.state === 'windup' || e.state === 'chargeup' || e.state === 'aim')) { e.state = 'walk'; e.play('Running_A'); }   // varovanie zmizlo (zásah, omráčenie) → znova od chôdze
  e.chargeCd = Math.max(0, (e.chargeCd || 0) - edt); e.shoot -= edt;
  if (e.state === 'walk' || e.state === 'charge') {
    if (D.ranged) {
      const range = D.range || 9;
      if (dist < range && e.shoot <= 0 && fight.enemies.filter(x => x.state === 'aim').length < 5) {
        e.state = 'aim'; e.t = 0; e.adir = toHero.clone(); e.play(D.fan ? 'Idle' : '2H_Ranged_Aiming');
        e.tele = makeTele('line', { len: range + 3, w: 0.1, fan: D.fan || 0 }); return;
      }
      if (dist > range * 0.75) pos.addScaledVector(toHero, sp * edt);
      else if (dist < 4.5) pos.addScaledVector(toHero, -sp * 0.7 * edt);   // drží odstup
      separate(e); return;
    }
    if (D.charge && e.chargeCd <= 0 && dist < 6 && dist > 2.5) {
      e.state = 'chargeup'; e.t = 0; e.cdir = toHero.clone(); e.play('Idle');
      e.tele = makeTele('bar', { len: 7, w: 1.1 * e.size }); return;
    }
    if (dist > reach) { pos.addScaledVector(toHero, sp * edt); separate(e); return; }
    e.state = 'windup'; e.t = 0; e.swung = false; e.play('Idle');
    e.tc = pos.clone().addScaledVector(toHero, 0.85 * e.size); e.tr = 1.1 * e.size;
    e.tele = makeTele('disc', { r: e.tr }); return;
  }
  if (e.state === 'windup') {
    const W = (WINDUP[e.kind] || 0.7) * (e.hb ? 1.15 : 1);
    if (!e.swung && e.t > W - 0.45) { e.swung = true; e.play(D.attack, 0.08, true); }
    setTele(e.tele, e.tc.x, e.tc.z, null, e.t / W);
    if (e.t >= W) {
      if (Math.hypot(hero.position.x - e.tc.x, hero.position.z - e.tc.z) < e.tr + 0.25) hurtHero(meleeDmg(e));
      dropTele(e); e.state = 'back'; e.t = 0; e.play('Walking_Backwards');
    }
    return;
  }
  if (e.state === 'chargeup') {
    e.g.rotation.y = Math.atan2(e.cdir.x, e.cdir.z);
    setTele(e.tele, pos.x, pos.z, e.g.rotation.y, e.t / 0.8);
    if (e.t >= 0.8) { dropTele(e); e.state = 'rush'; e.t = 0; e.hitDone = false; e.play('Running_A'); }
    return;
  }
  if (e.state === 'rush') {
    e.g.rotation.y = Math.atan2(e.cdir.x, e.cdir.z); pos.addScaledVector(e.cdir, 10 * edt);
    if (!e.hitDone && Math.hypot(hero.position.x - pos.x, hero.position.z - pos.z) < 0.9 * e.size) { e.hitDone = true; hurtHero(meleeDmg(e)); }
    if (e.t >= 0.7) { e.state = 'back'; e.t = 0; e.chargeCd = 3.5; e.play('Walking_Backwards'); }
    return;
  }
  if (e.state === 'aim') {
    const A = D.aim || 1.1, lock = 0.4;
    if (dist > (D.range || 9) + 4) { dropTele(e); e.state = 'walk'; e.play('Running_A'); return; }   // ušiel si
    if (e.t < A - lock) e.adir.copy(toHero);
    const ang = Math.atan2(e.adir.x, e.adir.z); e.g.rotation.y = ang;
    setTele(e.tele, pos.x, pos.z, ang, Math.min(1, e.t / (A - lock)), e.t >= A - lock);
    if (e.t >= A) { dropTele(e); e.play(D.attack, 0.05, true); shootAdv(e, e.adir); e.state = 'walk'; e.shoot = D.cd || 2.6; e.t = 0; }
    return;
  }
  if (e.state === 'attack') { if (e.t > 1.1) { e.state = 'back'; e.t = 0; e.play('Walking_Backwards'); } return; }
  if (e.state === 'back') { pos.addScaledVector(toHero, -1.6 * edt); if (e.t > (e.kind === 'barbarian' ? 1.2 : 0.9)) { e.state = 'walk'; e.play('Running_A'); } }
}
export function updateFight(dt) {
  const danger = fight.on && !G.over && (fight.enemies.some(e => (e.state === 'walk' || e.state === 'charge' || e.state === 'windup' || e.state === 'rush') && !e.frozen && e.g.position.distanceTo(hero.position) < 2.6) || fight.bolts.some(b => b.mesh.position.distanceTo(hero.position) < 2.4));
  fight.slow += ((danger ? 0.4 : 1) - fight.slow) * (1 - Math.exp(-dt * 6));
  G.danger = danger;
  const edt = dt * fight.slow, slowCard = 1 - [0, 0.2, 0.35][lvl(G.run, 'cas')];
  for (const e of fight.enemies) {
    const pos = e.g.position; e.t += edt;
    if (e.trait === 'stit' && e.state !== 'dead' && !e.shield && (e.shT = (e.shT || 0) + edt) > 4) { e.shield = true; e.shT = 0; renderTag(e); G.floatText('Štít späť!', e); }
    if (e.dummy && e.state !== 'dead') { if (e.state === 'stand' || (e.state === 'hit' && e.t > 0.6)) { e.state = 'idle'; e.play('Idle'); } e.flash = Math.max(0, e.flash - dt * 4); for (const m of e.mats) if (m.emissive) m.emissive.setScalar(e.flash * 0.9); e.mixer.update(edt); continue; }   // strašiak stojí a nebráni sa
    toHero.subVectors(hero.position, pos).setY(0);
    const dist = toHero.length(); toHero.normalize();
    if (e.state !== 'dead') e.g.rotation.y = Math.atan2(toHero.x, toHero.z);
    if (e.knock > 0) { const k = Math.min(e.knock, edt * 6); pos.addScaledVector(toHero, -k); e.knock -= k; }
    e.frozen = Math.max(0, e.frozen - edt); e.burn = Math.max(0, e.burn - edt); e.stun = Math.max(0, (e.stun || 0) - edt); e.wet = Math.max(0, (e.wet || 0) - edt);
    if (e.fire && e.state !== 'dead') {   // HORENIE: zvyšok sa rovnomerne rozpáli do času, tik každých 0,5 s
      const F = e.fire, k = Math.min(1, edt / Math.max(0.01, F.t)); F.acc += F.left * k; F.left -= F.left * k; F.t -= edt; F.tick += edt;
      if (F.tick >= 0.5 || F.t <= 0) { F.tick = 0; const d = Math.round(F.acc + (F.t <= 0 ? F.left : 0)); F.acc -= d; if (d > 0) advHit(e, { v: d, raw: 0, extra: true, op: '-', dot: true }); }
      if (F.t <= 0) e.fire = null;
    }
    if (e.tele && (e.stun > 0 || e.frozen > 0 || !ADV_STATES.has(e.state))) { dropTele(e); if (e.state !== 'dead' && e.state !== 'hit') { e.state = 'walk'; e.play('Running_A'); } }   // omráčený / zmrazený / zasiahnutý → útok sa zruší
    if (e.stun > 0 && e.state !== 'dead') { e.mixer.update(edt * 0.15); if (Math.random() < 0.3) spark(e.g.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.1, (Math.random() - 0.5) * 1.2)), 0, 0.8, 0, 0.5, 0xc8923a); continue; }   // zem: stojí v prasklinách
    const sp = e.speed * slowCard * (fight.adv ? 2.2 * (G.diffSpeed || 1) : 1) * (e.burn > 0 && lvl(G.run, 'ohen') ? 1 - (lvl(G.run, 'ohen') > 1 ? 0.6 : 0.4) : 1) * (e.wet > 0 ? 0.5 : 1);   // mokrý = polovičná rýchlosť   // Majster: bežia po hráčovi
    if (e.burn > 0 && Math.random() < 0.4) spark(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * e.h * 0.8, (Math.random() - 0.5) * 0.6)), 0, 1.4, 0, 0.5, 0xff8a3a);
    if (e.frozen > 0 && e.state !== 'dead') { e.mixer.update(0); for (const m of e.mats) if (m.emissive) m.emissive.setRGB(0.15, 0.35, 0.6); if (Math.random() < 0.2) spark(targetPos(e), (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0.6, 0x9fd8ff); continue; }
    if (e.state === 'stand') { if (e.t > (fight.adv ? 0.4 : 1.0)) { e.state = 'walk'; e.play(fight.adv ? 'Running_A' : e.d.walk); } }
    else if (fight.adv && ADV_STATES.has(e.state)) advAI(e, dist, sp, edt);
    else if (e.state === 'walk' || e.state === 'charge') {
      if (e.d.charge && dist < 3.6 && e.state === 'walk') { e.state = 'charge'; e.play('Running_A'); G.floatText('Útok!', e); }
      if (e.d.ranged && dist < (fight.adv ? 9 : 7.6) && !(fight.adv && e.state === 'charge')) { e.state = 'aim'; e.t = 0; e.play('2H_Ranged_Aiming'); }
      else if (dist > 1.15 + (e.size - 1)) {
        pos.addScaledVector(toHero, sp * (e.state === 'charge' ? 2.6 : 1) * edt);
        for (const o of fight.enemies) if (o !== e && o.state !== 'dead') { const dx = pos.x - o.g.position.x, dz = pos.z - o.g.position.z, dd = Math.hypot(dx, dz); if (dd < 1.1 && dd > 0.001) { pos.x += dx / dd * (1.1 - dd) * 0.5; pos.z += dz / dd * (1.1 - dd) * 0.5; } }
      } else if (!G.over) { e.state = 'attack'; e.t = 0; e.play(e.d.attack, 0.08, true); }
    } else if (e.state === 'attack') {
      if (e.t > 0.45 && !e.struck) { e.struck = true; hurtHero(); }
      if (e.t > 1.1) { e.struck = false; e.state = 'back'; e.t = 0; e.play('Walking_Backwards'); }
    } else if (e.state === 'back') { // po údere ustúpi a ide znova
      pos.addScaledVector(toHero, -1.6 * edt);
      if (e.t > 1.6) { e.state = 'walk'; e.play(e.d.walk); }
    } else if (e.state === 'aim') {
      if (fight.adv && dist > 11) { e.state = 'walk'; e.play('Running_A'); continue; }   // Majster: ušiel si → strelec ide za tebou
      e.shoot -= edt;
      if (e.shoot <= 0 && !G.over) { e.shoot = fight.adv ? 2.8 : 6.5; e.play(e.d.attack, 0.05, true); setTimeout(() => { if (e.state === 'aim' && fight.on) shootBolt(e); }, 300); }
      else if (e.cur === e.acts[e.d.attack] && !e.cur.isRunning()) e.play('2H_Ranged_Aiming');
    } else if (e.state === 'hit') {
      if (e.t > 0.6) { if (fight.adv) { e.state = 'walk'; e.play('Running_A'); } else { e.state = e.d.ranged && dist < 7.8 ? 'aim' : 'walk'; e.play(e.state === 'aim' ? '2H_Ranged_Aiming' : e.d.walk); } }
    } else if (e.state === 'dead') {   // telo chvíľu leží, potom sa rozpadne na iskry (nie pod zem)
      if (e.t > 1.8 && e.g.visible) { e.g.visible = false; burst(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 90, 2.2, 0xb8b4aa, 0.9); burst(pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 30, 1.2, 0xffffff, 0.6); }
    }
    pos.y = G.height(pos.x, pos.z);
    e.flash = Math.max(0, e.flash - dt * 4);
    for (const m of e.mats) if (m.emissive) m.emissive.setScalar(e.flash * 0.9);
    e.mixer.update(edt);
  }
  for (const b of [...fight.bolts]) {
    if (b.adv) {   // Majster: číslo letí podľa svojho tvaru, zasiahne, keď ťa prejde
      b.t += edt;
      if (b.wave) { const side = new THREE.Vector3(b.dir.z, 0, -b.dir.x), w = Math.cos(b.t * 5) * 6; b.mesh.position.addScaledVector(b.v, edt).addScaledVector(side, w * edt); }   // tanier: vlnovka
      else b.mesh.position.addScaledVector(b.v, edt);
      if (b.split && b.t > b.split) {   // 8 = 4 + 4
        for (const a of [-0.38, 0.38]) numBolt(b.mesh.position, b.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a), 4, b.sp * 1.1, Math.max(0.3, b.life - b.t));
        G.floatText('8 = 4 + 4', b.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0))); removeBolt(b); continue;
      }
      const hx = b.mesh.position.x - hero.position.x, hz = b.mesh.position.z - hero.position.z;
      if (Math.hypot(hx, hz) < b.r && !G.dashing && !G.over) { removeBolt(b, true); boltHit(b); continue; }
      if (b.t > b.life) removeBolt(b);
      continue;
    }
    b.t += edt;
    const to = b.to || hero.position.clone().add(new THREE.Vector3(0, 1.1, 0)), k = Math.min(1, b.t / b.dur);
    b.mesh.position.lerpVectors(b.from, to, k); b.mesh.lookAt(to);
    if (b.to && k >= 1) { removeBolt(b, true); if (b.to.distanceTo(hero.position.clone().add(new THREE.Vector3(0, 1.1, 0))) < 0.9 && !G.dashing) hurtHero(); continue; }
    if (Math.random() < 0.6) spark(b.mesh.position, (Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4, 0.5, 0xff7a3a);
    if (k >= 1 && !b.locked) { removeBolt(b, true); hurtHero(); }
  }
  for (let i = chains.length - 1; i >= 0; i--) { const c = chains[i]; c.life -= dt; c.group.visible = Math.random() < 0.8; if (c.life <= 0) { scene.remove(c.group); giveBack(c.light); chains.splice(i, 1); } }
  if (fight.cd > 0) fight.cd = Math.max(0, fight.cd - dt);
  if (fight.cd2 > 0) fight.cd2 = Math.max(0, fight.cd2 - dt);
  if (G.run.mode === 'pokrocily') for (const h of hasB() ? ['a', 'b'] : ['a']) { const SK = handStats(h), e0 = handEnergy(h); if (e0 < SK.emax) G.run[h === 'b' ? 'energy2' : 'energy'] = Math.min(SK.emax, e0 + SK.regen * dt); }
  if (G.run.mode === 'pokrocily') renderEnergy();
  if (G.run.mode === 'pokrocily' && G.autoFire !== false && !G.over) {
    const live = fight.enemies.filter(e => e.state !== 'dead' && e.g.position.distanceTo(hero.position) < 11);
    if (live.length) { if (fight.cd <= 0 && energy() >= rowCost(G.run.pack, curRow())) fireAt(null); if (hasB() && (fight.cd2 || 0) <= 0 && handEnergy('b') >= rowCost(G.run.pack, G.run.pack.bRow)) fireAt(null, null, 'b'); }
  }
  updateSpells(dt); spellLights();
  flash.w = Math.max(0, flash.w - dt * 2.2);
  if (!spells.length && fight.charged) { const k = 1.6 + Math.sin(G.now * 12) * 0.25; crystal.scale.set(k, k * 1.6, k); crystalLight.color.set(COL[fight.charged.op] || 0xf2efe6); crystalLight.intensity = lamp.base * 2.5; }
  else if (!spells.length) { crystal.scale.set(1, 1.6, 1); crystalLight.color.set(lamp.color); crystal.material.color.set(lamp.color); crystalLight.intensity = lamp.base + fight.streak * 1.2 + Math.sin(G.now * 4) * 0.3; }
}
// kam sa má čarodejník pozerať (cieľ posledného kúzla)
export function aimPoint() { if (lastAim && G.now - lastAim.t < 0.5) return lastAim.p; const a = fight.aim; return a && fight.on && !a.fake && (a.bolt ? fight.bolts.includes(a) : a.state !== 'dead') ? targetPos(a) : null; }
