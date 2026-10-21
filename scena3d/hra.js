// Mathemagic – zóna ako beh (roguelike): mapa so 7 krokmi, v každej miestnosti iný cieľ.
// Skúmanie = ťukneš na zem a čarodejník tam dôjde. Banda pri ohni = súboj na mieste (suboj.js).
// Kniha kúziel = karty, ktoré pridávajú efekty; obchod = interiér v tmavom režime; vodca na konci dá nové znamienko.
import { THREE, scene, camera, U, sun, hemi, PAPER, MAT, GRASS, FLOWER, RAW, std, inst, placeModels, loadProps, spark, burst, updateParticles, ditherMat, blurMat, resize, setView, render, pix, icon, digitTexture } from './svet.js';
import { hero, loadHero, heroPlay, updateHero, heroLocked, loadFighters, makeFighter, crystalLight, crystal, lamp, aim } from './postavy.js';
import { initFight, fight, startFight, joinFight, fightPress, updateFight, drawTags, renderInput, endFight, aimPoint, fireAt, fireAtScreen, elementShape, animShape, curRow } from './suboj.js';
import { newPack, migratePack, tokOf, spellOk, spellWorks, rollSpell, strength, lootToken, addToken, slotPrice, MAX_SLOTS, MAX_ROWS, MAX_STAFF, rowPrice, staffPrice, allIds, workingRows, rowCost } from './ruksak.js';
import { CARDS, SLOTS, lvl, offer, makeMap, ROOM_INFO } from './karty.js';
import { mulberry32 } from './gen.js';
import { genWorld, AW, AH, GW, GH } from './world.js';
import { hordeSize, hordeInterval, isBossWave, kindWeights, xpFor, xpNeed, levelOffers, nextSpecial, SPECIALS, enemyHpM, BOSSES, bossOf, FINAL_ZONE, bossHpMul, STAFF_MODELS, staffStats, MAX_STARS, RARITY } from './balance.js';
import { zvuk, efekt, hudba, nastavZvuk } from './zvuk.js';
import { svetloDen, svetloNoc, svetloDenNoc, renderKresba, resizeKresba, kresbaMat, kresbaBlur } from './kresba.js';
import { points } from './svet.js';
import { ZIVLY, card, slot, dia, menu } from './ui.js';
points.layers.enable(4);   // iskry patria kúzlu

// ---------- stav behu a zbierka (localStorage) ----------
const RUN_KEY = 'mm-run', META_KEY = 'mm-meta';
function newRun(mode = 'zaklad') {
  const seed = 1 + Math.floor(Math.random() * 99999);
  const pack = newPack(); const done = typeof meta !== 'undefined' && meta.tutDone;
  if (mode === 'pokrocily' && !done) pack.rows = [[]];   // Majster začína úvodom (len prvýkrát): kalkulačku si poskladá sám
  pack.unlock = {};   // funkcie ( ) √ x² x³ ! sa odomykajú v každom behu nanovo (vodcovia zón, vzácne pri úrovni)
  return { seed, zone: 1, hearts: 3, coins: 0, cards: [], ops: ['+'], range: 5, w: newWorldState(), mode, pack, tut: mode === 'pokrocily' && !done ? 0 : 99, st: { dmg: 0, kills: 0, hordes: 0, hit: 0 } };
}
// postup v otvorenom svete zóny: porazené bandy, kľúče, otvorené truhlice a brány, objavené oblasti
function newWorldState() { return { keys: 0, camps: [], chests: [], bushes: [], gates: [], runes: [], seen: [], nums: [] }; }
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v || d; } catch (e) { return d; } };
const meta = load(META_KEY, { seen: [] }); meta.unlock = meta.unlock || {}; meta.best = meta.best || { score: 0, zone: 1, hordes: 0, hit: 0 };
let run = load(RUN_KEY, null); if (!run || !run.w || run.hearts <= 0) run = newRun(run && run.mode); // prehratý beh sa nepokračuje
// MAJSTER = roguelite: po zatvorení hry (nová relácia) sa začína od nuly; trvalé ostáva odomknuté (meta) a rekordy
if (run.mode === 'pokrocily' && !sessionStorage.getItem('mm-alive') && (run.w.seen.length > 1 || run.zone > 1 || run.st)) run = newRun('pokrocily');
sessionStorage.setItem('mm-alive', '1');
run.mode = run.mode || 'zaklad'; run.pack = migratePack(run.pack || newPack()); run.tut = run.tut ?? 99; run.st = run.st || { dmg: 0, kills: 0, hordes: 0, hit: 0 };
run.pack.unlock = run.pack.unlock || {};
const adv = () => run.mode === 'pokrocily';
const persist = () => { try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* bez ukladania */ } };
const maxHearts = () => 3 + lvl(run, 'srdce') + (run.maxH || 0);

// ---------- UI ----------
const $ = id => document.getElementById(id);
const heartsEl = $('hearts'), coinsEl = $('coins'), goalEl = $('goal'), msgEl = $('msg'), padEl = $('pad'), inpEl = $('inp'), bottomEl = $('bottom'), ovEl = $('ov'), streakEl = $('streak'), labelsEl = $('labels');
function renderHearts(lost) { heartsEl.innerHTML = Array.from({ length: maxHearts() }, (_, i) => icon('heart', 'currentColor', `${i < run.hearts ? '' : 'off'} ${lost && i === run.hearts ? 'pop' : ''}`)).join(''); }
function renderSlots() { $('slots').innerHTML = Array.from({ length: SLOTS }, (_, i) => slot(run.cards[i] && run.cards[i].id)).join(''); }
function renderCoins(pop) { coinsEl.innerHTML = icon('coin', 'currentColor') + `<b>${run.coins}</b>`; if (pop) { coinsEl.classList.remove('pop'); void coinsEl.offsetWidth; coinsEl.classList.add('pop'); } }
function renderStreak() { streakEl.innerHTML = '<span>Blesk</span>' + [0, 1, 2, 3, 4].map(i => `<i class="${i < fight.streak ? 'on' : ''}"></i>`).join(''); }
let msgT = 0;
function say(text, ms = 2400) { msgEl.textContent = text; msgEl.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => msgEl.classList.remove('show'), ms); }
function floatText(text, e, cls = '') {
  const p = e.g ? e.g.position.clone().add(new THREE.Vector3(0, (e.h || 2) + 0.6, 0)) : e.clone();
  const v = p.project(camera), d = document.createElement('div');
  d.className = 'float ' + cls; d.innerHTML = text;
  d.style.left = (v.x + 1) / 2 * innerWidth + 'px'; d.style.top = (1 - v.y) / 2 * innerHeight + 'px';
  document.body.appendChild(d); setTimeout(() => d.remove(), 1100);
}
function addCoins(n, at) { run.coins += n; renderCoins(true); efekt('minca', 0.45, 0.95 + Math.random() * 0.1); if (at) floatText(icon('coin', 'currentColor') + '+' + n, at, 'coin'); }
let shakeV = 0, hurtV = 0;
const G = {
  get run() { return run; }, now: 0, over: false, danger: false, room: null, stats: { ok: 0, bad: 0 },
  tagsEl: $('tags'), inpEl, height: (x, z) => place.height(x, z),
  say, floatText, renderStreak, addCoins, shake: v => { shakeV = Math.max(shakeV, v); },
  hurt() {
    if (G.over) return;
    run.hearts--; renderHearts(true); shakeV = 0.5; hurtV = 1; persist();
    if (run.hearts <= 0) gameOver();
  },
  onWin: opts => winFight(opts),
  enemyHp: (kind, boss, elite, trait) => Math.round(enemyHpM(kind, adv() ? (Math.max(1, hordeN) - 1) % HPZ + 1 : Math.max(1, hordeN), run.zone, { boss, elite }) * (trait ? bossHpMul(trait) : 1)),   // život podľa hordy v zóne a zóny
  bossTrait: id => BOSSES[id],
  onKill: e => { dropGems(e.g.position, xpFor(e.maxHp || 4) * (e.exact ? 2 : 1)); },   // presný zásah = 2× kryštály   // z nepriateľov padajú len kryštály (Lukáš 21. 10.)
};
initFight(G);

// ---------- miesto (miestnosť alebo interiér): výška zeme, kam sa dá ísť, prekážky ----------
let place = { height: () => 0, inside: () => true, blockers: [], ground: null };
let numStones = [];
let R = null, room = null, gates = [], bands = [], act = null, band = [], chests = [], runes = [], bushes = [], labels = [], goalDone = false, lock = null, inside = false;
const roomRng = () => mulberry32(run.seed * 31 + run.zone * 997 + (run.w.camps.length * 7 + run.w.chests.length * 13 + run.w.bushes.length * 17) + 1);

function label(html, pos, cls = '') { const el = document.createElement('div'); el.className = 'wlabel ' + cls; el.innerHTML = html; labelsEl.appendChild(el); const l = { el, pos }; labels.push(l); return l; }
function clearRoom() {
  if (room) scene.remove(room);
  for (const l of labels) l.el.remove();
  labels = []; band = []; bands = []; act = null; gates = []; if (typeof gems !== "undefined") gems.length = 0; chests = []; runes = []; bushes = []; lock = null;
  endFight();
}
function buildRoom() {
  clearRoom(); inside = false;
  denNoc();
  R = genWorld(run.seed, run.zone, { rune: run.range < 10 && !adv(), open: adv() });   // Majster: otvorený svet ako v hordových hrách
  const W = run.w;
  room = new THREE.Group(); scene.add(room); G.room = room;
  // zem celého sveta
  const geo = new THREE.PlaneGeometry(R.W + 16, R.H + 16, (R.W + 16) * 2, (R.H + 16) * 2);
  geo.rotateX(-Math.PI / 2); geo.translate(R.W / 2, 0, R.H / 2);
  const pa = geo.attributes.position, col = new Float32Array(pa.count * 3), c1 = new THREE.Color(0xd8d4ca), c2 = new THREE.Color(0xe4e0d7), cc = new THREE.Color();
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i); pa.setY(i, R.height(x, z)); cc.copy(c1).lerp(c2, R.onPath(x, z) ? 1 : 0); col.set([cc.r, cc.g, cc.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, MAT.ground); ground.receiveShadow = true; room.add(ground); ground.layers.enable(2);
  // svet po oblastiach: každá má vlastné inštancie → kreslí sa len to, čo je v zábere (výkon)
  const byArea = list => { const g = R.areas.map(() => []); for (const it of list) g[R.areaAt(it.x, it.z).id].push(it); return g; };
  const gA = byArea(R.grass), fA = byArea(R.flowers), pA = byArea(R.props);
  R.areas.forEach((a, i) => {
    if (gA[i].length) inst(room, GRASS, MAT.grass, gA[i], R.height, false).layers.enable(2);
    if (fA[i].length) inst(room, FLOWER, MAT.flower, fA[i].map(f => ({ ...f, y: R.height(f.x, f.z) + 0.12 + f.s * 0.05 })), R.height);
    placeModels(room, pA[i], R.height);
  });
  place = { height: R.height, inside: R.inside, blockers: R.props.filter(p => p.col).map(p => ({ x: p.x, z: p.z, r: p.col * p.s })), ground };
  // bandy pri ohni (porazené už nie sú), vodca stojí v pevnosti
  for (const c of R.camps) {
    if (W.camps.includes(c.id)) continue;
    const fs = [];
    if (c.boss) { const f = makeFighter('barbarian', 1.5, room); f.g.position.set(c.x, R.height(c.x, c.z), c.z); f.g.rotation.y = Math.PI; f.play('2H_Melee_Idle'); fs.push(f); }
    else c.types.slice(0, c.n).forEach((k, i) => {
      const f = makeFighter(k, c.elite && i === 0 ? 1.25 : 1, room), a = i / c.n * Math.PI * 2 + 0.4, x = c.x + Math.cos(a) * 1.7, z = c.z + Math.sin(a) * 1.7;
      f.g.position.set(x, R.height(x, z), z); f.g.rotation.y = Math.atan2(c.x + 1.2 - x, c.z + 1.5 - z); f.sitting = true; f.play('Sit_Floor_Idle'); fs.push(f);
    });
    bands.push({ camp: c, f: fs }); band.push(...fs);
  }
  // nálezy
  for (const f of R.finds) {
    if (f.kind === 'chest') {
      const ch = makeChest(), done = W.chests.includes(f.id); ch.position.set(f.x, R.height(f.x, f.z), f.z); ch.rotation.y = 0.3; room.add(ch);
      if (done && ch.userData.lid) ch.userData.lid.rotation.x = -1.6;
      chests.push({ ...f, obj: ch, open: done }); place.blockers.push({ x: f.x, z: f.z, r: 0.55 });
    }
    if (f.kind === 'rune' && !W.runes.includes(f.id)) { const r = runeStone('10'); r.position.set(f.x, R.height(f.x, f.z), f.z); room.add(r); runes.push({ ...f, obj: r, done: false }); }
  }
  bushes = R.hides.map(h => ({ ...h, searched: W.bushes.includes(h.id), shake: 0 }));
  // čísla na mape (Majster): kameň s číslom + svietiaci kruh (bez bodového svetla – svetlá sú drahé)
  numStones = [];
  if (adv()) for (const n of R.nums) if (!(W.nums || []).includes(n.id)) {
    const g = new THREE.Group(), side = std(0xc8c4ba);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.16), [side, side, side, side, new THREE.MeshStandardMaterial({ map: digitTexture(String(n.v)), roughness: 0.9 }), side]); st.position.y = 0.75; st.castShadow = true; g.add(st);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd25a })); halo.position.y = 0.05; halo.layers.enable(4); g.add(halo);
    g.position.set(n.x, R.height(n.x, n.z), n.z); room.add(g); numStones.push({ ...n, obj: g, st });
  }
  if (R.building) label(icon('mug') + ' Obchod', new THREE.Vector3(R.building.door[0], 3.6, R.building.door[1] - 0.6), 'shop');
  // brány: do pevnosti vodcu na kľúče, do trezoru na číslo
  R.gates.forEach((g, i) => {
    const obj = makeGate(g), open = W.gates.includes(i);
    const gg = { ...g, i, obj, open, warned: 0 };
    obj.userData.open = open ? 1 : 0;
    if (g.kind === 'lock') { gg.n = 4 + Math.floor(mulberry32(run.seed + i * 31)() * (Math.min(run.range, 10) - 3)); gg.label = label(icon('lock') + pix(gg.n), new THREE.Vector3(g.x, 3.4, g.z), 'lock' + (open ? ' done' : '')); }
    else gg.label = label('', new THREE.Vector3(g.x, 3.4, g.z), 'lock' + (open ? ' done' : ''));
    gates.push(gg);
  });
  renderGates(); addFires(); buildTut();
  goalDone = false;
  hero.position.set(R.start[0], R.height(...R.start), R.start[1]); hero.rotation.y = Math.PI;
  vel.set(0, 0, 0); target = null; snapCam = true;
  renderGoal();
}
// Základ = deň, Pokročilý = noc (svieti palica, ohne bánd, kúzla)
const NIGHT = new THREE.Color(0x0b0b10), PAPERC = new THREE.Color(PAPER);
let dnT = 0;   // 0 = deň, 1 = noc (plynulo pri výbere režimu)
function denNocT(t) {
  dnT = t; const L = (a, b) => a + (b - a) * t;
  scene.background.copy(PAPERC).lerp(NIGHT, t); scene.fog.color.copy(scene.background); svetloDenNoc(t);
  lamp.base = L(1.6, 5); crystalLight.distance = L(5, 7.5); crystalLight.decay = L(1.6, 1.5); crystalLight.intensity = lamp.base;
  if (crystalLight.castShadow !== t > 0.5) { crystalLight.castShadow = t > 0.5; sun.castShadow = !(t > 0.5); hero.traverse(o => { if (o.isMesh) o.castShadow = !(t > 0.5); }); }   // v noci mesiac bez tieňov (len jemné svetlo), tiene len od palice   // v noci palica vrhá tiene; čarodejník sám od svojej palice nie
}
function denNoc() { denNocT(adv() ? 1 : 0); document.body.classList.toggle('majster', adv()); }
// tiene od svetla palice (v noci): kocková mapa 512 px, dosah len okolo čarodejníka
crystalLight.shadow.mapSize.set(256, 256); crystalLight.shadow.camera.near = 0.15; crystalLight.shadow.camera.far = 9; crystalLight.shadow.bias = -0.004; crystalLight.shadow.radius = 2;
// ohne pri táboroch (v noci viditeľné zďaleka), blikajú podľa šumu
let fires = [];
// len 2 svetlá (počet svetiel = cena každého materiálu), presúvajú sa k najbližším ohňom
const fireL = [0, 1].map(() => { const l = new THREE.PointLight(0xff8a3a, 0, 9, 1.4); scene.add(l); return l; });
function addFires() {
  fires = [];
  for (const b of bands) if (!b.camp.boss) { const c = b.camp; fires.push({ p: new THREE.Vector3(c.x + 1.2, R.height(c.x + 1.2, c.z + 1.5) + 0.8, c.z + 1.5), b, ph: Math.random() * 9, col: 0xff8a3a }); }
  if (R.building) fires.push({ p: new THREE.Vector3(R.building.door[0], R.height(...R.building.door) + 2, R.building.door[1] + 0.6), ph: 3, col: 0xffc070 });
}
function updateFires(t) {
  const live = fires.filter(f => dnT > 0.5 && !inside && (!f.b || bands.includes(f.b))).sort((a, b) => a.p.distanceTo(hero.position) - b.p.distanceTo(hero.position));
  fireL.forEach((l, i) => { const f = live[i]; if (!f) { l.intensity = 0; return; } l.position.copy(f.p); l.color.set(f.col); l.intensity = 9 + Math.sin(t * 7 + f.ph) * 1.6 + Math.sin(t * 13.3 + f.ph * 2) * 1.1; });
  // farba palice = živel kúzla: v Pokročilom prvé znamienko vzorca v ruksaku, v Základe zem (+)
  const sp = (run.pack.rows[fight.on ? curRow() : 0] || []).map(id => run.pack.inv.find(x => x.id === id)).find(x => x && x.t === 'o');
  lamp.color = { '+': 0xc8923a, '-': 0x4fa8ff, '×': 0xff5a22, '÷': 0x7fe8d8 }[adv() && sp ? sp.v : '+'];
  if (!fight.on && !scrOn) { crystalLight.color.set(lamp.color); crystal.material.color.set(lamp.color); crystalLight.intensity = lamp.base + (adv() ? Math.sin(t * 2.3) * 0.4 : 0); }
}
// ---------- ÚVOD MAJSTRA (ako v Magicrafte): ruksak → 1 + 1 → strašiak na rozohriatie → truhlica s 2 → výmena → bandy ----------
const TUT = ['Otvor Knihu kúziel – tlačidlo Kniha hore vpravo.', 'Na kalkulačke v Knihe ťukni postupne: 1, potom +, potom 1.', 'Choď k strašiakovi (WASD / šípky) a klikni naň – vystrelíš kúzlo z Knihy.',
  'Strašiak padol! Otvor truhlicu vedľa neho – je v nej číslo.', 'V Knihe stlač ⌫ (zmaže poslednú 1) a ťukni 2. Kúzlo bude silnejšie.', 'Výborne! Teraz choď na bandy, zbieraj čísla a kľúče. Mínus ti dá vodca.'];
