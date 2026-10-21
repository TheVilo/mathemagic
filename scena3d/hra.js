// Mathemagic – zóna ako beh (roguelike): mapa so 7 krokmi, v každej miestnosti iný cieľ.
// Skúmanie = ťukneš na zem a čarodejník tam dôjde. Banda pri ohni = súboj na mieste (suboj.js).
// Kniha kúziel = karty, ktoré pridávajú efekty; obchod = interiér v tmavom režime; vodca na konci dá nové znamienko.
import { THREE, scene, camera, U, sun, hemi, PAPER, MAT, GRASS, FLOWER, RAW, std, inst, placeModels, loadProps, spark, burst, updateParticles, ditherMat, blurMat, resize, setView, render, pix, icon, digitTexture } from './svet.js';
import { hero, loadHero, heroPlay, updateHero, heroLocked, loadFighters, makeFighter, crystalLight, crystal, lamp, aim } from './postavy.js';
import { initFight, fight, startFight, joinFight, fightPress, updateFight, drawTags, renderInput, endFight, aimPoint, fireAt, fireAtScreen, elementShape, animShape, curRow } from './suboj.js';
import { newPack, migratePack, spellOk, spellWorks, rollSpell, strength, lootToken, addToken, slotPrice, MAX_SLOTS, MAX_ROWS, MAX_STAFF, rowPrice, staffPrice, allIds, workingRows } from './ruksak.js';
import { CARDS, SLOTS, lvl, offer, makeMap, ROOM_INFO } from './karty.js';
import { mulberry32 } from './gen.js';
import { genWorld, AW, AH, GW, GH } from './world.js';
import { svetloDen, svetloNoc, svetloDenNoc, renderKresba, resizeKresba, kresbaMat, kresbaBlur } from './kresba.js';
import { points } from './svet.js';
import { ZIVLY, card, slot, dia, menu } from './ui.js';
points.layers.enable(4);   // iskry patria kúzlu

// ---------- stav behu a zbierka (localStorage) ----------
const RUN_KEY = 'mm-run', META_KEY = 'mm-meta';
function newRun(mode = 'zaklad') {
  const seed = 1 + Math.floor(Math.random() * 99999);
  const pack = newPack(); if (mode === 'pokrocily') pack.rows = [[]];   // Majster začína úvodom: kalkulačku si poskladá sám
  return { seed, zone: 1, hearts: 3, coins: 0, cards: [], ops: ['+'], range: 5, w: newWorldState(), mode, pack, tut: mode === 'pokrocily' ? 0 : 99 };
}
// postup v otvorenom svete zóny: porazené bandy, kľúče, otvorené truhlice a brány, objavené oblasti
function newWorldState() { return { keys: 0, camps: [], chests: [], bushes: [], gates: [], runes: [], seen: [] }; }
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v || d; } catch (e) { return d; } };
let run = load(RUN_KEY, null); if (!run || !run.w || run.hearts <= 0) run = newRun(run && run.mode); // prehratý beh sa nepokračuje
run.mode = run.mode || 'zaklad'; run.pack = migratePack(run.pack || newPack()); run.tut = run.tut ?? 99;
const adv = () => run.mode === 'pokrocily';
const meta = load(META_KEY, { seen: [] });
const persist = () => { try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* bez ukladania */ } };
const maxHearts = () => 3 + lvl(run, 'srdce');

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
function addCoins(n, at) { run.coins += n; renderCoins(true); if (at) floatText(icon('coin', 'currentColor') + '+' + n, at, 'coin'); }
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
};
initFight(G);

// ---------- miesto (miestnosť alebo interiér): výška zeme, kam sa dá ísť, prekážky ----------
let place = { height: () => 0, inside: () => true, blockers: [], ground: null };
let R = null, room = null, gates = [], bands = [], act = null, band = [], chests = [], runes = [], bushes = [], labels = [], goalDone = false, lock = null, inside = false;
const roomRng = () => mulberry32(run.seed * 31 + run.zone * 997 + (run.w.camps.length * 7 + run.w.chests.length * 13 + run.w.bushes.length * 17) + 1);