let tutDummy = null, tutChest = null;
const tutOn = () => adv() && run.tut < 6 && run.zone === 1;
function tutSpot(dx, dz) { const s = R.start; for (let r = 0; r < 4; r += 0.5) for (let a = 0; a < 6.28; a += 0.6) { const x = s[0] + dx + Math.cos(a) * r, z = s[1] + dz + Math.sin(a) * r; if (R.inside(x, z) && place.blockers.every(b => Math.hypot(b.x - x, b.z - z) > b.r + 1.2)) return [x, z]; } return [s[0] + dx, s[1] + dz]; }
function buildTut() {
  tutDummy = tutChest = null; $('tut').classList.toggle('hidden', !tutOn());
  if (!tutOn()) return;
  if (run.tut < 3) { // strašiak: stojí, nebráni sa
    const [x, z] = tutSpot(5, -1.5), f = makeFighter('rogue', 1, room);
    f.g.position.set(x, R.height(x, z), z); f.g.rotation.y = -Math.PI / 2; f.play('Idle'); f.dummy = true;
    tutDummy = { camp: { id: 'tut', x, z, dummy: true, n: 1 }, f: [f] }; bands.push(tutDummy); band.push(f);
  }
  if (run.tut >= 3 && run.tut < 4) addTutChest();
  renderTut();
}
function addTutChest() {
  const [x, z] = tutSpot(7, 1.5), ch = makeChest(); ch.position.set(x, R.height(x, z), z); ch.rotation.y = -0.4; room.add(ch);
  tutChest = { id: 'tut', kind: 'chest', n: 'tut', x, z, obj: ch, open: false }; chests.push(tutChest); place.blockers.push({ x, z, r: 0.55 });
  burst(ch.position.clone().add(new THREE.Vector3(0, 1, 0)), 120, 3, 0xffd25a);
}
function renderTut() {
  const on = tutOn(); $('tut').classList.toggle('hidden', !on); $('bBook').classList.toggle('pulse', on && run.tut === 0);
  if (on) $('tut').innerHTML = `<span class="ptag">Úvod · ${Math.min(run.tut + 1, 6)}/6</span>${TUT[Math.min(run.tut, 5)]}`;
}
function tutStep(n) { if (!tutOn() || run.tut >= n) return; run.tut = n; if (n >= 5) meta.tutDone = true; persist(); renderTut(); if (n === 5) setTimeout(() => { run.tut = 99; persist(); renderTut(); }, 9000); }
function tutTick() {
  if (!tutOn()) return;
  if (run.tut === 1 && spellWorks(run)) tutStep(2);
  if (run.tut === 4 && spellWorks(run) && run.pack.rows[0].some(id => (run.pack.inv.find(t => t.id === id) || {}).v === 2)) tutStep(5);
}
function renderGates() { for (const g of gates) if (g.kind === 'boss') g.label.el.innerHTML = icon('key') + `${Math.min(run.w.keys, g.need)}/${g.need}`; }
const bossGate = () => gates.find(g => g.kind === 'boss');
function renderGoal() {
  if (adv()) { const left = HPZ - ((hordeN - 1 + HPZ) % HPZ) - 1; goalEl.innerHTML = `<span class="st">zóna ${run.zone}</span><b>Horda ${hordeN} · ${hordeN % HPZ === 0 && fight.on ? 'VODCA ZÓNY!' : `vodca zóny o ${left || HPZ} ${left === 1 ? 'hordu' : 'hôrd'}`}</b>`; return; }
  const bg = bossGate(), k = run.w.keys, need = bg ? bg.need : 0;
  const txt = bg && bg.open ? 'Poraz vodcu zbojníkov' : k >= need ? 'Máš všetky kľúče · choď k bráne vodcu' : 'Poraz bandy a nájdi kľúče';
  goalEl.innerHTML = `<span class="st">${icon('key')} ${k}/${need}</span><b>${txt}</b>`;
}
// brána: dva kamenné stĺpy, medzi nimi bariéra, kým sa neotvorí
function makeGate(g) {
  const o = new THREE.Group();
  for (const dz of [-2.4, 2.4]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 0.8), MAT.stone); p.position.set(0, 1.5, dz); p.castShadow = true; o.add(p);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1), MAT.stone); cap.position.set(0, 3.1, dz); o.add(cap);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 5.6), MAT.stone); beam.position.y = 3.3; o.add(beam);
  const barrier = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: g.kind === 'boss' ? 0xe8b040 : 0x8dff98, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  barrier.position.y = 1.3; o.add(barrier);
  o.userData = { barrier, open: 0 };
  o.position.set(g.x, R.height(g.x, g.z), g.z); if (g.axis === 'h') o.rotation.y = Math.PI / 2;
  room.add(o);
  return o;
}
function openGate(g, msg) {
  g.open = true; if (!run.w.gates.includes(g.i)) run.w.gates.push(g.i); persist();
  g.label.el.classList.add('done'); burst(g.obj.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 160, 5, g.kind === 'boss' ? 0xe8b040 : 0x8dff98);
  say(msg); renderGoal();
}
const gateBlocks = (x, z) => gates.some(g => !g.open && (g.axis === 'v' ? Math.abs(x - g.x) < 0.8 && Math.abs(z - g.z) < 2.7 : Math.abs(z - g.z) < 0.8 && Math.abs(x - g.x) < 2.7));
function makeChest() {
  const g = new THREE.Group();
  if (RAW.chest) { const c = RAW.chest.clone(true); c.scale.setScalar(0.62); g.add(c); g.userData.lid = c.getObjectByName('chest_lid'); }
  else { const b = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.62), std(0x6a625a)); b.position.y = 0.3; g.add(b); }
  return g;
}
function runeStone(text) {
  const g = new THREE.Group(), side = std(0xc8c4ba);
  const stone = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, 0.22), [side, side, side, side, new THREE.MeshStandardMaterial({ map: digitTexture(text), roughness: 0.9 }), side]);
  stone.position.y = 0.95; stone.castShadow = true; g.add(stone);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd25a })); halo.position.y = 0.05; g.add(halo);
  const light = new THREE.PointLight(0xffd25a, 3, 5, 1.6); light.position.y = 1.2; g.add(light);
  g.userData = { stone, halo, light };
  return g;
}

// ---------- obchod (interiér z KayKit Dungeon, tmavý režim) ----------
const IX = 200;
let interior = null, innkeeper = null, shopNear = false;
function buildInterior() {
  interior = new THREE.Group(); interior.visible = false; scene.add(interior);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x15161a })); floor.position.set(IX, -0.12, 0); interior.add(floor);
  const P = [], h = () => 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) P.push({ m: 'floor_wood_large', x: IX - 4.5 + i * 3, z: -3 + j * 3, y: 0, r: 0, s: 1 });
  for (let i = 0; i < 4; i++) P.push({ m: 'wall', x: IX - 4.5 + i * 3, z: -4.5, y: 0, r: 0, s: 1 });
  for (let j = 0; j < 3; j++) { P.push({ m: 'wall', x: IX - 6, z: -3 + j * 3, y: 0, r: Math.PI / 2, s: 1 }); P.push({ m: 'wall', x: IX + 6, z: -3 + j * 3, y: 0, r: Math.PI / 2, s: 1 }); }
  P.push({ m: 'table_medium', x: IX - 1.6, z: -2, y: 0, r: 0, s: 1.3 }, { m: 'table_medium', x: IX + 0.4, z: -2, y: 0, r: 0, s: 1.3 });
  P.push({ m: 'keg', x: IX - 2.1, z: -2.1, y: 0.98, r: 0.4, s: 0.8 }, { m: 'candle_lit', x: IX + 0.9, z: -2, y: 0.98, r: 0, s: 1 }, { m: 'coin_stack_medium', x: IX + 0.2, z: -1.8, y: 0.98, r: 0, s: 1 });
  P.push({ m: 'shelves', x: IX - 3.2, z: -4.1, y: 0, r: 0, s: 1 }, { m: 'shelves', x: IX + 2.8, z: -4.1, y: 0, r: 0, s: 1 }, { m: 'torch_mounted', x: IX - 0.6, z: -4.2, y: 1.6, r: 0, s: 1 });
  P.push({ m: 'barrel_large', x: IX - 5, z: -3.5, y: 0, r: 0, s: 1 }, { m: 'barrel_large', x: IX - 5.1, z: -2.2, y: 0, r: 1, s: 0.9 }, { m: 'crates_stacked', x: IX + 4.9, z: -3.4, y: 0, r: 0.3, s: 1 });
  P.push({ m: 'stool', x: IX + 3.4, z: 1.2, y: 0, r: 0, s: 1 }, { m: 'table_medium', x: IX + 3.8, z: 2.2, y: 0, r: 0.2, s: 1.1 }, { m: 'box_small', x: IX - 4.6, z: 2.4, y: 0, r: 0.5, s: 1 });
  placeModels(interior, P, h);
  { const l = new THREE.PointLight(0xffd8a0, 16, 12, 1.4); l.position.set(IX, 2.6, 3.4); interior.add(l); }   // svetlo spredu (od dverí) – postavy v obchode nie sú čierne siluety
  for (const [x, c] of [[-0.6, 0xffa050], [IX + 3, 0xffc070]]) { const l = new THREE.PointLight(c, 18, 14, 1.4); l.position.set(x < 0 ? IX + x : x, 2.6, x < 0 ? -3.6 : 1.6); l.castShadow = false; interior.add(l); }
  // koberec pri dverách = von
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8dff98 })); rug.position.set(IX, 0.02, 4.1); interior.add(rug);
  innkeeper = makeFighter('innkeeper', 1, interior); innkeeper.g.position.set(IX - 0.6, 0, -3.2); innkeeper.play('Idle');
}
function enterInterior() {
  fade(() => {
    inside = true; room.visible = false; interior.visible = true;
    scene.background.set(0x15161a); scene.fog.color.set(0x15161a); hemi.intensity = 0.2; sun.intensity = 0.1; kresbaMat.uniforms.uDark.value = 1; kresbaMat.uniforms.uNight.value = 1; kresbaMat.uniforms.uLit.value.set(1, 30);   // fakle v obchode sú ďaleko silnejšie ako obloha → širší rozsah, inak je všetko jedna sivá
    place = { height: () => 0, inside: (x, z) => x > IX - 5.4 && x < IX + 5.4 && z > -3.1 && z < 4.6, blockers: [{ x: IX - 0.6, z: -2, r: 1.6 }, { x: IX + 3.8, z: 2.2, r: 0.9 }], ground: interior.children[0] };
    hero.position.set(IX, 0, 2.6); hero.rotation.y = Math.PI; vel.set(0, 0, 0); target = null;
    labels.forEach(l => { l.el.style.display = 'none'; });
    goalEl.innerHTML = `<b>${icon('mug')} Obchod</b>`;
    shopNear = false;
  });
}
function exitInterior() {
  fade(() => {
    inside = false; interior.visible = false; room.visible = true; kresbaMat.uniforms.uDark.value = 0; kresbaMat.uniforms.uLit.value.set(1, 3.6);
    denNoc();
    place = { height: R.height, inside: R.inside, blockers: R.props.filter(p => p.col).map(p => ({ x: p.x, z: p.z, r: p.col * p.s })), ground: room.children[0] };
    hero.position.set(R.building.door[0], R.height(...R.building.door), R.building.door[1] + 2); vel.set(0, 0, 0); target = null;
    labels.forEach(l => { l.el.style.display = ''; });
    renderGoal();
  });
}

// ---------- prekryvné okná: karty, kniha, mapa, obchod, koniec ----------
let paused = false;
function overlay(title, html, cls = '') { document.body.classList.add('ovon'); ovEl.className = 'ov show ' + cls; ovEl.innerHTML = `<div class="box panel"><span class="ptag">${title}</span>${html}</div>`; paused = true; return ovEl; }
// ✕ v rohu obrazovky (mimo .box, aby bol vždy vidno aj na nízkom mobile na šírku); klik = rovnaké ako tlačidlo Zavrieť
function addX(fn) { let x = ovEl.querySelector(':scope > .ovx'); if (!x) { x = document.createElement('button'); x.className = 'ovx'; x.setAttribute('aria-label', 'Zavrieť'); x.textContent = '✕'; ovEl.appendChild(x); } x.onclick = fn; }
function closeOverlay() { document.body.classList.remove('ovon'); ovEl.className = 'ov'; ovEl.innerHTML = ''; paused = scrOn; }
// výber 1 z 3 (po súboji, z truhlice)
function cardOffer(title, after) {
  const ids = offer(run, roomRng());
  if (!ids.length) { addCoins(8); after && after(); return; }
  const el = overlay(title, `<p class="sub">Vyber si jedno kúzlo do Knihy.</p><div class="cards">${ids.map(id => card(id, { l: lvl(run, id) + 1, cls: 'pick', data: `data-id="${id}"`, count: lvl(run, id) ? 2 : 0, foot: '<span class="btn">Vybrať</span>' })).join('')}</div><div class="acts"><button class="btn ghost" id="skip">${icon('coin')} Radšej 5 mincí</button></div>`, 'offer');
  el.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => { closeOverlay(); addCard(c.dataset.id, after); }));
  el.querySelector('#skip').onclick = () => { closeOverlay(); addCoins(5); persist(); after && after(); };
}
function addCard(id, after) {
  if (!meta.seen.includes(id)) meta.seen.push(id);
  const have = run.cards.find(c => c.id === id);
  if (have) { have.l = 2; say(`${CARDS[id].name}: úroveň 2!`); }
  else if (run.cards.length < SLOTS) { run.cards.push({ id, l: 1 }); say(`Nové kúzlo: ${CARDS[id].name}`); }
  else return openBook({ replace: id, after });
  if (id === 'srdce') run.hearts = Math.min(maxHearts(), run.hearts + 1);
  renderHearts(); renderSlots(); persist(); after && after();
}
function openBook(opts = {}) {
  const zivly = ['+', '-', '×', '÷'].map(o => card(o, { mini: true, locked: !(o === '+' || run.ops.includes(o)) })).join('');
  const slots = Array.from({ length: SLOTS }, (_, i) => { const c = run.cards[i]; return c ? card(c.id, { l: c.l, cls: opts.replace ? 'slotpick' : '', data: `data-slot="${i}"` }) : `<div class="card panel" style="display:grid;place-items:center;min-height:150px;border-style:dashed"><span class="ptag">Prázdne</span><span style="color:var(--grey);font-size:13px">miesto na kúzlo</span></div>`; }).join('');
  const all = Object.keys(CARDS).map(id => card(id, { mini: true, locked: !meta.seen.includes(id), l: lvl(run, id) || 1 })).join('');
  const el = overlay('Kniha kúziel', `
    ${opts.replace ? `<p class="sub warn">Kniha je plná. Ťukni na kúzlo, ktoré vymeníš za <b>${CARDS[opts.replace].name}</b>.</p>` : `<p class="sub">Príklady: <b>${['+', ...run.ops.filter(o => o !== '+')].join(' ').replace('-', '−')}</b> · čísla do <b>${run.range}</b> · zóna <b>${run.zone}</b></p>`}
    <h3>V Knihe ${run.cards.length}/${SLOTS}</h3><div class="cards">${slots}</div>
    <h3>Živly</h3><div class="grid">${zivly}</div>
    <h3>Zbierka ${meta.seen.length}/${Object.keys(CARDS).length}</h3><div class="grid">${all}</div>
    <div class="acts"><button class="btn ${opts.replace ? 'ghost' : 'on'}" id="close">${opts.replace ? 'Nechať pôvodné' : 'Zavrieť'}</button></div>`, 'book');
  if (opts.replace) el.querySelectorAll('.card.slotpick').forEach(c => c.addEventListener('click', () => {
    const i = +c.dataset.slot; if (run.cards[i].id === 'srdce') run.hearts = Math.min(run.hearts, 3);
    run.cards[i] = { id: opts.replace, l: 1 }; if (opts.replace === 'srdce') run.hearts++;
    closeOverlay(); renderHearts(); renderSlots(); persist(); say(`Nové kúzlo: ${CARDS[opts.replace].name}`); opts.after && opts.after();
  }));
  el.querySelector('#close').onclick = () => { closeOverlay(); opts.after && opts.after(); }; addX(el.querySelector('#close').onclick);
}
// mapa sveta: len na orientáciu – kde som, objavené oblasti, neobjavené zahalené (ako v Zelde)
function openMap() {
  const S = 6, w = R.W * S / 3, h = R.H * S / 3, sx = x => x * S / 3, seen = id => run.w.seen.includes(id);
  let svg = '';
  for (const a of R.areas) {
    const x = sx(a.i * AW), y = sx(a.j * AH), on = seen(a.id);
    svg += `<rect x="${x + 2}" y="${y + 2}" width="${sx(AW) - 4}" height="${sx(AH) - 4}" fill="${on ? '#1c1c20' : 'url(#hatch)'}" stroke="${on ? '#f2efe6' : '#3a3936'}" stroke-width="1.5" ${on ? '' : 'stroke-dasharray="4 3"'}/>`;
    if (!on) continue;
    const ic = a.kind === 'boss' ? 'crown' : a.kind === 'obchod' ? 'mug' : a.kind === 'poklad' ? 'key' : a.kind === 'zamok' ? 'lock' : null;
    const camp = R.camps.find(c => c.area === a.id && !c.boss), beaten = camp && run.w.camps.includes(camp.id);
    const icn = camp ? (beaten ? 'star' : 'swords') : ic;
    if (icn) svg += `<g transform="translate(${sx(a.cx) - 9},${sx(a.cz) - 9}) scale(2.6)" opacity="${beaten ? 0.45 : 1}">${icon(icn, '#f2efe6').replace(/<svg[^>]*>|<\/svg>/g, '')}</g>`;
  }
  for (const l of R.links) if (seen(l.a) || seen(l.b)) {
    const g = gates.find(g => g.x === l.x && g.z === l.z), c = g && !g.open ? (g.kind === 'boss' ? '#e8b040' : '#8dff98') : '#f2efe6';
    svg += l.axis === 'v' ? `<rect x="${sx(l.x) - 5}" y="${sx(l.z) - 6}" width="10" height="12" fill="${c}"/>` : `<rect x="${sx(l.x) - 6}" y="${sx(l.z) - 5}" width="12" height="10" fill="${c}"/>`;
  }
  const hx = sx(inside ? R.building.door[0] : hero.position.x), hy = sx(inside ? R.building.door[1] : hero.position.z);
  svg += `<g transform="translate(${hx},${hy})"><rect x="-6" y="-6" width="12" height="12" transform="rotate(45)" fill="#f2efe6" stroke="#0e0e10" stroke-width="2"/></g>`;
  // cesta zón (postup): Učeň ju prechádza pomaly, Majster vidí, koľko vodcov ešte ostáva
  const zones = Array.from({ length: FINAL_ZONE }, (_, i) => { const z = i + 1, done = z < run.zone, cur = z === run.zone; return `<span class="zn${done ? ' done' : ''}${cur ? ' cur' : ''}">${done ? icon('star') : cur ? icon('hat') : z}</span>`; }).join('<i class="zl"></i>');
  const el = overlay(`Zóna ${run.zone} · Mapa`, `<div class="zpath">${zones}</div><p class="sub">${adv() ? `Vodca zóny: <b>${BOSSES[bossOf(run.zone, run.seed)].name}</b> – ${BOSSES[bossOf(run.zone, run.seed)].hint}. ` : ''}Kľúče <b>${run.w.keys}/${bossGate() ? bossGate().need : 0}</b> · objavené <b>${run.w.seen.length}/${R.areas.length}</b> oblastí</p>
    <svg viewBox="-4 -4 ${w + 8} ${h + 8}" style="width:100%;max-width:${Math.round(w * 1.4)}px;max-height:58vh;display:block;margin:10px auto 0" shape-rendering="crispEdges">
    <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#0e0e10"/><path d="M0 6L6 0" stroke="#3a3936" stroke-width="1"/></pattern></defs>${svg}</svg>
    <div class="acts"><button class="btn on" id="close">Zavrieť</button></div>`, 'mapov');
  el.querySelector('#close').onclick = closeOverlay;
}
// ---------- ruksak (Pokročilý) ----------
const OPC = { '+': '#c8923a', '-': '#4fa8ff', '×': '#ff5a22', '÷': '#7fe8d8', '√': '#b07ad8', '²': '#ffd25a', '³': '#ffa040', '!': '#ff3a6a' };
const tokHtml = (x, cls = '') => x.t === 'd' ? `<span class="tk die ${cls}" data-id="${x.id}">${pix('?')}</span>` : x.t === 'o' ? `<span class="tk op ${cls}" data-id="${x.id}" style="--c:${OPC[x.v]}">${pix(x.v)}</span>` : `<span class="tk num ${cls}" data-id="${x.id}">${pix(x.v)}</span>`;
function giveLoot(at, tier = 0) {
  if (!adv()) return;
  const t = lootToken(run, Math.random, tier);
  if (!addToken(run.pack, t)) { addCoins(2, at); return; }
  persist(); if (t.t !== 'slot' && t.t !== 'row') floatText(`${t.t === 'd' ? pix('?') : pix(t.v)}`, at, 'coin');
  if (t.t === 'slot') { floatText(icon('star'), at, 'coin'); say(`Väčšia kalkulačka! Teraz má ${run.pack.slots} políčok.`); return; }
  if (t.t === 'row') { floatText(icon('book'), at, 'coin'); say(`Nové miesto na kúzlo! Máš ${run.pack.rows.length} – striedajú sa v poradí.`); return; }
  say(t.t === 'd' ? 'Nový kláves: kocka □ (náhodné číslo)!' : t.t === 'o' ? `Nový kláves: ${t.v.replace('-', '−')}!` : `Nový kláves: ${t.v}!`);
}
// RUKSAK = KALKULAČKA (ako Calculate It): klasická klávesnica, čo nemáš je zamknuté, čo máš viackrát má odznak s počtom.
// Displej = kúzla (riadky). Ťuk na kláves = diel na koniec aktívneho riadku; ⌫ vráti posledný, C vyčistí riadok, = hotovo.
let packRow = 0;
// rozloženie ako vedecká kalkulačka: funkcie v 4. stĺpci, znamienka vpravo
const KEYS = [['C', 'fn'], ['⌫', 'fn'], ['( )', 'p'], ['√', 's'], ['÷', 'o'], ['7', 'n'], ['8', 'n'], ['9', 'n'], ['x²', 'x', -4, 'q'], ['×', 'o'], ['4', 'n'], ['5', 'n'], ['6', 'n'], ['x³', 'x', -5, 'c'], ['-', 'o'], ['1', 'n'], ['2', 'n'], ['3', 'n'], ['!', 'x', -6, 'f'], ['+', 'o'], ['□', 'd'], ['0', 'n'], ['=', 'fn']];
function openPack() {
  tutStep(1); tutTick();
  const P = run.pack; packRow = Math.min(packRow, P.rows.length - 1);
  const usedIds = allIds(P), free = P.inv.filter(t => !usedIds.has(t.id));
  const match = (k, t) => (k[1] === 'n' && t.t === 'n' && String(t.v) === k[0]) || (k[1] === 'o' && t.t === 'o' && t.v === k[0]) || (k[1] === 'd' && t.t === 'd');
  const row = P.rows[packRow], last = row.length ? tokOf(P, row[row.length - 1]) : null;
  const wantNum = !last || last.t === 'o' || last.t === 's' || (last.t === 'p' && last.v === '(');   // ² ³ ! idú za číslom (wantNum = false)   // čaká sa číslo (ako na kalkulačke)
  const open = row.filter(id => id === -1).length - row.filter(id => id === -2).length;
  const U = P.unlock || {};
  const name = o => ({ '+': 'zem', '-': 'voda', '×': 'oheň', '÷': 'vzduch', '√': 'prieraz', '²': 'mocnina', '³': 'mocnina', '!': 'faktoriál' }[o]);
  const lcdRow = r => {
    const ids = P.rows[r], ok = spellWorks(run, r), st = ok ? strength(run, mulberry32(7), r) : null, ex = ok ? rollSpell(run, mulberry32(3), r) : null;
    const txt = ids.map(id => { const t = tokOf(P, id); return t ? (t.t === 'd' ? '?' : t.v) : ''; }).join('');
    const pad = '_'.repeat(Math.max(0, staffStats(P).disp - ids.length));
    const dice = ids.some(id => (tokOf(P, id) || {}).t === 'd');
    const res = ok ? (dice ? `${st.lo}…${st.hi}` : String(ex.answer)) : '?';
    const ops = ok ? [...new Set(ex.ops)].map(o => `<span style="color:${OPC[o]}">${name(o)}</span>`).join(' ') : '';
    return `<div class="lrow${r === packRow ? ' on' : ''}" data-r="${r}"><span class="ln">${r + 1}</span><span class="lf">${txt ? pix(txt) : ''}<i>${pad}</i></span><span class="lr">=${res.includes('…') ? res : pix(res)}</span><span class="lo">${ok ? `sila ${st.lo}–${st.hi} · ⚡${rowCost(P, r)} ${ops}` : ids.length ? 'nehotové' : 'prázdne'}</span></div>`;
  };
  const keyHtml = (k, i) => {
    if (k[1] === 'fn') return `<button class="ck fn${k[0] === '=' ? ' eq' : ''}" data-k="${i}">${k[0]}</button>`;
    if (k[1] === 'lock') return `<button class="ck locked" disabled title="odomkne sa neskôr">${k[0]}<small>${icon('lock')}</small></button>`;
    // špeciálne klávesy od bossov: √ (pred číslo) a ( ) – sám vie, či teraz otvára alebo zatvára
    if (k[1] === 's' || k[1] === 'p' || k[1] === 'x') {
      const own = k[1] === 's' ? U.s : k[1] === 'p' ? U.p : U[k[3]], ok = own && (k[1] === 's' ? wantNum : k[1] === 'x' ? !wantNum : wantNum || open > 0);
      const lab = k[1] === 's' ? '√' : k[1] === 'x' ? k[0] : wantNum ? '(' : ')';
      return `<button class="ck sp${own ? '' : ' locked'}" data-k="${i}" ${ok ? '' : 'disabled'} title="${own ? '' : 'odomkne vodca'}">${lab}${own ? '' : `<small>${icon('lock')}</small>`}</button>`;
    }
    const n = free.filter(t => match(k, t)).length, owned = P.inv.some(t => match(k, t));
    const wrong = k[1] === 'o' ? wantNum : !wantNum;
    const sN = k[1] === 'n' && P.stars ? P.stars[+k[0]] || 0 : 0;
    const lab = (k[1] === 'n' || k[1] === 'd' ? (k[0] === '□' ? pix('?') : pix(k[0])) : pix(k[0])) + (sN ? `<em class="star">${'★'.repeat(sN)}</em>` : '');
    return `<button class="ck ${k[1]}${owned ? '' : ' locked'}" data-k="${i}" ${n && !wrong ? '' : 'disabled'} style="${k[1] === 'o' ? `--c:${OPC[k[0]]}` : ''}">${lab}${n > 1 ? `<b class="badge">${n}</b>` : ''}${owned ? '' : `<small>${icon('lock')}</small>`}</button>`;
  };
  // pravá strana Knihy: efekty (karty) – len 4 miesta, treba si vybrať
  const fx = Array.from({ length: SLOTS }, (_, i) => { const c = run.cards[i]; return c ? card(c.id, { mini: true, l: c.l }) : `<div class="card panel mini" style="display:grid;place-items:center;min-height:118px;border-style:dashed"><span class="ptag">Prázdne</span><span style="color:var(--grey);font-size:11px;text-align:center">efekt nájdeš<br>po bandách</span></div>`; }).join('');
  // KNIHA KÚZIEL: vľavo zápis (kúzla ako riadky + efekty), vpravo kalkulačka (displej aktívneho kúzla + klávesnica)
  const html = `<span class="ptag">Kniha kúziel</span><div class="book2">
    <div class="page lp">
      <h3>Kúzla${P.rows.length > 1 ? ' · v súboji idú 1 → 2 → 3' : ''}</h3>
      <div class="notes">${P.rows.map((_, r) => lcdRow(r)).join('')}</div>
      <h3>Efekty ${run.cards.length}/${SLOTS}</h3><div class="fxgrid">${fx}</div>
      <p class="sub">Efekty platia pre každé kúzlo. Miesta sú len ${SLOTS} – vyber si.</p>
    </div>
    <div class="page rp">
      <div class="calc2">
        <div class="brand"><b>${staffStats(P).name.toUpperCase()}${P.staff ? ` ${P.staff}★` : ''}</b><span>⚡${staffStats(P).emax} · +${+staffStats(P).regen.toFixed(1)}/s</span></div>
        <div class="lcd2">${lcdRow(packRow).replace('class="lrow', 'class="lrow big')}</div>
        <div class="ckeys">${KEYS.map(keyHtml).join('')}</div>
      </div>
      <p class="sub" style="margin-top:8px">⚡ cena: číslo 1 · + − 1 · × ÷ 2 · ( ) 2 · √ 3 · x² 4 · x³ 6 · ! 8<br>${pix('?').replace('class="pix"', 'class="pix" style="height:.8em"')} = kocka (vždy iné číslo) · zamknuté klávesy nájdeš alebo kúpiš</p>
      ${tutOn() && run.tut <= 4 ? `<p class="sub" style="color:var(--line)">${TUT[run.tut]}</p>` : ''}
    </div></div>`;
  if (ovEl.classList.contains('show') && ovEl.classList.contains('pack')) ovEl.querySelector('.box').innerHTML = html;
  else { document.body.classList.add('ovon'); ovEl.className = 'ov show pack'; ovEl.innerHTML = `<div class="box panel">${html}</div>`; paused = true; }
  const el = ovEl; addX(() => { closeOverlay(); if (fight.on) renderInput(); });
  el.querySelectorAll('.lrow').forEach(r => r.onclick = () => { packRow = +r.dataset.r; openPack(); });
  el.querySelectorAll('.ck[data-k]').forEach(b => b.onclick = () => {
    const k = KEYS[+b.dataset.k], R0 = P.rows[packRow];
    if (k[0] === '=') { closeOverlay(); if (fight.on) renderInput(); return; }
    if (k[0] === 'C') { P.rows[packRow] = []; persist(); return openPack(); }
    if (k[0] === '⌫') { R0.pop(); persist(); return openPack(); }
    if (R0.length >= staffStats(P).disp) { say('Displej je plný – väčšiu palicu kúpiš u obchodníka.'); return; }
    if (k[1] === 's') { R0.push(-3); persist(); return openPack(); }
    if (k[1] === 'x') { R0.push(k[2]); persist(); return openPack(); }
    if (k[1] === 'p') { R0.push(wantNum ? -1 : -2); persist(); return openPack(); }
    const t = free.find(t => match(k, t)); if (!t) return;
    R0.push(t.id); persist(); openPack();
  });
  // klávesnica počítača: čísla, + - * /, Backspace, Enter
  el.onkeydown = null;
}
function openShop() {
  const rng = mulberry32(run.seed + run.zone * 7 + run.w.camps.length * 13 + run.w.chests.length), ids = offer(run, rng), price = id => (lvl(run, id) ? 14 : 10);
  const heal = run.hearts < maxHearts();
  const el = overlay('Obchod', `<div class="shophead">${dia('crown', 'big')}<div><b>Obchodník</b><p class="sub">„Za mince ti predám kúzla a klávesy. Počítať musíš sám.“</p></div><span class="chip">${icon('coin')} <b>${run.coins}</b></span></div>
    <div class="cards">${ids.map(id => card(id, { l: lvl(run, id) + 1, cls: 'pick', data: `data-id="${id}"`, count: lvl(run, id) ? 2 : 0, foot: `<span class="price">${icon('coin')} ${price(id)}</span>` })).join('')}</div>
    <div class="acts"><button class="btn" id="heal" ${heal && run.coins >= 6 ? '' : 'disabled'}>${icon('heart')} Srdiečko · ${icon('coin')} 6</button>${adv() && run.pack.slots < MAX_SLOTS ? `<button class="btn" id="slot" ${run.coins >= slotPrice(run.pack) ? '' : 'disabled'}>+2 políčka · ${icon('coin')} ${slotPrice(run.pack)}</button>` : ''}${adv() && run.pack.rows.length < MAX_ROWS ? `<button class="btn" id="row" ${run.coins >= rowPrice(run.pack) ? '' : 'disabled'}>Ďalšie kúzlo · ${icon('coin')} ${rowPrice(run.pack)}</button>` : ''}${adv() && run.pack.staff < MAX_STAFF ? `<button class="btn" id="staff" ${run.coins >= staffPrice(run.pack) ? '' : 'disabled'}>Lepšia palica · ${icon('coin')} ${staffPrice(run.pack)}</button>` : ''}</div>
    ${adv() ? `<h3>Palice</h3><div class="row staffs">${Object.entries(STAFFS).map(([k, s]) => `<button class="btn ${run.pack.kind === k ? 'on' : ''}" data-staff="${k}" ${run.pack.kind === k || run.coins < s.price ? 'disabled' : ''}><b>${s.name}</b>&nbsp;${s.text} · ⚡${s.emax} +${s.regen}/s · displej ${s.disp}${run.pack.kind === k ? ' · máš' : ` · ${icon('coin')} ${s.price}`}</button>`).join('')}</div>` : ''}<div class="row"><button class="btn ghost" id="close">Odísť</button></div>`, 'offer shopscr');
  el.querySelectorAll('.card').forEach(c => {
    const id = c.dataset.id; if (run.coins < price(id)) c.classList.add('poor');
    c.addEventListener('click', () => { if (run.coins < price(id)) { say('Nemáš dosť mincí.'); return; } run.coins -= price(id); renderCoins(); closeOverlay(); addCard(id); });
  });
  el.querySelector('#heal').onclick = () => { run.coins -= 6; run.hearts++; renderHearts(); renderCoins(); persist(); closeOverlay(); say('Srdiečko doplnené.'); };
  const sl = el.querySelector('#slot'); if (sl) sl.onclick = () => { run.coins -= slotPrice(run.pack); run.pack.slots += 2; renderCoins(); persist(); closeOverlay(); say(`Ruksak má ${run.pack.slots} políčok – dlhšie kúzla!`); };
  const rw = el.querySelector('#row'); if (rw) rw.onclick = () => { run.coins -= rowPrice(run.pack); run.pack.rows.push([]); renderCoins(); persist(); closeOverlay(); say(`Máš ${run.pack.rows.length} kúzla – striedajú sa v poradí.`); };
  el.querySelectorAll('[data-staff]').forEach(b => b.onclick = () => { const s = STAFFS[b.dataset.staff]; run.coins -= s.price; run.pack.kind = b.dataset.staff; renderCoins(); persist(); closeOverlay(); say(`${s.name}!`); });
  const sf = el.querySelector('#staff'); if (sf) sf.onclick = () => { run.coins -= staffPrice(run.pack); run.pack.staff++; renderCoins(); persist(); closeOverlay(); say(`Palica úrovne ${run.pack.staff}: +25 % damage, viac energie.`); };
  el.querySelector('#close').onclick = closeOverlay;
}
function gameOver() {
  G.over = true; endFight(); heroPlay('Death_A', 0.1, 99); bottomEl.classList.add('hidden');
  setTimeout(() => {
    if (!adv()) { // UČEŇ: nič sa nestratí – zóna sa len začne znova
      const el = overlay('Skús to znova', `<div style="display:flex;justify-content:center;margin-bottom:10px">${dia('heart', 'big')}</div>
        <div style="font-size:22px;margin-bottom:8px">Zbojníci ťa dostali</div><p class="sub">Karty, znamienka aj zóna ${run.zone} ti ostávajú. Začneš len túto zónu znova.</p>
        <div class="acts"><button class="btn on" id="again">Znova</button><button class="btn ghost" id="toMenu">Menu</button></div>`, 'end');
      const retry = () => { run.hearts = maxHearts(); run.w = newWorldState(); persist(); };
      el.querySelector('#again').onclick = () => { retry(); sessionStorage.setItem('mm-skip', '1'); location.reload(); };
      el.querySelector('#toMenu').onclick = () => { retry(); sessionStorage.setItem('mm-menu', '1'); location.reload(); };
      return;
    }
    // MAJSTER: vyhodnotenie behu – skóre zo vzorca, rekordy
    const st = run.st, score = Math.round(st.dmg + 50 * st.kills + 200 * st.hordes + 1000 * (run.zone - 1));
    const B = meta.best, rec = score > B.score;
    Object.assign(B, { score: Math.max(B.score, score), zone: Math.max(B.zone, run.zone), hordes: Math.max(B.hordes, st.hordes), hit: Math.max(B.hit, st.hit) }); persist();
    const row = (n, v, b) => `<div class="stat"><span>${n}</span><span>${v}${b !== undefined ? ` <small style="color:var(--grey)">· rekord ${b}</small>` : ''}</span></div>`;
    const el = overlay('Koniec behu', `<div style="display:flex;justify-content:center;margin-bottom:6px">${dia(rec ? 'crown' : 'skull', 'big' + (rec ? ' fill' : ''))}</div>
      <div style="font-size:16px;letter-spacing:2px;text-transform:uppercase;color:var(--grey)">${rec ? 'Nový rekord!' : 'Skóre'}</div><div class="bigop">${pix(score)}</div>
      <div style="max-width:340px;margin:0 auto;text-align:left">${row('Zóna', run.zone, B.zone)}${row('Hordy', st.hordes, B.hordes)}${row('Porazení', st.kills)}${row('Najväčší zásah', st.hit, B.hit)}${row('Spolu damage', Math.round(st.dmg))}</div>
      <p class="sub" style="margin-top:10px">Skóre = damage + 50 × porazení + 200 × hordy + 1000 × prejdené zóny. Odomknuté klávesy ti ostávajú.</p>
      <div class="acts"><button class="btn on" id="again">Nový beh</button><button class="btn ghost" id="toMenu">Menu</button></div>`, 'end');
    el.querySelector('#again').onclick = () => { run = newRun('pokrocily'); persist(); sessionStorage.setItem('mm-skip', '1'); location.reload(); };
    el.querySelector('#toMenu').onclick = () => { run = newRun('pokrocily'); persist(); sessionStorage.setItem('mm-menu', '1'); location.reload(); };
  }, 1600);
}