function label(html, pos, cls = '') { const el = document.createElement('div'); el.className = 'wlabel ' + cls; el.innerHTML = html; labelsEl.appendChild(el); const l = { el, pos }; labels.push(l); return l; }
function clearRoom() {
  if (room) scene.remove(room);
  for (const l of labels) l.el.remove();
  labels = []; band = []; bands = []; act = null; gates = []; chests = []; runes = []; bushes = []; lock = null;
  endFight();
}
function buildRoom() {
  clearRoom(); inside = false;
  denNoc();
  R = genWorld(run.seed, run.zone, { rune: run.range < 10 });
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
function tutStep(n) { if (!tutOn() || run.tut >= n) return; run.tut = n; persist(); renderTut(); if (n === 5) setTimeout(() => { run.tut = 99; persist(); renderTut(); }, 9000); }
function tutTick() {
  if (!tutOn()) return;
  if (run.tut === 1 && spellWorks(run)) tutStep(2);
  if (run.tut === 4 && spellWorks(run) && run.pack.rows[0].some(id => (run.pack.inv.find(t => t.id === id) || {}).v === 2)) tutStep(5);
}
function renderGates() { for (const g of gates) if (g.kind === 'boss') g.label.el.innerHTML = icon('key') + `${Math.min(run.w.keys, g.need)}/${g.need}`; }
const bossGate = () => gates.find(g => g.kind === 'boss');
function renderGoal() {
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
  el.querySelector('#close').onclick = () => { closeOverlay(); opts.after && opts.after(); };
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
  const el = overlay(`Zóna ${run.zone} · Mapa`, `<p class="sub">Kľúče <b>${run.w.keys}/${bossGate() ? bossGate().need : 0}</b> · objavené <b>${run.w.seen.length}/${R.areas.length}</b> oblastí</p>
    <svg viewBox="-4 -4 ${w + 8} ${h + 8}" style="width:100%;max-width:${Math.round(w * 1.4)}px;max-height:58vh;display:block;margin:10px auto 0" shape-rendering="crispEdges">
    <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#0e0e10"/><path d="M0 6L6 0" stroke="#3a3936" stroke-width="1"/></pattern></defs>${svg}</svg>
    <div class="acts"><button class="btn on" id="close">Zavrieť</button></div>`, 'mapov');
  el.querySelector('#close').onclick = closeOverlay;
}
// ---------- ruksak (Pokročilý) ----------
const OPC = { '+': '#c8923a', '-': '#4fa8ff', '×': '#ff5a22', '÷': '#7fe8d8' };
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
const KEYS = [['C', 'fn'], ['⌫', 'fn'], ['√', 'lock'], ['÷', 'o'], ['7', 'n'], ['8', 'n'], ['9', 'n'], ['×', 'o'], ['4', 'n'], ['5', 'n'], ['6', 'n'], ['-', 'o'], ['1', 'n'], ['2', 'n'], ['3', 'n'], ['+', 'o'], ['□', 'd'], ['0', 'n'], ['( )', 'lock'], ['=', 'fn']];
function openPack() {
  tutStep(1); tutTick();
  const P = run.pack; packRow = Math.min(packRow, P.rows.length - 1);
  const usedIds = allIds(P), free = P.inv.filter(t => !usedIds.has(t.id));
  const match = (k, t) => (k[1] === 'n' && t.t === 'n' && String(t.v) === k[0]) || (k[1] === 'o' && t.t === 'o' && t.v === k[0]) || (k[1] === 'd' && t.t === 'd');
  const row = P.rows[packRow], last = row.length ? P.inv.find(t => t.id === row[row.length - 1]) : null;
  const wantNum = !last || last.t === 'o';   // po znamienku číslo, po čísle znamienko (ako na kalkulačke)
  const name = o => ({ '+': 'zem', '-': 'voda', '×': 'oheň', '÷': 'vzduch' }[o]);
  const lcdRow = r => {
    const ids = P.rows[r], ok = spellWorks(run, r), st = ok ? strength(run, mulberry32(7), r) : null, ex = ok ? rollSpell(run, mulberry32(3), r) : null;
    const txt = ids.map(id => { const t = P.inv.find(x => x.id === id); return t ? (t.t === 'd' ? '?' : t.v) : ''; }).join('');
    const pad = '_'.repeat(Math.max(0, P.slots - ids.length));
    const dice = ids.some(id => (P.inv.find(t => t.id === id) || {}).t === 'd');
    const res = ok ? (dice ? `${st.lo}…${st.hi}` : String(ex.answer)) : '?';
    const ops = ok ? [...new Set(ex.ops)].map(o => `<span style="color:${OPC[o]}">${name(o)}</span>`).join(' ') : '';
    return `<div class="lrow${r === packRow ? ' on' : ''}" data-r="${r}"><span class="ln">${r + 1}</span><span class="lf">${txt ? pix(txt) : ''}<i>${pad}</i></span><span class="lr">=${res.includes('…') ? res : pix(res)}</span><span class="lo">${ok ? `sila ${st.lo}–${st.hi} ${ops}` : ids.length ? 'nehotové' : 'prázdne'}</span></div>`;
  };
  const keyHtml = (k, i) => {
    if (k[1] === 'fn') return `<button class="ck fn${k[0] === '=' ? ' eq' : ''}" data-k="${i}">${k[0]}</button>`;
    if (k[1] === 'lock') return `<button class="ck locked" disabled title="odomkne sa neskôr">${k[0]}<small>${icon('lock')}</small></button>`;
    const n = free.filter(t => match(k, t)).length, owned = P.inv.some(t => match(k, t));
    const wrong = k[1] === 'o' ? wantNum : !wantNum;
    const lab = k[1] === 'n' || k[1] === 'd' ? (k[0] === '□' ? pix('?') : pix(k[0])) : pix(k[0]);
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
        <div class="brand"><b>MATHEMAGIC</b><span>MM-${P.slots} · palica ${P.staff}</span></div>
        <div class="lcd2">${lcdRow(packRow).replace('class="lrow', 'class="lrow big')}</div>
        <div class="ckeys">${KEYS.map(keyHtml).join('')}</div>
      </div>
      <p class="sub" style="margin-top:8px">${pix('?').replace('class="pix"', 'class="pix" style="height:.8em"')} = kocka (vždy iné číslo) · zamknuté klávesy nájdeš alebo kúpiš</p>
      ${tutOn() && run.tut <= 4 ? `<p class="sub" style="color:var(--line)">${TUT[run.tut]}</p>` : ''}
    </div></div>`;
  if (ovEl.classList.contains('show') && ovEl.classList.contains('pack')) ovEl.querySelector('.box').innerHTML = html;
  else { document.body.classList.add('ovon'); ovEl.className = 'ov show pack'; ovEl.innerHTML = `<div class="box panel">${html}</div>`; paused = true; }
  const el = ovEl;
  el.querySelectorAll('.lrow').forEach(r => r.onclick = () => { packRow = +r.dataset.r; openPack(); });
  el.querySelectorAll('.ck[data-k]').forEach(b => b.onclick = () => {
    const k = KEYS[+b.dataset.k], R0 = P.rows[packRow];
    if (k[0] === '=') { closeOverlay(); if (fight.on) renderInput(); return; }
    if (k[0] === 'C') { P.rows[packRow] = []; persist(); return openPack(); }
    if (k[0] === '⌫') { R0.pop(); persist(); return openPack(); }
    if (R0.length >= P.slots) { say('Displej je plný – väčšiu kalkulačku nájdeš alebo kúpiš.'); return; }
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
    <div class="acts"><button class="btn" id="heal" ${heal && run.coins >= 6 ? '' : 'disabled'}>${icon('heart')} Srdiečko · ${icon('coin')} 6</button>${adv() && run.pack.slots < MAX_SLOTS ? `<button class="btn" id="slot" ${run.coins >= slotPrice(run.pack) ? '' : 'disabled'}>+2 políčka · ${icon('coin')} ${slotPrice(run.pack)}</button>` : ''}${adv() && run.pack.rows.length < MAX_ROWS ? `<button class="btn" id="row" ${run.coins >= rowPrice(run.pack) ? '' : 'disabled'}>Ďalšie kúzlo · ${icon('coin')} ${rowPrice(run.pack)}</button>` : ''}${adv() && run.pack.staff < MAX_STAFF ? `<button class="btn" id="staff" ${run.coins >= staffPrice(run.pack) ? '' : 'disabled'}>Lepšia palica · ${icon('coin')} ${staffPrice(run.pack)}</button>` : ''}<button class="btn ghost" id="close">Odísť</button></div>`, 'offer shopscr');
  el.querySelectorAll('.card').forEach(c => {
    const id = c.dataset.id; if (run.coins < price(id)) c.classList.add('poor');
    c.addEventListener('click', () => { if (run.coins < price(id)) { say('Nemáš dosť mincí.'); return; } run.coins -= price(id); renderCoins(); closeOverlay(); addCard(id); });
  });
  el.querySelector('#heal').onclick = () => { run.coins -= 6; run.hearts++; renderHearts(); renderCoins(); persist(); closeOverlay(); say('Srdiečko doplnené.'); };
  const sl = el.querySelector('#slot'); if (sl) sl.onclick = () => { run.coins -= slotPrice(run.pack); run.pack.slots += 2; renderCoins(); persist(); closeOverlay(); say(`Ruksak má ${run.pack.slots} políčok – dlhšie kúzla!`); };
  const rw = el.querySelector('#row'); if (rw) rw.onclick = () => { run.coins -= rowPrice(run.pack); run.pack.rows.push([]); renderCoins(); persist(); closeOverlay(); say(`Máš ${run.pack.rows.length} kúzla – striedajú sa v poradí.`); };
  const sf = el.querySelector('#staff'); if (sf) sf.onclick = () => { run.coins -= staffPrice(run.pack); run.pack.staff++; renderCoins(); persist(); closeOverlay(); say(`Palica úrovne ${run.pack.staff}: rýchlejšie nabíjanie.`); };
  el.querySelector('#close').onclick = closeOverlay;
}
function gameOver() {
  G.over = true; endFight(); heroPlay('Death_A', 0.1, 99); bottomEl.classList.add('hidden');
  setTimeout(() => {
    const el = overlay('Koniec behu', `<div style="display:flex;justify-content:center;margin-bottom:10px">${dia('skull', 'big')}</div>
      <div style="font-size:24px;margin-bottom:12px">Zbojníci ťa dostali</div>
      <div style="max-width:300px;margin:0 auto;text-align:left"><div class="stat"><span>Zóna</span><span>${run.zone} · kľúče ${run.w.keys}</span></div><div class="stat"><span>Správne</span><span>${G.stats.ok}</span></div><div class="stat"><span>Mince</span><span>${run.coins}</span></div></div>
      <p class="sub" style="margin-top:12px">Kúzla v Zbierke ti ostávajú. Nový beh = nová mapa.</p>
      <div class="acts"><button class="btn on" id="again">Znova</button><button class="btn ghost" id="toMenu">Menu</button></div>`, 'end');
    el.querySelector('#again').onclick = () => { run = newRun(); persist(); location.reload(); };
    el.querySelector('#toMenu').onclick = () => { run = newRun(); persist(); sessionStorage.setItem('mm-menu', '1'); location.reload(); };
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
    run.hearts = maxHearts(); renderHearts(); addCoins(20);
    persist();
    setTimeout(() => {
      const el = overlay('Vodca porazený', `<div style="display:flex;justify-content:center;margin-bottom:6px">${dia('crown', 'big fill')}</div>${newOp ? `<div style="font-size:22px">Získal si nový živel</div><div class="cards">${card(newOp)}</div><p class="sub">Odteraz kúzliš aj ${{ '-': 'odčítaním', '×': 'násobením', '÷': 'delením' }[newOp]}.</p>` : '<div style="font-size:22px">Zóna je hotová.</div>'}<div class="acts"><button class="btn on" id="next">Ďalšia zóna ▸</button></div>`, 'end');
      el.querySelector('#next').onclick = () => { closeOverlay(); cardOffer('Odmena od vodcu', nextZone); };
    }, 2200);
    return;
  }
  setTimeout(() => addCoins(n * 2 + (opts.elite ? 8 : 0), hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))), 700);
  if (adv() && (opts.elite || Math.random() < 0.6)) setTimeout(() => giveLoot(hero.position.clone().add(new THREE.Vector3(0, 3.2, 0)), opts.elite ? 1 : 0), 1400);
  persist();
  if (opts.horde && !b) { if (++hordeWins % 3 === 0) setTimeout(() => cardOffer('Tri hordy porazené', null), 1600); else setTimeout(() => say(`Horda porazená! Ďalšia o ${Math.round(hordeT)} s.`), 900); return; }
  setTimeout(() => cardOffer(opts.elite ? 'Kapitán porazený' : 'Banda porazená', null), 2200);
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
    const map = { '*': '×', 'x': '×', '/': '÷', 'Backspace': '⌫', 'Delete': 'C', 'Enter': '=', '?': '□' }, want = map[e.key] || e.key;
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
  J.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); joy.id = e.pointerId; J.setPointerCapture(e.pointerId); set(e); });
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
$('bBook').innerHTML = icon('book') + '<span>Kniha</span>'; $('bPack').innerHTML = icon('star') + '<span>Ruksak</span>'; $('bPack').style.display = 'none';   // Majster: všetko v Knihe kúziel (kalkulačka + efekty)
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
  const ok = (x, z) => place.inside(x, z) && (inside || !gateBlocks(x, z)) && place.blockers.every(b => (b.x - x) ** 2 + (b.z - z) ** 2 > b.r * b.r);
  if (ok(nx, nz)) { hero.position.x = nx; hero.position.z = nz; }
  else if (ok(nx, hero.position.z)) hero.position.x = nx;
  else if (ok(hero.position.x, nz)) hero.position.z = nz;
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
  if (R && !scrOn) updateHordes(dt);   // Majster: kúzla letia aj mimo súboja
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
    if (Math.hypot(c.x - hp.x, c.z - hp.z) < (c.boss ? 8.5 : c.dummy ? 3.6 : adv() ? 10 : 6.5)) {
      if (adv() && !workingRows(run).length) { if (G.now - (b.warn ?? -9) > 5) { b.warn = G.now; say('Najprv poskladaj kúzlo v Knihe kúziel!'); openPack(); } return; }
      act = b; startFight(b.f, { boss: c.boss, elite: c.elite, dummy: c.dummy });
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
    c.open = true; if (c.n !== 'tut') run.w.chests.push(c.id); persist(); heroPlay('Interact', 0.1, 0.8);
    if (c.obj.userData.lid) c.anim = 0;
    burst(c.obj.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 80, 3, 0xffd25a);
    if (c.n === 'tut') { addToken(run.pack, { t: 'n', v: 2 }); persist(); floatText(pix('2'), c.obj.position.clone().add(new THREE.Vector3(0, 2, 0)), 'coin'); say('Nový kláves: 2!'); tutStep(4); continue; }
    if (adv()) setTimeout(() => giveLoot(c.obj.position.clone().add(new THREE.Vector3(0, 2, 0)), c.n === 0 ? 0 : 1), 500);
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
  // obchod = samostatná obrazovka (nie 3D miestnosť): pri dverách sa otvorí, po odchode stojíš pred dverami
  if (R.building) { const dd = Math.hypot(R.building.door[0] - hp.x, R.building.door[1] - hp.z); if (dd < 1.3 && !shopNear) { shopNear = true; target = null; vel.set(0, 0, 0); openShop(); } if (dd > 2.4) shopNear = false; }
}
// ---------- HORDY (Majster, roguelite): svetom chodia skupiny, ktoré ťa zacítia a idú po tebe; čím ďalej, tým väčšie ----------
// veľkosť n = 2 + ⌊0,8 · vlna⌋ + (zóna − 1), najviac 12; interval = max(16, 38 − 2 · vlna) s; druhy podľa obtiažnosti d = zóna − 1 + vlna / 8
let hordeT = 30, hordeN = 0, hordeWins = 0;
const HW = d => ({ rogue: 1, hooded: Math.min(0.8, Math.max(0, d - 0.15) * 1.8), knight: 0.25 + Math.min(1, d) * 0.5, barbarian: Math.min(0.7, Math.max(0, d - 0.6) * 1.0) });
function updateHordes(dt) {
  if (!adv() || inside || G.over || tutOn() || paused || fadeT > 0) return;
  hordeT -= dt; if (hordeT > 0) return;
  hordeN++; hordeT = Math.max(16, 38 - hordeN * 2);
  const n = Math.min(12, 2 + Math.floor(hordeN * 0.8) + run.zone - 1), d = run.zone - 1 + hordeN / 8, w = HW(d), sum = Object.values(w).reduce((a, b) => a + b, 0);
  const roll = () => { let r = Math.random() * sum; for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k; return 'rogue'; };
  // miesto 13–16 m od čarodejníka, kde sa dá stáť (nie v pevnosti vodcu)
  let at = null;
  for (let k = 0; k < 40 && !at; k++) { const a = Math.random() * 6.28, r = 13 + Math.random() * 3, x = hero.position.x + Math.cos(a) * r, z = hero.position.z + Math.sin(a) * r; if (R.inside(x, z) && R.areaAt(x, z).id !== R.bossArea) at = [x, z]; }
  if (!at) return;
  const fs = [];
  for (let i = 0; i < n; i++) { const f = makeFighter(roll(), 1, room), x = at[0] + (Math.random() - 0.5) * 3, z = at[1] + (Math.random() - 0.5) * 3; f.g.position.set(x, R.height(x, z), z); f.play(f.d.walk); fs.push(f); band.push(f); }
  joinFight(fs, { horde: 1 }); bottomEl.classList.remove('hidden', 'lockmode');
  say(`Horda ${hordeN} prichádza! (${n})`, 2600);
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
    const fr = hero.position.clone().addScaledVector(to.clone().sub(hero.position).setY(0).normalize(), 0.75); fr.y = cw.y - 0.15;   // nie cez klobúk
    iOrb = { m, t: 0, from: fr, to, col, op };
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
    <div class="panel thin tap"><span class="${loaded ? 'blink' : ''}">${loaded ? 'Ťukni a začni' : 'Čarodejník sa chystá…'}</span></div>`;
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
    <h3>Obraz</h3>
    ${[['c', 'Kontrast', 50, 200], ['b', 'Jas', 50, 160], ['s', 'Farebnosť', 0, 250]].map(([k, n, a, b]) => `<div class="setrow"><span>${n}<small id="v-${k}">${view[k]} %</small></span><input type="range" class="sl-${k}" min="${a}" max="${b}" step="5" value="${view[k]}" data-k="${k}"></div>`).join('')}
    <div class="acts"><button class="btn ghost" id="vreset">Pôvodné</button><button class="btn on" id="close">Hotovo</button></div>`, 'small');
  el.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => { view[r.dataset.k] = +r.value; el.querySelector('#v-' + r.dataset.k).textContent = r.value + ' %'; applyView(); try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (e) {} });
  el.querySelector('#vreset').onclick = () => { Object.assign(view, { c: 100, b: 100, s: 100 }); applyView(); try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (e) {} openSettings(back); };
  const f = el.querySelector('#fs'); if (f) f.onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else { await document.documentElement.requestFullscreen(); screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } } catch (e) {} setTimeout(() => openSettings(back), 150); };
  const i = el.querySelector('#inst'); if (i) i.onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; openSettings(back); };
  el.querySelector('#close').onclick = () => { closeOverlay(); back && back(); };
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
renderHearts(); renderCoins(); renderStreak(); renderInput(); renderSlots();
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
  kresbaMat, openBook, openMap, openShop, cardOffer, closeOverlay, get paused() { return paused; }, get dbg() { return { fadeT, lockOn, inside, locked: heroLocked(), over: G.over, target, fightOn: fight.on }; }, newRun() { run = newRun(); persist(); },
};