// ---------- výhra v súboji ----------
function winFight(opts) {
  bottomEl.classList.add('hidden'); fight.on = false;
  const b = act; act = null;
  if (b) { if (!b.camp.dummy) run.w.camps.push(b.camp.id); band = band.filter(f => !b.f.includes(f)); bands = bands.filter(x => x !== b); }
  if (opts.dummy) { tutStep(3); addTutChest(); say('Strašiak padol! Pri ňom sa objavila truhlica.'); renderGoal(); return; }
  if (b && b.camp.key) { run.w.keys++; renderGates(); setTimeout(() => say(`Kľúč od vodcu! ${run.w.keys}/${bossGate().need}`), 900); }
  renderGoal();
  setTimeout(() => heroPlay('Cheer', 0.2, 1.8), 700);
  const n = b ? b.f.length : 3;
  if (opts.boss) {
    const newOp = ['-', '×', '÷'].find(o => !run.ops.includes(o)) || null;   // vodcovia dávajú znamienka v poradí − × ÷
    if (newOp) { run.ops.push(newOp); if (adv()) addToken(run.pack, { t: 'o', v: newOp }); }   // Pokročilý: znamienko rovno do ruksaku
    // Majster: vodca odomkne špeciálny kláves natrvalo – zóna 1 zátvorky ( ), zóna 2 odmocninu √
    const spO = adv() ? nextSpecial(run.pack.unlock) : null, spec = spO && spO.k, specNew = !!spec;
    if (spec) { run.pack.unlock[spec] = true; meta.unlock[spec] = true; }
    run.hearts = maxHearts(); renderHearts(); addCoins(20);
    persist();
    setTimeout(() => {
      const el = overlay('Vodca porazený', `<div style="display:flex;justify-content:center;margin-bottom:6px">${dia('crown', 'big fill')}</div>${newOp ? `<div style="font-size:22px">Získal si nový živel</div><div class="cards">${card(newOp)}</div><p class="sub">Odteraz kúzliš aj ${{ '-': 'odčítaním', '×': 'násobením', '÷': 'delením' }[newOp]}.</p>` : '<div style="font-size:22px">Zóna je hotová.</div>'}${specNew ? `<p class="sub" style="color:var(--line)">Nový kláves na kalkulačke: <b>${spO.key} ${spO.name} – ${spO.text}</b>.</p>` : ''}<div class="acts"><button class="btn on" id="next">Ďalšia zóna ▸</button></div>`, 'end');
      el.querySelector('#next').onclick = () => { closeOverlay(); if (adv() && run.zone === FINAL_ZONE) return victory(); cardOffer('Odmena od vodcu', nextZone); };
    }, 2200);
    return;
  }
  setTimeout(() => addCoins(n * 2 + (opts.elite ? 8 : 0), hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))), 700);
  // Majster: z boja nepadajú čísla (tie sú len na mape) – boj dáva skúsenosti a mince
  persist();
  if (opts.horde) run.st.hordes += opts.horde;
  if (opts.hb) { addCoins(25, hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))); setTimeout(() => say('Vodca hordy porazený! +25 mincí', 3000), 600); }   // funkcie dáva len vodca zóny (sim-energia.mjs)
  if (opts.zb) { // vodca zóny porazený: znamienko + špeciálna funkcia, obchodník, ďalšia zóna (po 8. výhra)
    const newOp = ['-', '×', '÷'].find(o => !run.ops.includes(o)); if (newOp) { run.ops.push(newOp); addToken(run.pack, { t: 'o', v: newOp }); }
    const sp = nextSpecial(run.pack.unlock); if (sp) { run.pack.unlock[sp.k] = true; meta.unlock[sp.k] = true; }
    run.hearts = maxHearts(); renderHearts(); addCoins(20 + run.zone * 10, hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))); persist();
    say(`Vodca zóny porazený! ${newOp ? `Znamienko ${newOp.replace('-', '−')}` : ''}${sp ? ` · nová funkcia ${sp.key}` : ''}`, 4500);
    spawnMerchant(20);
    if (run.zone >= FINAL_ZONE && !run.endless) setTimeout(victory, 2500);
    else setTimeout(() => { run.zone++; persist(); renderGoal(); say(`Zóna ${run.zone} – nepriatelia sú silnejší.`, 3500); }, 3000);
    return;
  }
  if (opts.horde && !b && hordeN % 4 === 0) spawnMerchant(25);   // obchodník občas aj medzi hordami
  if (opts.horde && !b) { if (++hordeWins % 3 === 0) setTimeout(() => cardOffer('Tri hordy porazené', null), 1600); else setTimeout(() => say(`Horda porazená! Ďalšia o ${Math.round(hordeT)} s.`), 900); return; }
  setTimeout(() => cardOffer(opts.elite ? 'Kapitán porazený' : 'Banda porazená', null), 2200);
}
// VÝHRA BEHU (Majster): po 8. vodcovi – skóre, rekord, a môžeš pokračovať do nekonečna
function victory() {
  const st = run.st, score = Math.round(st.dmg + 50 * st.kills + 200 * st.hordes + 1000 * run.zone);
  meta.best.score = Math.max(meta.best.score, score); meta.wins = (meta.wins || 0) + 1; persist();
  const el = overlay('Vyhral si beh!', `<div style="display:flex;justify-content:center;margin-bottom:6px">${dia('crown', 'big fill')}</div>
    <div style="font-size:20px">Veľká Nula je porazená. ${meta.wins === 1 ? 'Prvá výhra!' : `Výhra č. ${meta.wins}.`}</div><div class="bigop">${pix(score)}</div>
    <p class="sub">Teraz začína NEKONEČNO: hordy rastú bez konca a ide sa len o skóre. Tu sa hra dá rozbiť – skladaj šialené vzorce.</p>
    <div class="acts"><button class="btn on" id="inf">Do nekonečna ▸</button><button class="btn ghost" id="toMenu">Ukončiť beh</button></div>`, 'end');
  el.querySelector('#inf').onclick = () => { closeOverlay(); run.endless = true; cardOffer('Odmena za výhru', nextZone); };
  el.querySelector('#toMenu').onclick = () => { closeOverlay(); gameOver(); };
}
function nextZone() {
  run.zone++; run.w = newWorldState(); persist();
  fade(() => { buildRoom(); say(`Zóna ${run.zone}! Nové znamienko: ${run.ops[run.ops.length - 1].replace('-', '−')}`); });
}

// ---------- zámok: vyskladaj číslo z dvoch čísel ----------
let lockOn = false;
function openLock() {
  lockOn = true; lock.a = null; bottomEl.classList.remove('hidden'); bottomEl.classList.add('lockmode');
  renderLock(); say(`Vyskladaj ${lock.n} z dvoch čísel.`);
}
function renderLock(state = '') {
  const a = lock.a ?? '?', b = lock.b ?? '?';
  inpEl.className = state; inpEl.innerHTML = pix(`${a}+${b}=${lock.n}`);
}
function lockPress(k) {
  if (!/^[0-9]$/.test(k)) { if (k === '←') { lock.a = null; lock.b = null; renderLock(); } return; }
  if (lock.a === null) { lock.a = +k; renderLock(); return; }
  lock.b = +k;
  if (lock.a + lock.b === lock.n && lock.a > 0 && lock.b > 0) {
    renderLock('good'); lockOn = false; heroPlay('Spellcast_Shoot', 0.1, 1);
    openGate(lock.gate, `Zámok otvorený! ${lock.a} + ${lock.b} = ${lock.n}`);
    setTimeout(() => { bottomEl.classList.add('hidden'); bottomEl.classList.remove('lockmode'); }, 900);
  } else {
    renderLock('bad'); say(`${lock.a} + ${lock.b} = ${lock.a + lock.b}, nie ${lock.n}. Skús iné čísla.`);
    setTimeout(() => { lock.a = null; lock.b = null; renderLock(); }, 1100);
  }
}

// ---------- ovládanie: ťuk na zem = choď tam ----------
const keys = {};
function press(k) {
  if (paused) return;
  if (fight.on) fightPress(k); else if (lockOn) lockPress(k);
}
['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '←'].forEach(k => {
  const b = document.createElement('button'); b.dataset.k = k; b.innerHTML = pix(k); if (k === '←') b.className = 'del';
  b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); press(k); });
  padEl.appendChild(b);
});
addEventListener('keydown', e => {
  // Kniha kúziel otvorená: kalkulačka ide aj z klávesnice (čísla, + - * /, Backspace, Delete = C, Enter = =)
  if (ovEl.classList.contains('show') && ovEl.classList.contains('pack')) {
    const map = { '*': '×', 'x': '×', '/': '÷', 'Backspace': '⌫', 'Delete': 'C', 'Enter': '=', '?': '□', '(': '( )', ')': '( )', 'r': '√', 'v': '√', '^': 'x²', 'q': 'x²', 'c': 'x³', '!': '!' }, want = map[e.key] || e.key;
    const i = KEYS.findIndex(k => k[0] === want); if (i >= 0) { const b = ovEl.querySelector(`.ck[data-k="${i}"]`); if (b && !b.disabled) b.click(); e.preventDefault(); return; }
  }
  keys[e.key.toLowerCase()] = true;
  const k = /^[0-9]$/.test(e.key) ? e.key : e.key === 'Backspace' ? '←' : null;
  if (e.key === ' ' && fight.on && !paused) { e.preventDefault(); fireAt(null); }
  if (k && (fight.on || lockOn)) { press(k); const b = [...padEl.children].find(x => x.dataset.k === k); if (b) { b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 110); } }
  if (e.key === 'Escape' && paused && !G.over && ovEl.querySelector('#close')) ovEl.querySelector('#close').click();
  else if (e.key === 'Escape' && !paused && !G.over) openPause();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let mouseNdc = null, mouseWorld = null, aimFrame = 0;
// ---------- MOBIL (Majster): joystick ľavým palcom, ťuk vpravo = výstrel tým smerom ----------
const isTouch = matchMedia('(pointer: coarse)').matches; if (isTouch) document.body.classList.add('touch');
const joy = { x: 0, z: 0, id: null };
{
  const J = $('joy'), K = J.querySelector('i');
  const set = e => { const r = J.getBoundingClientRect(), R0 = r.width / 2; let dx = e.clientX - r.left - R0, dy = e.clientY - r.top - R0; const l = Math.hypot(dx, dy); if (l > R0) { dx *= R0 / l; dy *= R0 / l; }
    K.style.transform = `translate(${dx}px, ${dy}px)`; const m = Math.hypot(dx, dy) / R0; joy.x = m > 0.15 ? dx / R0 : 0; joy.z = m > 0.15 ? dy / R0 : 0; };
  J.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); joy.id = e.pointerId; try { J.setPointerCapture(e.pointerId); } catch (_) {} set(e); });
  J.addEventListener('pointermove', e => { if (e.pointerId === joy.id) set(e); });
  const end = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.z = 0; K.style.transform = ''; };
  J.addEventListener('pointerup', end); J.addEventListener('pointercancel', end);
}
$('c').addEventListener('pointermove', e => { mouseNdc = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
let target = null, tapMark = null;
// mobil: pri prvom ťuknutí celá obrazovka a zámok na šírku (Android); iPhone ukáže výzvu „Otoč mobil“
addEventListener('pointerdown', () => { if (matchMedia('(pointer: coarse)').matches && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); }, { once: true });
$('c').addEventListener('pointerdown', e => {
  if (!paused && adv() && !scrOn) { mouseNdc = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera); const gh = ray.intersectObject(place.ground)[0]; fireAtScreen(e.clientX, e.clientY, camera, gh ? gh.point.clone().add(new THREE.Vector3(0, 0.3, 0)) : null); return; }   // Majster: klik = výstrel
  if (paused || fight.on || lockOn || !place.ground) return;
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObject(place.ground)[0];
  if (hit) { target = hit.point.clone(); tapMark = { p: hit.point.clone(), t: 0 }; }
});
$('bBook').innerHTML = icon('book') + '<span>Kniha</span>'; $('bPack').innerHTML = icon('star') + '<span>Ruksak</span>'; $('bPack').style.display = 'none'; $('bMap').style.display = adv() ? 'none' : '';   // Majster: otvorený svet, mapa netreba   // Majster: všetko v Knihe kúziel (kalkulačka + efekty)
$('bPack').onclick = () => { if (!paused) openPack(); }; $('bMap').innerHTML = icon('map') + '<span>Mapa</span>'; $('bPause').innerHTML = icon('pause');
$('bBook').onclick = () => { if (paused) return; if (adv()) openPack(); else if (!fight.on) openBook(); };
$('bMap').onclick = () => { if (!paused && !fight.on) openMap(); };
$('bPause').onclick = () => { if (!paused) openPause(); };
function openPause() {
  const el = overlay('Pauza', `<div class="menu">${menu([['go', 'play', 'Pokračovať'], ['book', 'book', 'Kniha kúziel', fight.on && !adv()], ['map', 'map', 'Mapa', fight.on], ['set', 'gear', 'Nastavenia'], ['menu', 'door', 'Do menu']])}</div><button id="close" hidden></button>`, 'small');
  el.querySelector('#close').onclick = closeOverlay;
  el.querySelectorAll('.row').forEach(r => r.onclick = () => {
    const k = r.dataset.k; closeOverlay();
    if (k === 'book') (adv() ? openPack() : openBook()); else if (k === 'pack') openPack(); else if (k === 'set') openSettings(); else if (k === 'map') openMap(); else if (k === 'menu') showMenu();
  });
}
// kruh v mieste ťuknutia
const tapRing = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8dff98 })); tapRing.visible = false; scene.add(tapRing);

// ---------- prechod (rozpad do bodiek) ----------
let fadeT = 0, fadeCb = null;
function fade(cb) { fadeT = 0.0001; fadeCb = cb; }

// ---------- slučka ----------
const vel = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let viewZoom = 5.2, glintT = 0;
function update(dt, t) {
  G.now = t; U.time.value = t;
  // pohyb
  const dir = new THREE.Vector3((keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), 0, (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0));
  if (joy.x || joy.z) { dir.x += joy.x; dir.z += joy.z; }   // mobilný joystick
  if (dir.lengthSq()) target = null;
  else if (target) { dir.subVectors(target, hero.position).setY(0); if (dir.length() < 0.15) { target = null; dir.set(0, 0, 0); } }
  if (dir.lengthSq()) dir.normalize();
  if ((fight.on && !adv()) || paused || lockOn || fadeT > 0 || G.over || (heroLocked() && !adv())) { dir.set(0, 0, 0); if (fight.on || G.over) target = null; }   // Majster sa hýbe aj v boji
  vel.lerp(dir.multiplyScalar(3.4), 1 - Math.exp(-dt * 8));
  const nx = hero.position.x + vel.x * dt, nz = hero.position.z + vel.z * dt;
  // OBCHÁDZANIE: do skaly/stromu sa nevojde, ale po jeho okraji sa skĺzne (vytlačenie z kruhu po normále), takže sa dá prejsť okolo
  const HR = 0.28, slide = (x, z) => { for (let it = 0; it < 3; it++) for (const b of place.blockers) { const dx = x - b.x, dz = z - b.z, rr = b.r + HR; if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue; const d = Math.hypot(dx, dz); if (d < rr && d > 1e-4) { x = b.x + dx / d * rr; z = b.z + dz / d * rr; } } return [x, z]; };
  const ok = (x, z) => place.inside(x, z) && (inside || !gateBlocks(x, z));
  let [sx, sz] = slide(nx, nz);
  if (ok(sx, sz)) { hero.position.x = sx; hero.position.z = sz; }
  else if (ok(...slide(nx, hero.position.z))) [hero.position.x, hero.position.z] = slide(nx, hero.position.z);
  else if (ok(...slide(hero.position.x, nz))) [hero.position.x, hero.position.z] = slide(hero.position.x, nz);
  else { vel.multiplyScalar(0.3); target = null; }
  hero.position.y = place.height(hero.position.x, hero.position.z);
  const speed = vel.length();
  // Majster: kúzelník sa otáča za myšou a mieri palicou (ruka sa vystrie podľa vzdialenosti myši)
  if (adv() && !scrOn && mouseNdc && !paused && (++aimFrame % 2 === 0)) { ray.setFromCamera(mouseNdc, camera); const h = place.ground && ray.intersectObject(place.ground)[0]; mouseWorld = h ? h.point : mouseWorld; }
  hero.userData.aimMouse = adv() && !scrOn && !inside ? mouseWorld : null; aim.p = hero.userData.aimMouse;
  const aimP = aimPoint() || hero.userData.aimMouse;
  const want = aimP ? Math.atan2(aimP.x - hero.position.x, aimP.z - hero.position.z) : speed > 0.2 ? Math.atan2(vel.x, vel.z) : fight.on && fight.enemies[0] ? Math.atan2(fight.enemies[0].g.position.x - hero.position.x, fight.enemies[0].g.position.z - hero.position.z) : hero.rotation.y;
  let dr = want - hero.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); hero.rotation.y += dr * (1 - Math.exp(-dt * 10));
  updateHero(dt, speed, fight.on);
  U.hero.value.copy(hero.position);

  if (!paused && (fight.on || fight.enemies.length || adv())) updateFight(dt);
  if (R && !scrOn) updateHordes(dt);
  if (adv() && lvlQueue > 0 && !paused && !scrOn && !G.over) openLevelUp();
  if (adv() && R && !paused) { updateGems(dt); updateDrops(dt); updateMerchant(dt); }
  hudba(scrOn ? 'uvod' : fight.on ? ((act && act.camp.boss) || fight.hb ? 'boss' : 'suboj') : 'svet');   // hudba podľa situácie (prelína sa)   // Majster: kúzla letia aj mimo súboja
  if (!fight.on) for (const f of band) if (f.state !== 'dead' && !fight.enemies.includes(f)) f.mixer.update(dt);
  if (innkeeper && inside) innkeeper.mixer.update(dt);
  if (!inside && R) updateRoom(dt, t); else if (inside) updateInside();
  updateParticles(dt); if (R && room) updateFires(t);
  if (scrOn && R && !inside) introCast(dt);
  if (modeOn) modeTick(dt);
  if (tapMark) { tapMark.t += dt; tapRing.visible = tapMark.t < 0.5 && !fight.on; tapRing.position.copy(tapMark.p).setY(tapMark.p.y + 0.05); tapRing.scale.setScalar(1 + tapMark.t * 1.5); }
  shakeV = Math.max(0, shakeV - dt * 1.6); hurtV = Math.max(0, hurtV - dt * 1.2);
  kresbaMat.uniforms.uHurt.value = Math.max(G.danger && fight.on ? 0.45 : 0, hurtV);
  if (fadeT > 0) { fadeT += dt * 2; if (fadeT >= 1 && fadeCb) { const cb = fadeCb; fadeCb = null; cb(); snapCam = true; } if (fadeT >= 2) fadeT = 0; }
  kresbaMat.uniforms.uFade.value = fadeT > 0 ? (fadeT < 1 ? fadeT : 2 - fadeT) : 0;
}
function updateRoom(dt, t) {
  const hp = hero.position, busy = paused || fight.on || lockOn || fadeT > 0 || G.over;
  // brány
  for (const gt of gates) { const g = gt.obj.userData; g.open += ((gt.open ? 1 : 0) - g.open) * (1 - Math.exp(-dt * 3)); g.barrier.material.opacity = 0.55 * (1 - g.open) + Math.sin(t * 3.3) * 0.08 * (1 - g.open); g.barrier.visible = g.open < 0.97; }
  if (busy) return;
  tutTick();
  // objavené oblasti (mapa)
  const ar = R.areaAt(hp.x, hp.z); if (!run.w.seen.includes(ar.id)) { run.w.seen.push(ar.id); persist(); }
  // banda si ťa všimne
  for (const b of bands) {
    const c = b.camp;
    if (fight.on && adv()) continue;   // počas boja sa ďalšia banda pridá cez hordu, nie novým súbojom
    if (Math.hypot(c.x - hp.x, c.z - hp.z) < (c.boss ? 8.5 : c.dummy ? 3.6 : adv() ? 14 : 6.5)) {
      if (adv() && !workingRows(run).length) { if (G.now - (b.warn ?? -9) > 5) { b.warn = G.now; say('Najprv poskladaj kúzlo v Knihe kúziel!'); openPack(); } return; }
      const trait = c.boss && adv() ? bossOf(run.zone, run.seed) : null;
      act = b; startFight(b.f, { boss: c.boss, elite: c.elite, dummy: c.dummy, trait });
      if (trait) { say(`${BOSSES[trait].name}: ${BOSSES[trait].hint}`, 5000); }
      bottomEl.classList.remove('hidden', 'lockmode'); target = null;
      say(c.boss ? (adv() ? 'Vodca zbojníkov! Klikaj a strieľaj.' : 'Vodca zbojníkov! Počítaj a kúzli.') : adv() ? 'Banda! Klikni na nepriateľa – vystrelíš kúzlo z Knihy.' : 'Banda! Napíš výsledok – kúzlo letí k tomu, komu patrí.', 3000);
      return;
    }
  }
  // brána vodcu: otvorí sa, keď máš všetky kľúče
  for (const g of gates) if (!g.open && Math.hypot(g.x - hp.x, g.z - hp.z) < 3.6) {
    if (g.kind === 'boss') {
      if (run.w.keys >= g.need) openGate(g, 'Brána sa otvára. Vodca čaká…');
      else if (G.now - g.warned > 6) { g.warned = G.now; say(`Brána vodcu potrebuje ${g.need} kľúčov. Máš ${run.w.keys}.`); }
    } else if (!lockOn) { lock = { n: g.n, a: null, gate: g }; openLock(); }
  }
  if (lockOn && lock && Math.hypot(lock.gate.x - hp.x, lock.gate.z - hp.z) > 4.5) { lockOn = false; bottomEl.classList.add('hidden'); }
  // truhlice
  for (const c of chests) if (!c.open && hp.distanceTo(c.obj.position) < 1.5) {
    c.open = true; if (c.n !== 'tut') run.w.chests.push(c.id); persist(); heroPlay('Interact', 0.1, 0.8); efekt('truhla', 0.7);
    if (c.obj.userData.lid) c.anim = 0;
    burst(c.obj.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 80, 3, 0xffd25a);
    if (c.n === 'tut') { addToken(run.pack, { t: 'n', v: 2 }); persist(); floatText(pix('2'), c.obj.position.clone().add(new THREE.Vector3(0, 2, 0)), 'coin'); say('Nový kláves: 2!'); tutStep(4); continue; }
    if (adv() && c.n === 0) setTimeout(() => giveLoot(c.obj.position.clone().add(new THREE.Vector3(0, 2, 0)), 0), 500);   // truhlica na mape = číslo / znamienko
    if (c.n === 0) setTimeout(() => addCoins(4 + Math.floor(Math.random() * 4), c.obj.position.clone().add(new THREE.Vector3(0, 1.5, 0))), 400);
    else setTimeout(() => cardOffer('Truhlica!', null), 700);
  }
  for (const c of chests) if (c.anim !== undefined && c.anim < 1) { c.anim = Math.min(1, c.anim + dt * 2.5); c.obj.userData.lid.rotation.x = -c.anim * 1.6; }
  // runa „do 10“
  for (const r of runes) {
    const u = r.obj.userData;
    if (!r.done) { u.stone.rotation.y = Math.sin(t * 1.2) * 0.25; u.stone.position.y = 0.95 + Math.sin(t * 2) * 0.06; u.light.intensity = 2.5 + Math.sin(t * 4); if (Math.random() < 0.15) spark(r.obj.position.clone().add(new THREE.Vector3(Math.random() - 0.5, 0.4, Math.random() - 0.5)), 0, 1.2, 0, 1, 0xffd25a); }
    if (!r.done && hp.distanceTo(r.obj.position) < 1.6) {
      r.done = true; run.w.runes.push(r.id); run.range = Math.max(run.range, r.n); persist(); heroPlay('Cheer', 0.2, 1.6);
      burst(r.obj.position.clone().add(new THREE.Vector3(0, 1, 0)), 160, 4, 0xffd25a); u.halo.visible = false; u.light.intensity = 0;
      setTimeout(() => overlay('Runa čísel', `<div class="bigop">${pix('10')}</div><p class="sub">Odteraz počítaš až do <b>10</b>. Príklady budú väčšie – a kúzla silnejšie.</p><div class="acts"><button class="btn on" id="close">Super</button></div>`, 'end').querySelector('#close').onclick = closeOverlay, 700);
    }
  }
  // kríky v pokladovej miestnosti: niečo sa v nich trblieta
  glintT -= dt;
  if (glintT <= 0) { glintT = 1.6; for (const b of bushes) if (!b.searched) burst(new THREE.Vector3(b.x + (Math.random() - 0.5), R.height(b.x, b.z) + 1 + Math.random() * 0.6, b.z + (Math.random() - 0.5)), 8, 1, 0xffd25a, 0.8); }
  for (const b of bushes) if (!b.searched && Math.hypot(b.x - hp.x, b.z - hp.z) < 1.7) {
    b.searched = true; run.w.bushes.push(b.id); persist(); heroPlay('Interact', 0.1, 0.8);
    const p = new THREE.Vector3(b.x, R.height(b.x, b.z) + 1.2, b.z);
    burst(p, 50, 2.5, 0x6f6c66, 0.6);
    if (b.key) {
      run.w.keys++; persist(); renderGates(); renderGoal(); say(`Kľúč v kríku! ${run.w.keys}/${bossGate().need}`);
      if (RAW.key) { const k = RAW.key.clone(true); k.scale.setScalar(1.6); k.position.copy(p); room.add(k); b.keyObj = k; b.kt = 0; }
      burst(p, 140, 4, 0xffd25a);
    } else if (adv() && Math.random() < 0.45) giveLoot(p.clone().add(new THREE.Vector3(0, 0.8, 0)));
    else if (Math.random() < 0.6) addCoins(2, p.clone().add(new THREE.Vector3(0, 0.8, 0)));
    else floatText('Nič…', p);
  }
  for (const b of bushes) if (b.keyObj) { b.kt += dt; b.keyObj.position.y = R.height(b.x, b.z) + 1.2 + Math.min(1.4, b.kt * 1.5); b.keyObj.rotation.y += dt * 3; if (b.kt > 1.8) { room.remove(b.keyObj); b.keyObj = null; } }
  // obchod
  // čísla na mape: dotkni sa kameňa = nový kláves s tým číslom
  for (const n of numStones) if (!n.got) {
    n.st.rotation.y = Math.sin(t * 1.4 + n.id) * 0.4; n.st.position.y = 0.75 + Math.sin(t * 2 + n.id) * 0.06;
    if (Math.hypot(n.x - hp.x, n.z - hp.z) < 1.1) {
      n.got = true; run.w.nums = run.w.nums || []; run.w.nums.push(n.id); addToken(run.pack, { t: 'n', v: n.v }); persist();
      burst(n.obj.position.clone().add(new THREE.Vector3(0, 1, 0)), 90, 3, 0xffd25a); floatText(pix(String(n.v)), n.obj.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 'coin');
      say(`Nový kláves: ${n.v}!`); room.remove(n.obj); efekt('objav', 0.5, 1.2);
    }
  }
  // obchod = samostatná obrazovka (nie 3D miestnosť): pri dverách sa otvorí, po odchode stojíš pred dverami
  if (R.building) { const dd = Math.hypot(R.building.door[0] - hp.x, R.building.door[1] - hp.z); if (dd < 1.3 && !shopNear) { shopNear = true; target = null; vel.set(0, 0, 0); openShop(); } if (dd > 2.4) shopNear = false; }
}
// ---------- HORDY (Majster, roguelite): svetom chodia skupiny, ktoré ťa zacítia a idú po tebe; čím ďalej, tým väčšie ----------
// veľkosť n = 2 + ⌊0,8 · vlna⌋ + (zóna − 1), najviac 12; interval = max(16, 38 − 2 · vlna) s; druhy podľa obtiažnosti d = zóna − 1 + vlna / 8
let hordeT = 8, hordeN = 0, hordeWins = 0;   // prvá horda hneď na začiatku
const HPZ = 10;   // hôrd v zóne (10. = vodca zóny)
const HW = d => ({ rogue: 1, hooded: Math.min(0.8, Math.max(0, d - 0.15) * 1.8), knight: 0.25 + Math.min(1, d) * 0.5, barbarian: Math.min(0.7, Math.max(0, d - 0.6) * 1.0) });
function updateHordes(dt) {
  if (!adv() || inside || G.over || tutOn() || paused || fadeT > 0) return;
  hordeT -= dt; if (hordeT > 0) return;
  hordeN++;
  // ZÓNA = 10 hôrd: 5. má vodcu hordy, 10. vodcu zóny (jeden z 8 s matematickou vlastnosťou); w = poradie hordy v zóne
  const wz = (hordeN - 1) % HPZ + 1, zoneBoss = wz === HPZ, boss = wz === 5 || zoneBoss;
  hordeT = hordeInterval(wz) + (zoneBoss ? 12 : 0);
  const n = zoneBoss ? Math.max(3, hordeSize(wz, run.zone) - 3) : hordeSize(wz, run.zone), w = kindWeights(wz, run.zone), sum = Object.values(w).reduce((a, b) => a + b, 0);
  const roll = () => { let r = Math.random() * sum; for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k; return 'rogue'; };
  // miesto 13–16 m od čarodejníka, kde sa dá stáť (nie v pevnosti vodcu)
  let at = null;
  for (let k = 0; k < 40 && !at; k++) { const a = Math.random() * 6.28, r = 11 + Math.random() * 3, x = hero.position.x + Math.cos(a) * r, z = hero.position.z + Math.sin(a) * r; if (R.inside(x, z) && R.areaAt(x, z).id !== R.bossArea) at = [x, z]; }
  if (!at) return;
  const fs = [];
  for (let i = 0; i < n; i++) {
    const hb = boss && i === 0, f = makeFighter(hb ? 'barbarian' : roll(), hb ? (zoneBoss ? 1.8 : 1.5) : 1, room), x = at[0] + (Math.random() - 0.5) * 3, z = at[1] + (Math.random() - 0.5) * 3;
    f.hb = hb; if (hb && zoneBoss) { f.trait = bossOf(run.zone, run.seed); f.zb = true; }
    f.g.position.set(x, R.height(x, z), z); f.play(f.d.walk); fs.push(f); band.push(f);
  }
  joinFight(fs, { horde: 1, hb: boss && !zoneBoss ? 1 : 0, zb: zoneBoss ? 1 : 0 }); bottomEl.classList.remove('hidden', 'lockmode');
  if (zoneBoss) say(`VODCA ZÓNY: ${BOSSES[fs[0].trait].name} – ${BOSSES[fs[0].trait].hint}`, 5000);
  else say(boss ? `Horda ${hordeN} s VODCOM HORDY! (${n})` : `Horda ${hordeN} prichádza! (${n})`, 2800);
  renderGoal();
}
// ---------- SKÚSENOSTI A ÚROVNE (Majster): XP za zabitie = ⌈HP/3⌉, ďalšia úroveň = ⌈12 · 1,45^(L−1)⌉ → výber 1 z 3 ----------
let lvlQueue = 0;
// KRYŠTÁLY SKÚSENOSTÍ (ako v hordových hrách): padnú z nepriateľa, magnet ich pritiahne, keď prejdeš blízko
const gems = [], gemGeo = new THREE.OctahedronGeometry(0.13, 0), gemMat = new THREE.MeshBasicMaterial({ color: 0x8dff98 });
function dropGems(p, xp) {
  if (!adv()) return;
  const n = Math.min(6, Math.max(1, Math.round(Math.log2(xp + 1))));   // väčší nepriateľ = viac kryštálov
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(gemGeo, gemMat); m.layers.enable(4); const a = Math.random() * 6.28, r = 0.3 + Math.random() * 0.9; m.position.set(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r); m.position.y = R.height(m.position.x, m.position.z) + 0.35; room.add(m); gems.push({ m, xp: xp / n, t: 0 }); }
}
function updateGems(dt) {
  const mag = 2.2 + (run.magnet || 0) * 1.3, hp = hero.position;
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i]; g.t += dt; g.m.rotation.y += dt * 3;
    const d = Math.hypot(g.m.position.x - hp.x, g.m.position.z - hp.z);
    if (d < mag || g.pull) { g.pull = true; const k = Math.min(1, dt * (6 + g.t * 4)); g.m.position.x += (hp.x - g.m.position.x) * k; g.m.position.z += (hp.z - g.m.position.z) * k; g.m.position.y += (hp.y + 1 - g.m.position.y) * k; }
    if (d < 0.5) { room.remove(g.m); gems.splice(i, 1); addXp(g.xp); efekt('minca', 0.2, 1.7 + Math.random() * 0.3); spark(g.m.position, 0, 1.5, 0, 0.4, 0x8dff98); }
  }
}
function addXp(n, e) {
  if (!adv()) return;
  run.xp = (run.xp || 0) + n; run.lvl = run.lvl || 1; run.xp = Math.round(run.xp * 10) / 10;
  while (run.xp >= xpNeed(run.lvl)) { run.xp -= xpNeed(run.lvl); run.lvl++; lvlQueue++; }
  renderXp();
}
function renderXp() {
  const el = $('xp'); if (!el) return; el.style.display = adv() ? '' : 'none'; if (!adv()) return;
  const L = run.lvl || 1; el.innerHTML = `<span>úr. ${L}</span><i><b style="width:${Math.round((run.xp || 0) / xpNeed(L) * 100)}%"></b></i>`;
}
function openLevelUp() {
  lvlQueue--; efekt('objav', 0.7);
  // ponuka: 3 veci do kalkulačky ALEBO 3 karty (balance.js levelOffers – vzácnosť silných vecí podľa úrovne)
  const cards = offer(run, Math.random, 6).map(id => ({ id, name: CARDS[id].name, text: CARDS[id].text(lvl(run, id) + 1) }));
  const pack = levelOffers(run.lvl, run, Math.random, cards), offers = pack.items;
  // obrázok: karta → zdroj/karty/<id>.jpg, kláves → veľký znak z pixelového písma; rám a štítok podľa vzácnosti
  const KEYLAB = { p: '( )', s: '√', q: 'x²', c: 'x³', f: '!' };
  const art = o => { const g = o.give; if (g.t === 'card') return `<div class="lvart"><img src="../zdroj/karty/${g.id}.jpg" alt="" onerror="this.remove()"></div>`;
    const k = g.t === 'n' ? String(g.v) : g.t === 'o' ? g.v : g.t === 'spec' ? KEYLAB[g.k] : null; return k ? `<div class="lvart key">${pix(k)}</div>` : `<div class="lvart"><img src="../zdroj/karty/${g.t === 'heart' ? 'srdce' : g.t}.jpg" alt="" onerror="this.remove()"></div>`; };
  const el = overlay(`Úroveň ${run.lvl - lvlQueue}`, `<p class="sub">Vyber si kartu alebo kláves do kalkulačky.</p>
    <div class="lvopts">${offers.map((o, i) => `<button class="lvo panel r-${o.rar}" data-i="${i}" style="--rc:${RARITY[o.rar].col}"><em class="rar">${RARITY[o.rar].name}</em>${art(o)}<b>${o.title}</b><span>${o.text}</span></button>`).join('')}</div>`, 'small lvup');
  el.querySelectorAll('.lvo').forEach(b => b.onclick = () => {
    const o = offers[+b.dataset.i], g = o.give;
    if (g.t === 'staff') run.pack.staff++;
    else if (g.t === 'star') { run.pack.stars = run.pack.stars || {}; run.pack.stars[g.v] = (run.pack.stars[g.v] || 0) + 1; }
    else if (g.t === 'magnet') run.magnet = (run.magnet || 0) + 1;
    else if (g.t === 'heart') { run.maxH = (run.maxH || 0) + 1; run.hearts++; renderHearts(); }
    else if (g.t === 'spec') { run.pack.unlock[g.k] = true; meta.unlock[g.k] = true; }
    else if (g.t === 'card') { closeOverlay(); addCard(g.id); return; }
    else { for (let k = 0; k < (o.n || 1); k++) addToken(run.pack, g); if (g.t === 'n') mergeNumbers(g.v); }
    persist(); closeOverlay(); say(`${o.title}!`);
  });
}
// PALICE (obchod): každá mení pravidlo streľby – zo vzorcov v suboj.js (cd = nabíjanie, dmg = damage, shots = počet cieľov)
const STAFFS = STAFF_MODELS;   // modely kalkulačky: displej, energia, dobíjanie (balance.js)
G.staffs = STAFFS;
// ---------- OBCHODNÍK (Majster): objaví sa pri tebe po vodcovi a každú 4. hordu, ostane chvíľu; predáva palice a vylepšenia ----------
let merchant = null;
function spawnMerchant(sec) {
  if (!adv() || merchant) return;
  let at = null; for (let k = 0; k < 30 && !at; k++) { const a = Math.random() * 6.28, r = 4 + Math.random() * 2, x = hero.position.x + Math.cos(a) * r, z = hero.position.z + Math.sin(a) * r; if (R.inside(x, z)) at = [x, z]; }
  if (!at) return;
  const f = makeFighter('innkeeper', 1, room); f.g.position.set(at[0], R.height(...at), at[1]); f.play('Idle');
  merchant = { f, t: sec, lab: label(icon('mug') + ' Obchodník', new THREE.Vector3(at[0], 2.6, at[1]), 'shop'), near: false };
  say(`Obchodník je tu na ${sec} s – choď k nemu.`, 3000); efekt('objav', 0.5, 0.8);
}
function updateMerchant(dt) {
  if (!merchant) return;
  const m = merchant, p = m.f.g.position; m.f.mixer.update(dt); m.t -= dt;
  m.f.g.rotation.y = Math.atan2(hero.position.x - p.x, hero.position.z - p.z);
  const d = Math.hypot(hero.position.x - p.x, hero.position.z - p.z);
  if (d < 1.6 && !m.near && !paused) { m.near = true; openShop(); } if (d > 2.6) m.near = false;
  if (m.t <= 0 && !paused) { room.remove(m.f.g); m.lab.el.remove(); labels = labels.filter(l => l !== m.lab); merchant = null; say('Obchodník odišiel.'); }
}
// ---------- PADAJÚCE ČÍSLA (Majster): z nepriateľov padajú čísla; 3 rovnaké sa samy spoja do vylepšeného klávesu (3× 4 → 4★) ----------
const drops = [];
function dropLoot(e) {
  if (!adv()) return;
  const p = e.g.position, big = e.trait || e.hb || e.name === 'Kapitán';
  const chance = big ? 1 : 0.3;   // každý tretí nepriateľ niečo pustí
  if (Math.random() > chance) return;
  const top = Math.min(9, 2 + run.zone + Math.floor(hordeN / 4)), v = 1 + Math.floor(Math.pow(Math.random(), 1.6) * top);   // malé častejšie
  const give = big && Math.random() < 0.5 ? { t: 'o', v: run.ops[Math.floor(Math.random() * run.ops.length)] } : { t: 'n', v };   // vodcovia a kapitáni púšťajú aj znamienka
  const side = std(0xc8c4ba), g = new THREE.Group();
  const st = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.12), [side, side, side, side, new THREE.MeshStandardMaterial({ map: digitTexture(String(give.v)), roughness: 0.9 }), side]); st.position.y = 0.5; g.add(st);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: give.t === 'o' ? 0xff5a22 : 0xffd25a })); halo.position.y = 0.05; halo.layers.enable(4); g.add(halo);
  g.position.set(p.x, R.height(p.x, p.z), p.z); room.add(g); drops.push({ g, st, give, t: 0 });
}
function updateDrops(dt) {
  const hp = hero.position, mag = 1.6 + (run.magnet || 0) * 0.8;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.t += dt; d.st.rotation.y += dt * 2;
    const dist = Math.hypot(d.g.position.x - hp.x, d.g.position.z - hp.z);
    if (dist < mag) { const k = Math.min(1, dt * 7); d.g.position.x += (hp.x - d.g.position.x) * k; d.g.position.z += (hp.z - d.g.position.z) * k; }
    if (dist < 0.6) {
      room.remove(d.g); drops.splice(i, 1); addToken(run.pack, d.give); efekt('objav', 0.4, 1.3);
      floatText(pix(String(d.give.v)), hp.clone().add(new THREE.Vector3(0, 2.4, 0)), 'coin');
      if (d.give.t === 'n') mergeNumbers(d.give.v); persist();
    }
  }
}
function mergeNumbers(v) {
  const P = run.pack, used = allIds(P), same = P.inv.filter(t => t.t === 'n' && t.v === v && !used.has(t.id));
  if (same.length < 3 || ((P.stars || {})[v] || 0) >= MAX_STARS) return;
  const del = new Set(same.slice(0, 3).map(t => t.id)); P.inv = P.inv.filter(t => !del.has(t.id));
  P.stars = P.stars || {}; P.stars[v] = (P.stars[v] || 0) + 1;
  say(`3× ${v} → kláves ${v}${'★'.repeat(P.stars[v])} (ráta sa ako ${v * (P.stars[v] + 1)})`, 3500); efekt('objav', 0.7, 1.5);
}
function updateInside() {
  if (paused || fadeT > 0) return;
  const hp = hero.position;
  const d = Math.hypot(IX - 0.6 - hp.x, -1.2 - hp.z);
  if (d < 1.8 && !shopNear) { shopNear = true; target = null; openShop(); }
  if (d > 2.6) shopNear = false;
  if (Math.abs(IX - hp.x) < 1.3 && hp.z > 4.0) exitInterior();
}
let snapCam = true;
const ZOOM_OUT = 1.25;   // Majster: kamera o 25 % ďalej – hordu vidno skôr (postavy ostávajú v pomere k svetu)
function draw(dt) {
  // kamera: pri skúmaní ide za čarodejníkom (drží sa v miestnosti), v súboji ukáže celé bojisko
  let look, view;
  if (inside) { look = new THREE.Vector3(IX, 0.6, 0.4); view = 4.9; }
  else if (act && (fight.on || fight.enemies.length)) {
    const c = act.camp; look = hero.position.clone().lerp(new THREE.Vector3(c.x, 0, c.z), 0.5); look.y = hero.position.y + 0.6; view = c.boss ? 6.0 : 5.2;   // súboj bližšie
  } else {
    const hw = viewZoom * innerWidth / innerHeight;
    look = new THREE.Vector3(Math.min(Math.max(hero.position.x, hw - 2), R.W - hw + 2), hero.position.y + 0.9, Math.min(Math.max(hero.position.z, 3), R.H - 3)); view = 5.2;
  }
  if (adv() && !inside) view *= ZOOM_OUT;
  if (scrOn && !inside && R) { const hw = viewZoom * innerWidth / innerHeight; look = hero.position.clone().add(new THREE.Vector3(modeOn ? (dnT - 0.5) * 1.6 : hw * 0.42, 0.9, 0.6)); view = 4.4; }
  const kc = snapCam ? 1 : 1 - Math.exp(-dt * 2.6); snapCam = false;
  camLook.lerp(look, kc); if (!Number.isFinite(camLook.x + camLook.y + camLook.z)) camLook.copy(look);
  if (Math.abs(viewZoom - view) > 0.001) { viewZoom += (view - viewZoom) * kc; setView(viewZoom); }
  const sh = new THREE.Vector3((Math.random() - 0.5) * shakeV * 0.5, (Math.random() - 0.5) * shakeV * 0.5, 0);
  camPos.copy(camLook).add(new THREE.Vector3(0, 12.1, 17));
  camera.position.copy(camPos).add(sh); camera.lookAt(camLook.clone().add(sh));
  sun.position.set(hero.position.x - 15, hero.position.y + 10, hero.position.z + 8); sun.target.position.copy(hero.position);
  const hv = hero.position.clone().add(new THREE.Vector3(0, 1, 0)).project(camera);
  // žiara palice na obrazovke (kryštál), v noci silnejšia, pulzuje
  const cv = crystalLight.position.clone().project(camera), gU = kresbaMat.uniforms;   // žiara z kryštálu pod klobúkom
  gU.uGlow.value.set((cv.x + 1) / 2, (cv.y + 1) / 2, 0.035 + dnT * 0.055, inside ? 0.25 : 0.35 + dnT * (0.2 + Math.sin(simT * 2.3) * 0.08) + (fight.on ? fight.streak * 0.05 : 0)); gU.uGlowC.value.set(crystalLight.color);
  kresbaBlur.uniforms.uBand.value = fight.on ? 0.3 : 0.22;
  drawTags(camera);
  for (const l of labels) { const v = l.pos.clone().project(camera); l.el.style.transform = `translate(${(v.x + 1) / 2 * innerWidth}px, ${(1 - v.y) / 2 * innerHeight}px) translate(-50%, -100%)`; }
  $('streak').classList.toggle('hidden', !fight.on);
  renderKresba((hv.y + 1) / 2, hero.position);
}

// ---------- živé intro: čarodejník dookola zosiela 4 živly (ako v predlohe) ----------
const IOPS = ['+', '-', '×', '÷'], ICOL = { '+': 0xc8923a, '-': 0x4fa8ff, '×': 0xff5a22, '÷': 0x7fe8d8 }, IGLY = { '+': 3, '-': 2, '×': 4, '÷': 5 };
let iT = 0.6, iN = 0, iOrb = null, iMouse = null;
// kúzlo letí tam, kde je myš (bod na zemi pod kurzorom)
for (const id of ['introScr', 'menuScr', 'modeScr']) $(id).addEventListener('pointermove', e => { iMouse = [e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1]; });
const iRay = new THREE.Raycaster();
function introAim() {
  if (!iMouse || !place.ground) return null;
  iRay.setFromCamera(new THREE.Vector2(...iMouse), camera); const h = iRay.intersectObject(place.ground)[0];
  return h ? h.point.clone().add(new THREE.Vector3(0, 0.9, 0)) : null;
}
function introCast(dt) {
  const aimP = introAim();
  const want = aimP ? Math.atan2(aimP.x - hero.position.x, aimP.z - hero.position.z) : Math.PI / 2 - 0.45;   // natočí sa za myšou
  let dr = want - hero.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); hero.rotation.y += dr * Math.min(1, dt * 8);
  iT -= dt;
  const op = IOPS[iN % 4], col = ICOL[op], cw = crystal.getWorldPosition(new THREE.Vector3());
  if (iOrb) {
    iOrb.t += dt; const k = Math.min(1, iOrb.t / 0.55), e = k * k * (3 - 2 * k);
    const prev = iOrb.m.position.clone(); iOrb.m.position.lerpVectors(iOrb.from, iOrb.to, e); iOrb.m.position.y += Math.sin(e * Math.PI) * 1.4; iOrb.m.scale.setScalar(1.25); animShape(iOrb.m, iOrb.t, iOrb.m.position.clone().sub(prev));
    for (let n = 0; n < 4; n++) spark(iOrb.m.position, (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5), 0.5, iOrb.col);
    if (k >= 1) { // dopad: každý živel inak (zem kamene hore, voda vlna, oheň výbuch, vzduch vír)
      const p = iOrb.to, o = iOrb.op;
      if (o === '+') for (let n = 0; n < 110; n++) { const a = Math.random() * 6.28, r = Math.random() * 1.6; spark(p.clone().add(new THREE.Vector3(Math.cos(a) * r, -0.9, Math.sin(a) * r)), Math.cos(a) * 0.6, 1.5 + Math.random() * 2.5, Math.sin(a) * 0.6, 0.9, Math.random() < 0.6 ? 0xc8923a : 0x8a6a3a); }
      else if (o === '-') { burst(p, 140, 3, 0x4fa8ff, 1.2); burst(p, 60, 1.5, 0xd8f0ff, 1.4); }
      else if (o === '×') { burst(p, 240, 5.5, 0xff5a22); burst(p, 90, 3, 0xffd25a, 1.1); }
      else for (let n = 0; n < 130; n++) { const a = Math.random() * 6.28, r = 0.3 + Math.random() * 1.3; spark(p.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.random() * 1.2 - 0.4, Math.sin(a) * r)), -Math.sin(a) * 4, 0.5, Math.cos(a) * 4, 0.7, Math.random() < 0.5 ? 0x7fe8d8 : 0xffffff); }
      scene.remove(iOrb.m); iOrb = null; iN++;
    }
  } else if (iT <= 0) {
    iT = aimP ? 0.9 : 1.5; heroPlay('Spellcast_Shoot', 0.08, 0.9); kresbaMat.uniforms.uSpellG.value = IGLY[op];
    crystalLight.color.set(col); crystal.material.color.set(col);
    const m = elementShape(op, col); scene.add(m);
    const to = aimP && aimP.distanceTo(hero.position) > 1.5 ? aimP : hero.position.clone().add(new THREE.Vector3(4.5 + Math.random() * 2, 1.1, -1.2 + Math.random() * 2.4));
    iOrb = { m, t: 0, from: cw.clone(), to, col, op };   // z kryštálu palice
  } else if (Math.random() < 0.5) { const a = Math.random() * 6.28; spark(cw.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5)), -Math.cos(a), 0.4, -Math.sin(a), 0.4, col); }
}

// ---------- intro a hlavné menu ----------
let scrOn = true, loaded = false, introStage = 0;
document.body.classList.add('scron');   // HUD skrytý počas intra a menu
paused = true;
const STORY = ['Zbojníci ukradli z kráľovstva všetky čísla.', 'Bez čísel nefunguje žiadne kúzlo. Ani jedno.', 'Si posledný čarodejník, ktorý ešte vie počítať.'];
function renderIntro() {
  const inEl = $('introIn');
  if (introStage === 0) inEl.innerHTML = `<div class="signs">${['+', '-', '×', '÷'].map(o => `<span class="panel">${pix(o)}</span>`).join('')}</div><div class="logo">MATHEMAGIC</div><div class="claim">Kúzla, ktoré počítajú</div>
    ${loaded ? '<div class="panel thin tap"><span class="blink">Ťukni a začni</span></div>' : ''}`;
  else inEl.innerHTML = `<div class="panel story"><span class="ptag">Kapitola ${run.zone}</span>${STORY[introStage - 1]}<div class="dots">${STORY.map((_, i) => `<i class="${i === introStage - 1 ? 'on' : ''}"></i>`).join('')}</div><div class="next blink">${introStage === STORY.length ? 'Poďme ▸' : 'Ďalej ▸'}</div></div>`;
}
$('introScr').addEventListener('pointerdown', e => {
  e.stopPropagation(); if (!loaded) return;
  if (introStage === 0 && meta.intro) { $('introScr').classList.add('hide'); return showMenu(); }
  introStage++;
  if (introStage > STORY.length) { meta.intro = 1; persist(); $('introScr').classList.add('hide'); return showMenu(); }
  renderIntro();
});
const ZONE_NAMES = ['Les zbojníkov', 'Zasnežené hory', 'Púšť', 'Sopka'];
function showMenu() {
  scrOn = true; paused = true; document.body.classList.add('scron'); $('menuScr').classList.remove('hide');
  const going = run.w.seen.length > 1 || run.w.camps.length || run.zone > 1 || run.cards.length;
  $('mainMenu').innerHTML = menu([['go', 'play', going ? 'Pokračovať' : 'Hrať'], ['new', 'star', 'Nový beh', !going], ['book', 'book', 'Kniha kúziel'], ['set', 'gear', 'Nastavenia']]);
  $('zoneBox').innerHTML = `<div class="r"><span>Zóna ${run.zone}</span><span style="color:var(--grey)">${ZONE_NAMES[(run.zone - 1) % 4]}</span></div><div class="bar"><b style="width:${Math.round(run.w.seen.length / 9 * 100)}%"></b></div><div class="r g"><span>Kariet ${meta.seen.length}/${Object.keys(CARDS).length}</span><span>${['+', ...run.ops.filter(o => o !== '+')].join(' ').replace('-', '−')} do ${run.range}</span></div>`;
  $('mainMenu').querySelectorAll('.row').forEach(r => r.onclick = () => {
    const k = r.dataset.k;
    if (k === 'book') return adv() ? openPack() : openBook();
    if (k === 'set') return openSettings();
    if (k === 'new' || !going) return chooseMode(mode => { run = newRun(mode); persist(); sessionStorage.setItem('mm-skip', '1'); location.reload(); });
    $('menuScr').classList.add('hide'); scrOn = false; paused = false; document.body.classList.remove('scron'); if (iOrb) { scene.remove(iOrb.m); iOrb = null; } snapCam = true; startSay();
  });
}
// ---------- NASTAVENIA: celá obrazovka, stiahnuť do mobilu (PWA) ----------
let installEvt = null;
// obraz: kontrast, jas, farebnosť (filter na plátne hry, uložené v prehliadači)
const VIEW_KEY = 'mm-view', view = Object.assign({ c: 100, b: 100, s: 100 }, load(VIEW_KEY, {}));
const applyView = () => { $('c').style.filter = `contrast(${view.c}%) brightness(${view.b}%) saturate(${view.s}%)`; };
applyView();
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
const installed = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function openSettings(back) {
  const fs = !!document.fullscreenElement, canFs = !!document.documentElement.requestFullscreen;
  const inst = installed() ? '<span class="btn" style="opacity:.5">Nainštalované ✓</span>' : installEvt ? '<button class="btn on" id="inst">Stiahnuť</button>' : isIOS ? '<span class="btn ghost" style="cursor:default">návod nižšie</span>' : '<span class="btn ghost" style="cursor:default">v menu prehliadača</span>';
  const el = overlay('Nastavenia', `
    <div class="setrow"><span>Celá obrazovka<small>${canFs ? 'hra bez lišty prehliadača' : 'na iPhone len po pridaní na plochu'}</small></span>${canFs ? `<button class="btn ${fs ? 'on' : ''}" id="fs">${fs ? 'Zap' : 'Vyp'}</button>` : '<span class="btn ghost" style="cursor:default">—</span>'}</div>
    <div class="setrow"><span>Stiahnuť do mobilu<small>appka na ploche, spustí sa cez celú obrazovku na šírku</small></span>${inst}</div>
    ${isIOS && !installed() ? `<p class="sub" style="text-align:left">iPhone / iPad: ťukni dole na <b>Zdieľať</b> (štvorček so šípkou) → <b>Pridať na plochu</b> → <b>Pridať</b>.</p>` : ''}
    ${!isIOS && !installEvt && !installed() ? `<p class="sub" style="text-align:left">Android: v Chrome ťukni na <b>⋮</b> → <b>Inštalovať aplikáciu</b> (alebo Pridať na plochu).</p>` : ''}
    <h3>Zvuk</h3>
    ${[['hudba', 'Hudba'], ['efekty', 'Zvuky']].map(([k, n]) => `<div class="setrow"><span>${n}</span><button class="btn ${zvuk[k] ? 'on' : ''}" data-z="${k}">${zvuk[k] ? 'Zap' : 'Vyp'}</button></div>`).join('')}
    <h3>Obraz</h3>
    ${[['c', 'Kontrast', 50, 200], ['b', 'Jas', 50, 160], ['s', 'Farebnosť', 0, 250]].map(([k, n, a, b]) => `<div class="setrow"><span>${n}<small id="v-${k}">${view[k]} %</small></span><input type="range" class="sl-${k}" min="${a}" max="${b}" step="5" value="${view[k]}" data-k="${k}"></div>`).join('')}
    <div class="acts"><button class="btn ghost" id="vreset">Pôvodné</button><button class="btn on" id="close">Hotovo</button></div>`, 'small');
  el.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { nastavZvuk(b.dataset.z, !zvuk[b.dataset.z]); openSettings(back); });
  el.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => { view[r.dataset.k] = +r.value; el.querySelector('#v-' + r.dataset.k).textContent = r.value + ' %'; applyView(); try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (e) {} });
  el.querySelector('#vreset').onclick = () => { Object.assign(view, { c: 100, b: 100, s: 100 }); applyView(); try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (e) {} openSettings(back); };
  const f = el.querySelector('#fs'); if (f) f.onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else { await document.documentElement.requestFullscreen(); screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } } catch (e) {} setTimeout(() => openSettings(back), 150); };
  const i = el.querySelector('#inst'); if (i) i.onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; openSettings(back); };
  el.querySelector('#close').onclick = () => { closeOverlay(); back && back(); }; addX(el.querySelector('#close').onclick);
}
// výber režimu pri novom behu
// Učeň (vľavo, deň) / Majster (vpravo, noc): poloha myši plynulo mení deň a noc, panely sa posúvajú proti sebe (paralax)
let modeOn = false, modeTarget = 0, modeDone = null;
function chooseMode(done) {
  modeOn = true; modeDone = done; modeTarget = 0.5;
  $('menuScr').classList.add('hide'); $('introScr').classList.add('hide'); $('modeScr').classList.remove('hide');
  $('modeScr').querySelector('.left .dia').innerHTML = icon('star'); $('modeScr').querySelector('.right .dia').innerHTML = icon('crown');
}
$('modeScr').addEventListener('pointermove', e => { modeTarget = Math.min(1, Math.max(0, (e.clientX / innerWidth - 0.25) / 0.5)); });
$('modeScr').querySelectorAll('.mp').forEach(m => m.addEventListener('pointerdown', e => { e.stopPropagation(); modeTarget = m.dataset.m === 'pokrocily' ? 1 : 0; const d = modeDone; modeOn = false; setTimeout(() => d(m.dataset.m), 350); }));
$('modeScr').querySelector('.mback').addEventListener('pointerdown', e => { e.stopPropagation(); modeOn = false; $('modeScr').classList.add('hide'); denNoc(); showMenu(); });
function modeTick(dt) {
  denNocT(dnT + (modeTarget - dnT) * Math.min(1, dt * 3));
  const p = (dnT - 0.5) * 2;   // -1 deň … 1 noc
  $('modeScr').querySelector('.left').style.transform = `translateX(${-p * 18}px) scale(${1 - Math.max(0, p) * 0.06})`;
  $('modeScr').querySelector('.right').style.transform = `translateX(${-p * 18}px) scale(${1 - Math.max(0, -p) * 0.06})`;
  $('modeScr').querySelector('.left').classList.toggle('on', dnT < 0.35); $('modeScr').querySelector('.right').classList.toggle('on', dnT > 0.65);
  $('modeScr').classList.toggle('night', dnT > 0.5);
}
// rovno do hry po „Nový beh“, do menu po „Menu“ z prehry
let afterLoad = null;
for (const [k, v] of [['mm-skip', 'game'], ['mm-menu', 'menu']]) if (sessionStorage.getItem(k)) { sessionStorage.removeItem(k); afterLoad = v; introStage = -1; $('introScr').classList.add('hide'); }
renderIntro();

// ---------- štart ----------
await Promise.all([loadProps(), loadFighters(), loadHero()]);
buildInterior();
buildRoom();
resize(viewZoom); resizeKresba(); addEventListener('resize', () => { resize(viewZoom); resizeKresba(); });
renderHearts(); renderCoins(); renderStreak(); renderInput(); renderSlots(); renderXp();
bottomEl.classList.add('hidden');
$('loading').remove();
loaded = true; if (introStage === 0) renderIntro();
for (const id of ['introScr', 'menuScr']) { $(id).classList.add('live'); $(id).classList.toggle('night', adv()); }   // za introm a menu beží živá scéna
const startSay = () => say(adv() ? 'Pohyb: WASD alebo šípky · klik = kúzlo z Knihy.' : run.w.camps.length === 0 && run.zone === 1 ? 'Ťukni na zem a choď. Svet je veľký – nájdi bandy zbojníkov a ich kľúče.' : 'Poraz bandy a nájdi kľúče od brány vodcu.', 4200);
if (afterLoad === 'game') { scrOn = false; paused = false; document.body.classList.remove('scron'); startSay(); } else if (afterLoad === 'menu') showMenu();
const clock = new THREE.Clock();
function tick() { const dt = Math.min(0.05, clock.getDelta()); simT += dt; update(dt, simT); draw(dt); requestAnimationFrame(tick); }
let simT = 0;
requestAnimationFrame(tick);
// testovací háčik: __h.step(s) posunie hru o s sekúnd (Browser pane beží pomaly)
window.__h = {
  step(s) { for (let k = 0; k < s * 30; k++) { simT += 1 / 30; update(1 / 30, simT); } draw(1); },
  press, fight, camLook, get viewZoom() { return viewZoom; }, get run() { return run; }, get R() { return R; }, hero, openPack, chooseMode, get gates() { return gates; }, get bands() { return bands; }, tp(x, z) { hero.position.set(x, place.height(x, z), z); target = null; },
  walk(x, z) { target = new THREE.Vector3(x, 0, z); }, get goalDone() { return goalDone; }, get chests() { return chests; }, get bushes() { return bushes; }, get lock() { return lock; },
  kresbaMat, gameOver, spawnMerchant, mergeNumbers, openBook, openMap, openShop, cardOffer, closeOverlay, get paused() { return paused; }, setHorde(n) { hordeN = n; hordeT = 0.05; }, get dbg() { return { fadeT, lockOn, inside, locked: heroLocked(), over: G.over, target, fightOn: fight.on }; }, newRun() { run = newRun(); persist(); },
};
