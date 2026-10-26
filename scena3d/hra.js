// Mathemagic – zóna ako beh (roguelike): mapa so 7 krokmi, v každej miestnosti iný cieľ.
// Skúmanie = ťukneš na zem a čarodejník tam dôjde. Banda pri ohni = súboj na mieste (suboj.js).
// Kniha kúziel = karty, ktoré pridávajú efekty; obchod = interiér v tmavom režime; vodca na konci dá nové znamienko.
import { THREE, scene, camera, U, sun, hemi, PAPER, MAT, GRASS, FLOWER, RAW, std, inst, placeModels, loadProps, spark, burst, updateParticles, ditherMat, blurMat, resize, setView, render, pix, icon, digitTexture, shortNum } from './svet.js';
import { hero, loadHero, heroPlay, updateHero, heroLocked, loadFighters, makeFighter, crystalLight, crystal, lamp, aim } from './postavy.js';
import { initFight, fight, startFight, joinFight, fightPress, updateFight, drawTags, drawTele, renderInput, endFight, aimPoint, fireAt, fireAtScreen, elementShape, animShape, curRow } from './suboj.js';
import { ITEMS, itemN, addItem, itemOffers, boostSlots } from './vylepsenia.js';
import { MAX_WANDS, wandKind, addWand, replaceWand, WAND_SLOTS } from './wand.js';
import { newWand, evalWand, wandCost, wandSlots, acquireMod, modLabel, modCost, modRar, MOD, wandOffers } from './wand.js';
import { newPack, migratePack, tokOf, spellOk, spellWorks, rollSpell, strength, lootToken, addToken, slotPrice, MAX_SLOTS, MAX_ROWS, MAX_STAFF, rowPrice, staffPrice, allIds, workingRows, rowCost } from './ruksak.js';
import { CARDS, SLOTS, lvl, offer, makeMap, ROOM_INFO } from './karty.js';
import { mulberry32 } from './gen.js';
import { genWorld, AW, AH, GW, GH } from './world.js';
import { manaStats } from './balance.js';
import { drawFighterSprites } from './sprity.js';
import { WORLDS, themeProps, buildMagic, groundStrokes, pavement } from './magia.js';
import { hordeSize, hordeInterval, isBossWave, kindWeights, xpFor, xpNeed, levelOffers, nextSpecial, SPECIALS, enemyHpM, BOSSES, bossOf, FINAL_ZONE, bossHpMul, STAFF_MODELS, staffStats, MAX_STARS, RARITY, STAFF_RAR, calcOffers, rarityOf, CARD_RAR, specOwned, specAdd } from './balance.js';
import { zvuk, efekt, hudba, nastavZvuk } from './zvuk.js';
import { svetloDen, svetloNoc, svetloDenNoc, renderKresba, resizeKresba, kresbaMat, kresbaBlur, addSprite, setLampLight } from './kresba.js';
import { points } from './svet.js';
import { ZIVLY, card, slot, dia, menu } from './ui.js';
points.layers.enable(4);   // iskry patria kúzlu

// ---------- stav behu a zbierka (localStorage) ----------
const RUN_KEY = 'mm-run', META_KEY = 'mm-meta';
function newRun(mode = 'zaklad') {
  const seed = 1 + Math.floor(Math.random() * 99999);
  const pack = newPack(); const done = typeof meta !== 'undefined' && meta.tutDone;
  if (mode === 'pokrocily') { pack.wands = [newWand()]; pack.bag = []; }
  pack.unlock = {};   // funkcie ( ) √ x² x³ ! sa odomykajú v každom behu nanovo (vodcovia zón, vzácne pri úrovni)
  return { seed, zone: 1, hearts: mode === 'pokrocily' ? 20 : 3, hpNum: 1, coins: 0, cards: [], ops: ['+'], range: 5, w: newWorldState(), mode, pack, tut: 99, st: { dmg: 0, kills: 0, hordes: 0, hit: 0 } };
}
// postup v otvorenom svete zóny: porazené bandy, kľúče, otvorené truhlice a brány, objavené oblasti
function newWorldState() { return { keys: 0, camps: [], chests: [], bushes: [], gates: [], runes: [], seen: [], nums: [] }; }
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v || d; } catch (e) { return d; } };
const meta = load(META_KEY, { seen: [] }); meta.unlock = meta.unlock || {}; meta.best = meta.best || { score: 0, zone: 1, hordes: 0, hit: 0 };
let run = load(RUN_KEY, null); if (!run || !run.w || run.hearts <= 0) run = newRun(run && run.mode); // prehratý beh sa nepokračuje
// MAJSTER = roguelite: po zatvorení hry (nová relácia) sa začína od nuly; trvalé ostáva odomknuté (meta) a rekordy
if (run.mode === 'pokrocily' && !sessionStorage.getItem('mm-alive') && (run.w.seen.length > 1 || run.zone > 1 || run.st)) run = newRun('pokrocily');
sessionStorage.setItem('mm-alive', '1');
run.mode = run.mode || 'zaklad'; run.pack = migratePack(run.pack || newPack());
if (run.mode === 'pokrocily' && !run.pack.wands) { run.pack.wands = [newWand()]; run.pack.bag = []; if (run.pack.kind2) { run.pack.wands.push(newWand()); run.pack.bRow = 1; } }
if (run.pack.wands) { run.pack.wands.forEach((w, i) => { w.kind = w.kind || (i === 1 && run.pack.kind2) || run.pack.kind || 'zakladna'; }); run.pack.kind2 = null; run.pack.bRow = null; }   // VIAC PALÍC: druh je na každej palici, ruka B zrušená (palice strieľajú po rade)   // PALICA SO SLOTMI run.tut = run.tut ?? 99; run.st = run.st || { dmg: 0, kills: 0, hordes: 0, hit: 0 };
run.pack.unlock = run.pack.unlock || {};
const adv = () => run.mode === 'pokrocily';
if (adv() && !run.hpNum) { run.hpNum = 1; run.hearts = 20 + 5 * (run.maxH || 0); }   // starý beh so srdciami → život ako číslo
{ const v = document.getElementById('veil'); if (v && run.mode !== 'pokrocily') v.classList.add('day'); }
const persist = () => { try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* bez ukladania */ } };
// Majster: ŽIVOT JE ČÍSLO (20 + 5 za každé vylepšenie Život / srdce); Učeň: 3 srdcia
const maxHearts = () => adv() ? 20 + 5 * (lvl(run, 'srdce') + (run.maxH || 0) + itemN(run.pack, 'zivot')) : 3 + lvl(run, 'srdce') + (run.maxH || 0);
const HEALK = () => adv() ? 5 : 1;   // jedno „srdce“ v Majstrovi = 5 života

// ---------- UI ----------
const $ = id => document.getElementById(id);
const heartsEl = $('hearts'), coinsEl = $('coins'), goalEl = $('goal'), msgEl = $('msg'), padEl = $('pad'), inpEl = $('inp'), bottomEl = $('bottom'), ovEl = $('ov'), streakEl = $('streak'), labelsEl = $('labels');
function renderHearts(lost) { if (adv()) { const m = maxHearts(), h = Math.max(0, Math.round(run.hearts)); heartsEl.classList.add('hpnum'); heartsEl.innerHTML = `<span class="dbar"><span class="di">${icon('heart', 'currentColor', lost ? 'pop' : '')}</span><i><u style="width:calc(${Math.min(100, h / m * 100)}% - 2px)"></u></i></span><b>${h}</b><span>/${m}</span>`; return; } heartsEl.innerHTML = Array.from({ length: maxHearts() }, (_, i) => icon('heart', 'currentColor', `${i < run.hearts ? '' : 'off'} ${lost && i === run.hearts ? 'pop' : ''}`)).join(''); }
// Majster: vľavo hore malé ikonky vylepšení (matematický zápis + počet kusov) namiesto 4 miest na karty
function renderItems() { if (!adv()) return; const it = Object.entries(run.pack.items || {}); $('slots').classList.add('items'); $('slots').innerHTML = it.map(([id, n]) => ITEMS[id] ? `<i class="itc r-${ITEMS[id].rar}" title="${ITEMS[id].name}: ${ITEMS[id].text(n)}">${ITEMS[id].icon}${n > 1 ? `<sub>${n}</sub>` : ''}</i>` : '').join(''); }
function renderSlots() { if (adv()) return renderItems(); $('slots').innerHTML = Array.from({ length: SLOTS }, (_, i) => slot(run.cards[i] && run.cards[i].id)).join(''); }
function renderCoins(pop) { coinsEl.innerHTML = icon('coin', 'currentColor') + `<b>${run.coins}</b>`; if (pop) { coinsEl.classList.remove('pop'); void coinsEl.offsetWidth; coinsEl.classList.add('pop'); } }
function renderStreak() { streakEl.innerHTML = '<span>Blesk</span>' + [0, 1, 2, 3, 4].map(i => `<i class="${i < fight.streak ? 'on' : ''}"></i>`).join(''); }
let msgT = 0;
function say(text, ms = 2400) { msgEl.textContent = text; msgEl.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => msgEl.classList.remove('show'), ms); }
function floatText(text, e, cls = '') {
  const p = e.g ? e.g.position.clone().add(new THREE.Vector3(0, (e.h || 2) + 0.6, 0)) : e.clone();
  const v = p.project(camera), d = document.createElement('div');
  d.className = 'float ' + cls; d.innerHTML = text;
  d.style.left = (v.x + 1) / 2 * innerWidth + 'px'; d.style.top = (1 - v.y) / 2 * innerHeight + 'px';
  document.body.appendChild(d); d._t = setTimeout(() => d.remove(), 1100); return d;
}
function addCoins(n, at) { run.coins += n; renderCoins(true); efekt('minca', 0.45, 0.95 + Math.random() * 0.1); if (at) floatText(icon('coin', 'currentColor') + '+' + n, at, 'coin'); }
let shakeV = 0, hurtV = 0;
const G = {
  get run() { return run; }, now: 0, over: false, danger: false, room: null, stats: { ok: 0, bad: 0 },
  tagsEl: $('tags'), inpEl, height: (x, z) => place.height(x, z),
  say, floatText, renderStreak, addCoins, heal: (n, raw) => { run.hearts = Math.min(maxHearts(), run.hearts + (raw ? n : n * HEALK())); renderHearts(); persist(); }, shake: v => { shakeV = Math.max(shakeV, v); },
  hurt(n = 1) {
    if (G.over) return;
    run.hearts = Math.max(0, run.hearts - n); renderHearts(true); shakeV = 0.5; hurtV = 1; persist();
    if (run.hearts <= 0) gameOver();
  },
  onWin: opts => winFight(opts),
  enemyHp: (kind, boss, elite, trait) => Math.round(enemyHpM(kind, adv() ? (Math.max(1, hordeN) - 1) % HPZ + 1 : Math.max(1, hordeN), run.zone, { boss, elite }) * (trait ? bossHpMul(trait) : 1)),   // život podľa hordy v zóne a zóny
  bossTrait: id => BOSSES[id],
  // MATEMATICKÁ KORISŤ podľa výsledku kúzla, ktoré zabilo: presne do nuly = 2× kryštály (+ energia v suboj.js),
  // prvočíslo = zlatý kryštál (3× skúsenosti), násobok 5 = minca
  onKill: (e, info = {}) => {
    if (adv()) rollPickup(e);
    if (adv() && (e.hb || e.zb)) wandQ++;   // vodca dá výber z 2 palíc
    if (adv() && e.hid && hordeLeft[e.hid] > 0 && --hordeLeft[e.hid] === 0) hordeCleared(e.hid);
    const raw = Math.round(info.raw ?? 0), prime = raw > 1 && isPrimeN(raw), five = raw > 0 && raw % 5 === 0;
    dropGems(e.g.position, xpFor(e.maxHp || 4) * (e.exact ? 2 : 1) * (prime ? 3 : 1) * (G.night ? 2 : 1), prime);   // v noci ×2
    if (info.extra) return;
    if (prime) floatText(`<span style="color:#ffd25a">${pix(String(raw))} prvočíslo</span>`, e);
    if (five) addCoins(1, e.g.position.clone().add(new THREE.Vector3(0, 2.4, 0)));   // násobok 5: vždy minca
    else if (Math.random() < 0.15) addCoins(1, e.g.position.clone().add(new THREE.Vector3(0, 2.4, 0)));   // inak vzácne
  },   // z nepriateľov padajú len kryštály (Lukáš 21. 10.)
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
function nextZoneWorld() {
  run.zone++; persist(); spawnQ.length = 0;
  if (merchant) { merchant.lab.el.remove(); merchant = null; }
  buildRoom(); renderGoal();
  const b = biomeOf(run.zone); efekt('objav', 0.8, 0.9);
  say(`Zóna ${run.zone}: ${b.name}${b.rule ? ` · pravidlo: ${b.rule.t}` : ''}`, 5000);
}
// ---------- PROSTREDIA ZÓN (Majster, možnosť 2): pevné poradie Les → Hory → Dungeon → Sopka, potom znova a ťažšie ----------
// každé má vlastný svet (podklad, modely) a jedno matematické pravidlo zóny (výsledok, ktorý ho splní, zraní ×2)
const isPrimeZ = n => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
// SVETY (Majster): 8 svetov, každý s matematickým pojmom, pravidlom zóny a viditeľnou mágiou (magia.js); zem a dosah svetla tu
const GROUND = { les: [0xd8d4ca, 0xe4e0d7], hory: [0xeef1f4, 0xf7f8fa], ruiny: [0xd6d0c2, 0xe2ddd0], dungeon: [0x8c857b, 0x9b948a], haj: [0xd2d6c6, 0xdfe3d3], sopka: [0x6e4c40, 0x7d5747], kruhy: [0xcfcac0, 0xdcd7cd], hrad: [0x9a958c, 0xaaa59b] };
const BIOMES = WORLDS.map(w => ({ ...w, ground: GROUND[w.id], light: w.id === 'dungeon' || w.id === 'hrad' ? [4, 9] : [5, 12] }));
const biomeOf = z => BIOMES[(z - 1) % BIOMES.length];
let magic = null;
function buildRoom() {
  clearRoom(); inside = false;
  denNoc();
  R = genWorld(run.seed, run.zone, { rune: run.range < 10 && !adv(), open: adv() });   // Majster: otvorený svet ako v hordových hrách
  const BIO = adv() ? biomeOf(run.zone) : BIOMES[0]; if (adv()) themeProps(R, BIO, mulberry32(R.seed * 31 + R.zone)); G.zoneRule = adv() ? BIO.rule : null; kresbaMat.uniforms.uNightR.value.set(...BIO.light);
  const W = run.w;
  room = new THREE.Group(); scene.add(room); G.room = room;
  // zem celého sveta
  const geo = new THREE.PlaneGeometry(R.W + 16, R.H + 16, (R.W + 16) * 2, (R.H + 16) * 2);
  geo.rotateX(-Math.PI / 2); geo.translate(R.W / 2, 0, R.H / 2);
  const pa = geo.attributes.position, col = new Float32Array(pa.count * 3), c1 = new THREE.Color(BIO.ground[0]), c2 = new THREE.Color(BIO.ground[1]), cc = new THREE.Color();
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
  magic = adv() ? buildMagic(room, R, BIO, mulberry32(R.seed * 7 + R.zone)) : null;   // svietiace číslice a tvary sveta
  if (adv()) { groundStrokes(room, R, BIO, mulberry32(R.seed * 13 + R.zone)); pavement(room, R, BIO, mulberry32(R.seed * 17 + R.zone)); }   // zem kreslená ťahmi, dlažba a chodníky
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
  lamp.base = L(0.35, 5);   // cez deň palica takmer nesvieti – žiadny svetlý kruh s tmavým okolím crystalLight.distance = L(5, 7.5); crystalLight.decay = L(1.6, 1.5); crystalLight.intensity = lamp.base;
  if (sun.castShadow !== !(t > 0.5)) { sun.castShadow = !(t > 0.5); } crystalLight.castShadow = true;   // svetlo palice vrhá tiene vždy (cez deň aj v tme)   // v noci mesiac bez tieňov (len jemné svetlo), tiene len od palice   // v noci palica vrhá tiene; čarodejník sám od svojej palice nie
}
function denNoc() { denNocT(adv() ? 1 : 0); document.body.classList.toggle('majster', adv()); }
// tiene od svetla palice (v noci): kocková mapa 512 px, dosah len okolo čarodejníka
crystalLight.shadow.mapSize.set(512, 512); crystalLight.shadow.camera.near = 0.15; crystalLight.shadow.camera.far = 9; crystalLight.shadow.bias = -0.004; crystalLight.shadow.radius = 2;
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
  if (adv()) { const left = HPZ - ((hordeN - 1 + HPZ) % HPZ) - 1, bz = biomeOf(run.zone); goalEl.innerHTML = `<span class="st">${bz.name}${bz.rule ? ` · ${bz.rule.t}` : ''}</span><b>Horda ${hordeN} · ${hordeN % HPZ === 0 && fight.on ? 'VODCA ZÓNY!' : `vodca zóny o ${left || HPZ} ${left === 1 ? 'hordu' : 'hôrd'}`}</b>`; return; }
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
function closeOverlay() { document.querySelectorAll('.gem.ghost').forEach(x => x.remove()); document.body.classList.remove('ovon'); ovEl.className = 'ov'; ovEl.innerHTML = ''; paused = scrOn; }
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
  if (id === 'srdce') run.hearts = Math.min(maxHearts(), run.hearts + HEALK());
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
const OPC = { '+': '#c8923a', '-': '#ff5a22', '×': '#7fe8d8', '÷': '#4fa8ff', '√': '#b07ad8', '²': '#ffd25a', '³': '#ffa040', '!': '#ff3a6a' };
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
// ---------- KNIHA S PALICAMI SO SLOTMI (Majster) ----------
// každá palica = rad slotov: 1. základné číslo, potom moduly; výpočet zľava doprava je hneď vidno krok za krokom
// ťuk na modul = vyber, ťuk na slot = vlož/vymeň, ťuk na ruksak = vyber z palice; základné číslo sa dá len vymeniť
let wSel = null;
const OPCOL2 = { 'π': '#ffd25a', 'e': '#8dff98', 'φ': '#f0c040', '+': '#c8923a', '-': '#ff5a22', '×': '#7fe8d8', '÷': '#4fa8ff', '√': '#b07ad8', '²': '#ffd25a', '³': '#ffa040', '!': '#ff3a6a' };
function wandSteps(slots) {
  const s = slots.filter(Boolean); if (!s.length) return '';
  let out = String(s[0].v), part = [s[0]];
  for (const m of s.slice(1)) { part.push(m); const r = evalWand(part); out += ` → ${modLabel(m).replace('-', '−')} = ${Math.round(r.value * 100) / 100}`; }
  return out;
}
function openWands() {
  document.querySelectorAll('.gem.ghost').forEach(x => x.remove());   // zvyšok po nedokončenom ťahaní
  tutStep(1); $('bBook').classList.remove('pulse');
  const P = run.pack, at = loc => loc.w != null ? P.wands[loc.w].slots[loc.j] : P.bag[loc.j];
  // modul = kameň (kruh vo farbe živlu), vkladá sa do jamiek na palici; základné číslo = biely kameň v prvej jamke
  const gem = (m, loc, extra = '') => { const c = m.t === 'num' ? 'var(--line)' : OPCOL2[m.o];
    const on = wSel && wSel.w === loc.w && wSel.j === loc.j && (wSel.w != null || loc.w == null) ? ' sel' : '';
    return `<button class="gem${on}${extra}${m.t === 'num' ? ' base' : ''}" data-loc='${JSON.stringify(loc)}' style="--c:${c}" title="${m.t === 'mod' ? MOD[m.o].name + ': ' + MOD[m.o].text : 'základné číslo'}">${pix(modLabel(m))}<small>⚡${modCost(m)}</small></button>`; };
  // KOMPAKTNE ako Magicraft: hore ruksak, pod ním palice (veľký obrázok palice + jamky + výsledok); kamene sa ŤAHAJÚ (drag and drop)
  const wandHtml = (w, i) => { const n = wandSlots(P, i), kind = wandKind(P, i), S = staffStats({ ...P, kind }), M = manaStats(P), bs = boostSlots(P, w.slots), r = evalWand(bs), cost = wandCost(w.slots, P);
    const cells = Array.from({ length: n }, (_, j) => w.slots[j] ? gem(w.slots[j], { w: i, j }) : `<button class="gem empty${j === 0 ? ' base' : ''}" data-loc='${JSON.stringify({ w: i, j: w.slots.length })}'></button>`).join('');
    const val = r ? shortNum(Math.round(r.value * 100) / 100) : '?';
    const one = P.wands.length > 1;
    return `<div class="krow wrow${one && curRow() === i ? ' next' : ''}">${one ? `<span class="kctl"><b>${i + 1}</b>${i ? `<button data-up="${i}" title="skôr v poradí">▲</button>` : ''}<button data-del="${i}" title="zahodiť palicu (kamene do ruksaku)">✕</button></span>` : ''}<img class="kimg" src="../zdroj/karty/palica-${kind}.jpg" alt="" title="Palica ${S.name} · ${ruleText(S.rule) || S.text}"><div class="kbar">${cells}</div>
      <span class="kres" title="${r ? wandSteps(bs) : ''}"><b class="${lastRes[i] != null && lastRes[i] !== val ? 'pop' : ''}">${val}</b><small${cost > M.emax ? ' class="over"' : ''}>⚡${cost}</small></span></div>`; };
  const bagN = Math.max(6, P.bag.length + 1);
  const bag = Array.from({ length: bagN }, (_, j) => P.bag[j] ? gem(P.bag[j], { j }) : `<i class="gem empty" data-loc='{"bag":1}'></i>`).join('');
  const MS = manaStats(P);
  const html = `<div class="krow bagrow" data-loc='{"bag":1}'><b class="kn">${icon('star')}</b><div class="kbar">${bag}</div></div>${P.wands.map(wandHtml).join('')}
    <p class="khint">mana ⚡${MS.emax} · +${+MS.regen.toFixed(1)}/s · palice strieľajú po rade${P.wands.length < MAX_WANDS ? ` · ďalšie palice od vodcov (najviac ${MAX_WANDS})` : ''}</p>`;
  const again = ovEl.classList.contains('wandsbook') && ovEl.classList.contains('show');
  let el;
  if (again) { el = ovEl; el.querySelector('.box').innerHTML = `<span class="ptag">Kniha kúziel</span>${html}`; }   // prekreslenie bez „vyskočenia“ okna
  else { el = overlay('Kniha kúziel', html, 'pack wandsbook'); addX(() => { closeOverlay(); if (fight.on) renderInput(); }); }
  P.wands.forEach((w, i) => { const r = evalWand(boostSlots(P, w.slots)); lastRes[i] = r ? shortNum(Math.round(r.value * 100) / 100) : '?'; });
  el.querySelectorAll('.gem:not(.empty)').forEach((g, k) => g.style.setProperty('--d', (k * 0.37 % 2.2).toFixed(2) + 's'));   // každý kameň sa vznáša inak
  const move = (from, to) => {
    const m = at(from); if (!m) return;
    if (to.w == null && !to.bag) {   // ťuk na kameň v ruksaku
      if (from.w == null) { wSel = to; return; }   // z ruksaku na ruksak = len iný výber
      const b = P.bag[to.j]; if (!b) return;
      if ((from.j === 0) !== (b.t === 'num')) { say(from.j === 0 ? 'Základ sa dá vymeniť len za číslo.' : 'Číslo patrí len do prvej jamky.', 2000); return; }
      P.bag[to.j] = m; P.wands[from.w].slots[from.j] = b; return true;   // výmena palica ↔ ruksak
    }
    if (to.bag) { if (from.w == null) return; if (from.j === 0) { say('Základné číslo sa dá len vymeniť za iné číslo.', 2000); return; } P.wands[from.w].slots.splice(from.j, 1); P.bag.push(m); return true; }
    if (to.j === 0 && m.t !== 'num') { say('Do prvého slotu patrí číslo (základ).', 2000); return; }
    if (to.j > 0 && m.t === 'num') { say('Číslo patrí len do prvého slotu – ďalej sú operácie.', 2000); return; }
    const W = P.wands[to.w], target = W.slots[to.j];
    if (to.j >= wandSlots(P, to.w)) return;
    if (from.w != null && from.j === 0 && !target) { say('Základné číslo sa dá len vymeniť.', 2000); return; }
    // odober zo starého miesta
    if (from.w != null) { if (target) P.wands[from.w].slots[from.j] = target; else P.wands[from.w].slots.splice(from.j, 1); } else { if (target) P.bag[from.j] = target; else P.bag.splice(from.j, 1); }
    if (target) W.slots[to.j] = m; else W.slots.push(m);
    return true;
  };
  el.querySelectorAll('[data-up]').forEach(b => b.onclick = ev => { ev.stopPropagation(); const i = +b.dataset.up; [P.wands[i - 1], P.wands[i]] = [P.wands[i], P.wands[i - 1]]; persist(); openWands(); });
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = ev => { ev.stopPropagation(); const i = +b.dataset.del; if (P.wands.length < 2) return; if (!b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = 'zahodiť?'; return; } P.bag.push(...P.wands[i].slots); P.wands.splice(i, 1); persist(); openWands(); });
  const done = (from, to) => { const ok = move(from, to); if (ok) { persist(); efekt('minca', 0.4, 1.3); dropAt = to; } openWands(); };
  // ŤAHANIE: chytíš kameň → letí za prstom/myšou, voľné jamky blikajú, pustíš nad jamkou alebo ruksakom
  el.querySelectorAll('.gem[data-loc]:not(.empty)').forEach(g => g.onpointerdown = ev => {
    ev.preventDefault(); ev.stopPropagation();
    const from = JSON.parse(g.dataset.loc), r = g.getBoundingClientRect(), x0 = ev.clientX, y0 = ev.clientY;
    let ghost = null;
    const mv = e => {
      if (!ghost && Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return;
      if (!ghost) { ghost = g.cloneNode(true); ghost.classList.add('ghost'); ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px'; document.body.appendChild(ghost); g.classList.add('lifted'); el.classList.add('dragging'); wSel = null; efekt('minca', 0.15, 2); }
      ghost.style.transform = `translate(${e.clientX - r.width / 2}px, ${e.clientY - r.height / 2}px) scale(1.3) rotate(${Math.max(-25, Math.min(25, (e.clientX - x0) * 0.08))}deg)`;
      el.querySelectorAll('.hover').forEach(h => h.classList.remove('hover'));
      const t = document.elementFromPoint(e.clientX, e.clientY); const tl = t && t.closest('[data-loc]'); if (tl && tl !== g) tl.classList.add('hover');
    };
    const up = e => {
      if (up.done) return; up.done = true; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('mouseup', up);
      if (!ghost) {   // len ťuk = výber a ťuk na cieľ (ako predtým)
        if (wSel && JSON.stringify(wSel) === JSON.stringify(from)) { wSel = null; return openWands(); }
        if (wSel) { const f = wSel; wSel = null; return done(f, from); }
        wSel = from; return openWands();
      }
      ghost.remove(); el.classList.remove('dragging'); g.classList.remove('lifted');
      const t = document.elementFromPoint(e.clientX, e.clientY), tl = t && t.closest('[data-loc]');
      if (!tl) return openWands();
      const to = JSON.parse(tl.dataset.loc); if (JSON.stringify(to) === JSON.stringify(from)) return openWands();
      if (to.w == null && !to.bag && from.w == null) return openWands();   // ruksak na ruksak – nič
      done(from, to);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('mouseup', up);
  });
  el.querySelectorAll('.gem.empty[data-loc], .bagrow').forEach(b => b.onclick = ev => { ev.stopPropagation(); if (!wSel) return; const f = wSel; wSel = null; done(f, JSON.parse(b.dataset.loc)); });
  if (dropAt) { const k = JSON.stringify(dropAt.bag ? null : dropAt); const t = [...el.querySelectorAll('.gem[data-loc]')].find(x => x.dataset.loc === k); if (t) t.classList.add('drop'); dropAt = null; }
}
let lastRes = [], dropAt = null;
function openPack() {
  if (adv() && run.pack.wands) return openStaff();
  tutStep(1); tutTick(); $('bBook').classList.remove('pulse');
  const P = run.pack; packRow = Math.min(packRow, P.rows.length - 1);
  const SP = P.kind2 && packRow === P.bRow ? { ...P, kind: P.kind2 } : P;   // kalkulačka = palica, ku ktorej patrí riadok (A alebo B)
  const usedIds = allIds(P), free = P.inv.filter(t => !usedIds.has(t.id));
  const match = (k, t) => (k[1] === 'n' && t.t === 'n' && String(t.v) === k[0]) || (k[1] === 'o' && t.t === 'o' && t.v === k[0]) || (k[1] === 'd' && t.t === 'd');
  const row = P.rows[packRow], last = row.length ? tokOf(P, row[row.length - 1]) : null;
  const wantNum = !last || last.t === 'o' || last.t === 's' || (last.t === 'p' && last.v === '(');   // ² ³ ! idú za číslom (wantNum = false)   // čaká sa číslo (ako na kalkulačke)
  const open = row.filter(id => id === -1).length - row.filter(id => id === -2).length;
  const U = P.unlock || {};
  const SID = { s: -3, q: -4, c: -5, f: -6, p: -1 }, spLeft = c => specOwned(U, c) - P.rows.flat().filter(id => id === SID[c]).length;   // koľko kusov funkcie ešte ostáva
  const name = o => ({ '+': 'zem', '-': 'oheň', '×': 'vzduch', '÷': 'voda', '√': 'prieraz', '²': 'mocnina', '³': 'mocnina', '!': 'faktoriál' }[o]);
  const lcdRow = r => {
    const ids = P.rows[r], ok = spellWorks(run, r), st = ok ? strength(run, mulberry32(7), r) : null, ex = ok ? rollSpell(run, mulberry32(3), r) : null;
    const txt = ids.map(id => { const t = tokOf(P, id); return t ? (t.t === 'd' ? '?' : t.v) : ''; }).join('');
    const pad = '_'.repeat(Math.max(0, staffStats(P.kind2 && r === P.bRow ? { ...P, kind: P.kind2 } : P).disp - ids.length));
    const dice = ids.some(id => (tokOf(P, id) || {}).t === 'd');
    const res = ok ? (dice ? `${st.lo}…${st.hi}` : String(ex.answer)) : '?';
    const ops = ok ? [...new Set(ex.ops)].map(o => `<span style="color:${OPC[o]}">${name(o)}</span>`).join(' ') : '';
    return `<div class="lrow${r === packRow ? ' on' : ''}${P.kind2 && r === P.bRow ? ' hb' : ''}" data-r="${r}"><span class="ln">${P.kind2 ? (r === P.bRow ? 'B' : 'A') : r + 1}</span><span class="lf">${txt ? pix(txt) : ''}<i>${pad}</i></span><span class="lr${res.length > 9 ? ' xl' : res.length > 6 ? ' l' : ''}">=${res.includes('…') ? res : pix(res)}</span><span class="lo">${ok ? `sila ${st.lo}–${st.hi} · ⚡${rowCost(P, r)} ${ops}` : ids.length ? 'nehotové' : 'prázdne'}</span></div>`;
  };
  const keyHtml = (k, i) => {
    if (k[1] === 'fn') return `<button class="ck fn${k[0] === '=' ? ' eq' : ''}" data-k="${i}">${k[0]}</button>`;
    if (k[1] === 'lock') return `<button class="ck locked" disabled title="odomkne sa neskôr">${k[0]}<small>${icon('lock')}</small></button>`;
    // špeciálne klávesy od bossov: √ (pred číslo) a ( ) – sám vie, či teraz otvára alebo zatvára
    if (k[1] === 's' || k[1] === 'p' || k[1] === 'x') {
      const code = k[1] === 's' ? 's' : k[1] === 'p' ? 'p' : k[3], own = specOwned(U, code) > 0, left = spLeft(code), ok = own && (k[1] === 's' ? wantNum && left > 0 : k[1] === 'x' ? !wantNum && !(last && last.t === 'x') && left > 0 : (wantNum && left > 0) || (!wantNum && open > 0));
      const lab = k[1] === 'x' && k[0][0] === 'x' ? `<span class="xl">x${pix(k[0].slice(1))}</span>` : pix(k[1] === 's' ? '√' : k[1] === 'x' ? k[0] : wantNum ? '(' : ')');
      return `<button class="ck sp${own ? '' : ' locked'}" data-k="${i}" ${ok ? '' : 'disabled'} title="${own ? `kusov: ${left}` : 'odomkne vodca'}">${lab}${own ? `<b class="badge">${Math.max(0, left)}</b>` : `<small>${icon('lock')}</small>`}</button>`;
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
      <h3>Kúzla${P.kind2 ? ' · A pravá palica, B ľavá (ťukni na A/B a prepni)' : P.rows.length > 1 ? ' · v súboji idú 1 → 2 → 3' : ''}</h3>
      <div class="notes">${P.rows.map((_, r) => lcdRow(r)).join('')}</div>
      <h3>Efekty ${run.cards.length}/${SLOTS}</h3><div class="fxgrid">${fx}</div>
      <p class="sub">Efekty platia pre každé kúzlo. Miesta sú len ${SLOTS} – vyber si.</p>
    </div>
    <div class="page rp">
      <div class="calc2">
        <div class="brand"><b>${P.kind2 ? (SP === P ? 'A · ' : 'B · ') : ''}${staffStats(SP).name.toUpperCase()}${P.staff ? ` ${P.staff}★` : ''}</b><span>⚡${staffStats(SP).emax} · +${+staffStats(SP).regen.toFixed(1)}/s · displej ${staffStats(SP).disp}</span><i class="bat" title="energia"><b style="width:${Math.round(Math.min(1, ((SP === P ? run.energy : run.energy2) ?? staffStats(SP).emax) / staffStats(SP).emax) * 100)}%"></b></i></div>
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
  el.querySelectorAll('.lrow .ln').forEach(n => n.onclick = ev => { if (!P.kind2) return; ev.stopPropagation(); P.bRow = +n.closest('.lrow').dataset.r; persist(); openPack(); });
  el.querySelectorAll('.ck[data-k]').forEach(b => b.onclick = () => {
    const k = KEYS[+b.dataset.k], R0 = P.rows[packRow];
    if (k[0] === '=') { closeOverlay(); if (fight.on) renderInput(); return; }
    if (k[0] === 'C') { P.rows[packRow] = []; persist(); return openPack(); }
    if (k[0] === '⌫') { R0.pop(); persist(); return openPack(); }
    if (R0.length >= staffStats(SP).disp) {
      // PLNÝ DISPLEJ: znamienko alebo číslo prepíše posledné rovnakého druhu (1+1 → ťuk × → 1×1)
      const t = (k[1] === 'o' || k[1] === 'n' || k[1] === 'd') && P.inv.find(x => match(k, x) && !usedIds.has(x.id));
      const same = x => { const q = tokOf(P, x); return q && (k[1] === 'o' ? q.t === 'o' : q.t === 'n' || q.t === 'd'); };
      const i = t ? R0.map((x, j) => same(x) ? j : -1).filter(j => j >= 0).pop() : undefined;
      if (t && i !== undefined) { const old = tokOf(P, R0[i]); R0[i] = t.id; persist(); openPack(); say(`Vymenené: ${old.t === 'd' ? '?' : old.v} → ${k[0]}. Displej má ${staffStats(SP).disp} miesta – dlhší vzorec = väčšia palica.`, 3500); return; }
      say('Displej je plný – zmaž znak ⌫ a pridaj nový. Dlhší displej má väčšia palica.', 3500); return;
    }
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
  if (adv()) return openMerchant();
  const rng = mulberry32(run.seed + run.zone * 7 + run.w.camps.length * 13 + run.w.chests.length), ids = offer(run, rng), price = id => (lvl(run, id) ? 14 : 10);
  const heal = run.hearts < maxHearts();
  const el = overlay('Obchod', `<div class="shophead">${dia('crown', 'big')}<div><b>Obchodník</b><p class="sub">„Za mince ti predám kúzla a klávesy. Počítať musíš sám.“</p></div><span class="chip">${icon('coin')} <b>${run.coins}</b></span></div>
    <div class="cards">${ids.map(id => card(id, { l: lvl(run, id) + 1, cls: 'pick', data: `data-id="${id}"`, count: lvl(run, id) ? 2 : 0, foot: `<span class="price">${icon('coin')} ${price(id)}</span>` })).join('')}</div>
    <div class="acts"><button class="btn" id="heal" ${heal && run.coins >= 6 ? '' : 'disabled'}>${icon('heart')} Srdiečko · ${icon('coin')} 6</button>${adv() && run.pack.slots < MAX_SLOTS ? `<button class="btn" id="slot" ${run.coins >= slotPrice(run.pack) ? '' : 'disabled'}>+2 políčka · ${icon('coin')} ${slotPrice(run.pack)}</button>` : ''}${adv() && run.pack.rows.length < MAX_ROWS ? `<button class="btn" id="row" ${run.coins >= rowPrice(run.pack) ? '' : 'disabled'}>Ďalšie kúzlo · ${icon('coin')} ${rowPrice(run.pack)}</button>` : ''}${adv() && run.pack.staff < MAX_STAFF ? `<button class="btn" id="staff" ${run.coins >= staffPrice(run.pack) ? '' : 'disabled'}>Lepšia palica · ${icon('coin')} ${staffPrice(run.pack)}</button>` : ''}</div>
    ${adv() ? `<h3>Palice · model kalkulačky</h3><div class="palgrid">${Object.entries(STAFFS).map(([k, m]) => { const r = STAFF_RAR[k], mine = run.pack.kind === k;
      return `<button class="palc r-${r}${mine ? ' mine' : ''}" data-staff="${k}" style="--rc:${RARITY[r].col}" ${mine || run.coins < m.price ? 'disabled' : ''}><em class="rar">${RARITY[r].name}</em><div class="lvart"><img src="../zdroj/karty/palica-${k}.jpg" alt="" onerror="this.remove()"></div><b>${m.name}</b><span class="pst"><i>displej</i>${m.disp}<i>⚡ max</i>${m.emax}<i>⚡ za s</i>+${m.regen}${m.shots > 1 ? '<i>ciele</i>2' : ''}</span><span class="pp">${mine ? 'máš' : `${icon('coin')} ${m.price}`}</span></button>`; }).join('')}</div>` : ''}<div class="row"><button class="btn ghost" id="close">Odísť</button></div>`, 'offer shopscr');
  el.querySelectorAll('.card').forEach(c => {
    const id = c.dataset.id; if (run.coins < price(id)) c.classList.add('poor');
    c.addEventListener('click', () => { if (run.coins < price(id)) { say('Nemáš dosť mincí.'); return; } run.coins -= price(id); renderCoins(); closeOverlay(); addCard(id); });
  });
  el.querySelector('#heal').onclick = () => { run.coins -= 6; run.hearts++; renderHearts(); renderCoins(); persist(); closeOverlay(); say('Srdiečko doplnené.'); };
  const sl = el.querySelector('#slot'); if (sl) sl.onclick = () => { run.coins -= slotPrice(run.pack); run.pack.slots += 2; renderCoins(); persist(); closeOverlay(); say(`Ruksak má ${run.pack.slots} políčok – dlhšie kúzla!`); };
  const rw = el.querySelector('#row'); if (rw) rw.onclick = () => { run.coins -= rowPrice(run.pack); run.pack.rows.push([]); renderCoins(); persist(); closeOverlay(); say(`Máš ${run.pack.rows.length} kúzla – striedajú sa v poradí.`); };
  el.querySelectorAll('[data-staff]').forEach(b => b.onclick = () => { const s = STAFFS[b.dataset.staff]; run.coins -= s.price; run.pack.kind = b.dataset.staff; run.energy = staffStats(run.pack).emax; renderCoins(); persist(); closeOverlay(); say(`Palica ${s.name}: displej ${s.disp}, energia ${s.emax}.`); });
  addX(() => el.querySelector('#close').click());
  const sf = el.querySelector('#staff'); if (sf) sf.onclick = () => { run.coins -= staffPrice(run.pack); run.pack.staff++; renderCoins(); persist(); closeOverlay(); say(`Palica úrovne ${run.pack.staff}: +25 % damage, viac energie.`); };
  el.querySelector('#close').onclick = closeOverlay;
}
function gameOver() {
  if (G.over && G.endShown) return;
  G.over = true; G.overT = performance.now(); G.endShown = false; endFight(); heroPlay('Death_A', 0.1, 99); bottomEl.classList.add('hidden'); spawnQ.length = 0;
  setTimeout(endScreen, 1600);
}
// obrazovka konca (strážca v slučke ju ukáže znova, ak ju prekrylo iné okno – inak hra „zamrzla“)
function endScreen() {
  G.endShown = true;
  {
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
  }
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
    if (spec) { specAdd(run.pack.unlock, spec); meta.unlock[spec] = true; }
    run.hearts = maxHearts(); renderHearts(); addCoins(20);
    persist();
    setTimeout(() => {
      const el = overlay('Vodca porazený', `<div style="display:flex;justify-content:center;margin-bottom:6px">${dia('crown', 'big fill')}</div>${newOp ? `<div style="font-size:22px">Získal si nový živel</div><div class="cards">${card(newOp)}</div><p class="sub">Odteraz kúzliš aj ${{ '-': 'odčítaním', '×': 'násobením', '÷': 'delením' }[newOp]}.</p>` : '<div style="font-size:22px">Zóna je hotová.</div>'}${specNew ? `<p class="sub" style="color:var(--line)">Nový kláves na kalkulačke: <b>${spO.key} ${spO.name} – ${spO.text}</b>.</p>` : ''}<div class="acts"><button class="btn on" id="next">Ďalšia zóna ▸</button></div>`, 'end');
      el.querySelector('#next').onclick = () => { closeOverlay(); if (adv() && run.zone === FINAL_ZONE) return victory(); cardOffer('Odmena od vodcu', nextZone); };
    }, 2200);
    return;
  }
  if (!adv()) setTimeout(() => addCoins(n * 2 + (opts.elite ? 8 : 0), hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))), 700);   // Majster: mince len z nepriateľov (vzácne) a od vodcov
  // Majster: z boja nepadajú čísla (tie sú len na mape) – boj dáva skúsenosti a mince
  persist();
  if (opts.horde) run.st.hordes += opts.horde;
  // OBCHOD PO KAŽDEJ HORDE (ako Brotato): keď vyčistíš hordu, príde obchodník; odmena = číslo hordy v mincích
  // (obchod po každej horde: hordeCleared – každá horda sa sleduje zvlášť, lebo sa prekrývajú)
  if (opts.hb) { addCoins(8 + run.zone * 2, hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))); setTimeout(() => say('Vodca hordy porazený! Prišiel obchodník.', 3000), 600); spawnMerchant(25); }   // funkcie dáva len vodca zóny (sim-energia.mjs)
  if (opts.zb) { // vodca zóny porazený: znamienko + špeciálna funkcia, obchodník, ďalšia zóna (po 8. výhra)
    const newOp = ['-', '×', '÷'].find(o => !run.ops.includes(o)); if (newOp) { run.ops.push(newOp); addToken(run.pack, { t: 'o', v: newOp }); }
    const sp = nextSpecial(run.pack.unlock); if (sp) { specAdd(run.pack.unlock, sp.k); meta.unlock[sp.k] = true; }
    if (run.zone >= 2 && !run.pack.kind2 && !run.pack.wands) giveSecondStaff();
    run.hearts = maxHearts(); renderHearts(); addCoins(12 + run.zone * 4, hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))); persist();
    say(`Vodca zóny porazený! ${newOp ? `Znamienko ${newOp.replace('-', '−')}` : ''}${sp ? ` · nová funkcia ${sp.key}` : ''}`, 4500);
    spawnMerchant(20);
    if (run.zone >= FINAL_ZONE && !run.endless) setTimeout(victory, 2500);
    else setTimeout(() => nextZoneWorld(), 3500);
    return;
  }
  if (opts.horde && !b) { if (++hordeWins % 3 === 0 && !adv()) setTimeout(() => cardOffer('Tri hordy porazené', null), 1600); else setTimeout(() => say(`Horda porazená! Ďalšia o ${Math.round(hordeT)} s.`), 900); return; }
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
  if (ovEl.classList.contains('show') && ovEl.classList.contains('staffview')) { if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { ovEl._flip(1); e.preventDefault(); return; } if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { ovEl._flip(-1); e.preventDefault(); return; } if (e.key === 'Backspace') { ovEl.querySelector('#svback').click(); return; } if (e.key === 'Escape') { ovEl.querySelector('.ovx').click(); return; } }
  if (ovEl.classList.contains('show') && ovEl.classList.contains('pack')) {
    const map = { '*': '×', 'x': '×', '/': '÷', 'Backspace': '⌫', 'Delete': 'C', 'Enter': '=', '?': '□', '(': '( )', ')': '( )', 'r': '√', 'v': '√', '^': 'x²', 'q': 'x²', 'c': 'x³', '!': '!' }, want = map[e.key] || e.key;
    const i = KEYS.findIndex(k => k[0] === want); if (i >= 0) { const b = ovEl.querySelector(`.ck[data-k="${i}"]`); if (b && !b.disabled) b.click(); e.preventDefault(); return; }
  }
  keys[e.key.toLowerCase()] = true;
  const k = /^[0-9]$/.test(e.key) ? e.key : e.key === 'Backspace' ? '←' : null;
  if (e.key === ' ' && adv() && !paused) { e.preventDefault(); dash(); }   // Majster strieľa sám → medzerník = dash
  else if (e.key === ' ' && fight.on && !paused) { e.preventDefault(); fireAt(null); }
  if ((e.key === 'e' || e.key === 'E') && adv() && !paused) fireAt(null, null, 'b');
  if (e.key === 'Shift' && adv() && !paused) dash();
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
$('c').addEventListener('contextmenu', e => e.preventDefault());
$('c').addEventListener('pointermove', e => { mouseNdc = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
let target = null, tapMark = null;
// mobil: pri prvom ťuknutí celá obrazovka a zámok na šírku (Android); iPhone ukáže výzvu „Otoč mobil“
addEventListener('pointerdown', () => { if (matchMedia('(pointer: coarse)').matches && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); }, { once: true });
$('c').addEventListener('pointerdown', e => {
  if (!paused && adv() && !scrOn) { mouseNdc = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera); const gh = ray.intersectObject(place.ground)[0]; fireAtScreen(e.clientX, e.clientY, camera, gh ? gh.point.clone().add(new THREE.Vector3(0, 0.3, 0)) : null, e.button === 2 ? 'b' : 'a'); return; }   // Majster: ľavý klik = pravá palica A, pravý klik = ľavá palica B
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
// mobil (Majster): tlačidlo B = ľavá palica (strelí na najbližšieho), ⇥ = dash
{ const mk = (id, html, fn) => { const b = document.createElement('button'); b.id = id; b.className = 'actb'; b.innerHTML = html; b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(); }); document.body.appendChild(b); return b; };
  mk('bDash', '<span>⇥</span><small>medzerník</small>', dash); mk('bB', '<span>B</span>', () => { if (!paused) fireAt(null, null, 'b'); }); }
const renderHandBtn = () => { const b = $('bB'); if (b) b.style.display = adv() && run.pack.kind2 ? '' : 'none'; document.body.classList.toggle('advm', adv()); };
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
// DASH (Majster): Shift / tlačidlo ⇥ – 0,2 s rýchly skok 3,4 m v smere pohybu (alebo od najbližšieho nepriateľa), počas neho ťa nič nezraní; znova o 1,4 s
const lastDir = new THREE.Vector3(0, 0, 1), dashV = new THREE.Vector3(); let dashT = 0, dashCd = 0;
function dash() {
  if (dashCd > 0 || paused || G.over) return;
  let d = lastDir.clone(); if (!(keys.w || keys.a || keys.s || keys.d || keys.arrowup || keys.arrowdown || keys.arrowleft || keys.arrowright || joy.x || joy.z) && fight.on) {
    const n = fight.enemies.filter(e => e.state !== 'dead').sort((a, b) => a.g.position.distanceTo(hero.position) - b.g.position.distanceTo(hero.position))[0];
    if (n) d = hero.position.clone().sub(n.g.position).setY(0); }
  d.setY(0).normalize(); dashV.copy(d).multiplyScalar(17); dashT = 0.2; dashCd = 1.4; target = null;
  efekt('gula', 0.35, 1.6); renderDashBtn();
}
function renderDashBtn() { const b = $('bDash'); if (b) { b.classList.toggle('cd', dashCd > 0); b.style.setProperty('--cd', dashCd / 1.4); } }
// SVETLO SVETA (Majster, Lukáš 26. 10.): väčšina svetov je cez deň (svetlý papier ako predloha), TEMNÉ sú len kobka, sopka a hrad
// TMA = matematické pravidlo: zásahy do teba ×2, skúsenosti ×2 (riziko za odmenu)
let dnCur = 0, nightOn = false;
function dayNight(dt) {
  if (!adv() || scrOn || modeOn || inside) return;
  const want = testDark != null ? testDark : biomeOf(run.zone).dark ? 1 : 0;
  if (Math.abs(want - dnCur) < 0.001 && Math.abs(dnT - dnCur) < 0.001) return;
  dnCur += Math.sign(want - dnCur) * Math.min(Math.abs(want - dnCur), dt * 0.35); denNocT(dnCur);
  const n = dnCur > 0.5; if (n !== nightOn) { nightOn = n; G.night = n; say(n ? 'Temný svet · zásahy do teba ×2 · skúsenosti ×2' : 'Svetlo · deň', 3500); efekt('objav', 0.6, n ? 0.8 : 1.4); }
}
function update(dt, t) {
  dayNight(dt); if (magic) magic.update(t);
  G.now = t; U.time.value = t;
  // pohyb
  const dir = new THREE.Vector3((keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), 0, (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0));
  if (joy.x || joy.z) { dir.x += joy.x; dir.z += joy.z; }   // mobilný joystick
  if (dir.lengthSq()) target = null;
  else if (target) { dir.subVectors(target, hero.position).setY(0); if (dir.length() < 0.15) { target = null; dir.set(0, 0, 0); } }
  if (dir.lengthSq()) dir.normalize();
  if ((fight.on && !adv()) || paused || lockOn || fadeT > 0 || G.over || (heroLocked() && !adv())) { dir.set(0, 0, 0); if (fight.on || G.over) target = null; }   // Majster sa hýbe aj v boji
  if (dir.lengthSq()) lastDir.copy(dir);
  vel.lerp(dir.multiplyScalar(3.4), 1 - Math.exp(-dt * 8));
  dashCd = Math.max(0, dashCd - dt);
  if (adv() && itemN(run.pack, 'hojenie') && !G.over && !paused) { run.hregT = (run.hregT || 0) + dt; const per = 12 / itemN(run.pack, 'hojenie'); if (run.hregT >= per) { run.hregT -= per; if (run.hearts < maxHearts()) G.heal(1, true); } }   // vylepšenie Hojenie
  if (dashT > 0) { dashT -= dt; vel.copy(dashV); G.dashing = dashT > 0; if (Math.random() < 0.8) spark(hero.position.clone().add(new THREE.Vector3(0, 0.6, 0)), -dashV.x * 0.1, 0.4, -dashV.z * 0.1, 0.35, 0x7fd6ff); }
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
  const speed = vel.length(); if (adv()) renderDashBtn();
  // Majster: kúzelník sa otáča za myšou a mieri palicou (ruka sa vystrie podľa vzdialenosti myši)
  if (adv() && !scrOn && mouseNdc && !paused && (++aimFrame % 2 === 0)) { ray.setFromCamera(mouseNdc, camera); const h = place.ground && ray.intersectObject(place.ground)[0]; mouseWorld = h ? h.point : mouseWorld; }
  hero.userData.aimMouse = adv() && !scrOn && !inside ? mouseWorld : null; aim.p = hero.userData.aimMouse;
  const aimP = aimPoint() || hero.userData.aimMouse;
  const want = aimP ? Math.atan2(aimP.x - hero.position.x, aimP.z - hero.position.z) : speed > 0.2 ? Math.atan2(vel.x, vel.z) : fight.on && fight.enemies[0] ? Math.atan2(fight.enemies[0].g.position.x - hero.position.x, fight.enemies[0].g.position.z - hero.position.z) : hero.rotation.y;
  let dr = want - hero.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); hero.rotation.y += dr * (1 - Math.exp(-dt * 10));
  updateHero(dt, speed, fight.on);
  U.hero.value.copy(hero.position);

  if (!paused && (fight.on || fight.enemies.length || adv())) updateFight(dt);
  if (R && !scrOn) { updateHordes(dt); if (adv() && !inside && !G.over && !paused) updateSpawns(dt); }
  if (adv() && lvlQueue > 0 && !paused && !scrOn && !G.over) openLevelUp();
  else if (adv() && wandQ > 0 && !paused && !scrOn && !G.over) openWandChoice();
  if (adv() && R && !paused && !G.over) { updateGems(dt); updateDrops(dt); updateMerchant(dt); }
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
      n.got = true; run.w.nums = run.w.nums || []; run.w.nums.push(n.id); if (run.pack.wands) acquireMod(run.pack, { t: 'num', v: n.v }); else addToken(run.pack, { t: 'n', v: n.v }); persist();
      burst(n.obj.position.clone().add(new THREE.Vector3(0, 1, 0)), 90, 3, 0xffd25a); floatText(pix(String(n.v)), n.obj.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 'coin');
      say(run.pack.wands ? `Kameň ${n.v} – nové základné číslo do vaku (palica ním začína výpočet)` : `Nový kláves: ${n.v}!`, 3500); room.remove(n.obj); efekt('objav', 0.5, 1.2);
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
  if (TEST && !testHorde) return;   // testovacia mapa: hordy len na tlačidlo
  testHorde = false;
  if (!adv() || inside || G.over || tutOn() || paused || fadeT > 0) return;
  hordeT -= dt; if (hordeT > 0) return;
  hordeN++;
  // ZÓNA = 10 hôrd: 5. má vodcu hordy, 10. vodcu zóny (jeden z 8 s matematickou vlastnosťou); w = poradie hordy v zóne
  const wz = (hordeN - 1) % HPZ + 1, zoneBoss = wz === HPZ, boss = wz === 5 || zoneBoss;
  hordeT = hordeInterval(wz) + (zoneBoss ? 12 : 0);
  G.diffSpeed = Math.min(1.6, 1 + 0.035 * (wz - 1) + 0.08 * (run.zone - 1));   // gradácia: rýchlejší nepriatelia
  const n = zoneBoss ? Math.max(3, hordeSize(wz, run.zone) - 3) : hordeSize(wz, run.zone), w = kindWeights(wz, run.zone), sum = Object.values(w).reduce((a, b) => a + b, 0);
  const roll = () => { let r = Math.random() * sum; for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k; return 'rogue'; };
  // PRÚD ZO SVETA (Lukáš 21. 10.): nepriatelia nechodia v kope, ale postupne zo všetkých strán spoza okraja obrazovky –
  // horda sa rozloží na 60 % svojho intervalu, každý príde z iného smeru 15–18 m od čarodejníka a hneď beží po tebe
  const gap = hordeT * 0.6 / Math.max(1, n);
  for (let i = 0; i < n; i++) {
    const hb = boss && i === 0;
    spawnQ.push({ hid: hordeN, t: hb ? 0 : boss ? 0.6 : gap * i, ring: boss && !hb ? i / n : null, kind: hb ? 'barbarian' : roll(), size: hb ? (zoneBoss ? 1.8 : 1.5) : 1, hb, zb: hb && zoneBoss, opts: { horde: i === 0 ? 1 : 0, hb: hb && !zoneBoss ? 1 : 0, zb: hb && zoneBoss ? 1 : 0 } });
  }
  hordeLeft[hordeN] = n;
  if (zoneBoss) say('VODCA ZÓNY prichádza – obkľúčili ťa!', 3000); else if (boss) say('VODCA HORDY – obkľúčili ťa!', 2600);
  renderGoal();
}
const spawnQ = [], hordeLeft = {};
// OBCHOD PO KAŽDEJ HORDE (ako Brotato): keď padne posledný z hordy, odmena = číslo hordy v mincích a príde obchodník
function hordeCleared(hid) {
  const wz = (hid - 1) % HPZ + 1; if (wz === 5 || wz === HPZ) return;   // vodcovia majú vlastnú odmenu
  addCoins(wz, hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))); say(`Horda ${wz} vyčistená → +${wz} ${wz === 1 ? 'minca' : wz < 5 ? 'mince' : 'mincí'}. Prišiel obchodník.`, 3000); spawnMerchant(18);
}
function updateSpawns(dt) {
  for (let i = spawnQ.length - 1; i >= 0; i--) {
    const q = spawnQ[i]; q.t -= dt; if (q.t > 0) continue;
    if (fight.enemies.filter(e => e.state !== 'dead').length >= 30) { q.t = 0.5; continue; }   // strop pre mobil
    let at = null;
    if (q.ring != null) { const a = q.ring * 6.283, x = hero.position.x + Math.cos(a) * 12, z = hero.position.z + Math.sin(a) * 12; if (R.inside(x, z)) at = [x, z]; }   // OBKĽÚČENIE: družina vodcu v kruhu
    for (let k = 0; k < 40 && !at; k++) { const a = Math.random() * 6.28, r = 15 + Math.random() * 3, x = hero.position.x + Math.cos(a) * r, z = hero.position.z + Math.sin(a) * r; if (R.inside(x, z) && R.areaAt(x, z).id !== R.bossArea) at = [x, z]; }
    if (!at) { q.t = 0.3; continue; }
    spawnQ.splice(i, 1);
    const f = makeFighter(q.kind, q.size, room); f.hb = q.hb; f.hid = q.hid;
    if (q.zb) { f.trait = bossOf(run.zone, run.seed); f.zb = true; say(`VODCA ZÓNY: ${BOSSES[f.trait].name} – ${BOSSES[f.trait].hint}`, 5000); }
    f.g.position.set(at[0], R.height(at[0], at[1]), at[1]); f.play(f.d.walk); band.push(f);
    joinFight([f], q.opts); bottomEl.classList.remove('hidden', 'lockmode');
  }
}
// ---------- SKÚSENOSTI A ÚROVNE (Majster): XP za zabitie = ⌈HP/3⌉, ďalšia úroveň = ⌈12 · 1,45^(L−1)⌉ → výber 1 z 3 ----------
let lvlQueue = 0;
// KRYŠTÁLY SKÚSENOSTÍ (ako v hordových hrách): padnú z nepriateľa, magnet ich pritiahne, keď prejdeš blízko
const gems = [], gemGeo = new THREE.OctahedronGeometry(0.13, 0), gemMat = new THREE.MeshBasicMaterial({ color: 0x8dff98 }), goldMat = new THREE.MeshBasicMaterial({ color: 0xffd25a });
const isPrimeN = n => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
function dropGems(p, xp, gold = false) {
  if (!adv()) return;
  const n = Math.min(6, Math.max(1, Math.round(Math.log2(xp + 1))));   // väčší nepriateľ = viac kryštálov
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(gemGeo, gold ? goldMat : gemMat); if (gold) m.scale.setScalar(1.6); m.layers.enable(4); const a = Math.random() * 6.28, r = 0.3 + Math.random() * 0.9; m.position.set(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r); m.position.y = R.height(m.position.x, m.position.z) + 0.35; room.add(m); gems.push({ m, xp: xp / n, t: 0 }); }
}
// ZBERAČKY (ako Vampire Survivors / Brotato): z nepriateľov vzácne padne srdce (lieči 1) alebo magnet (pritiahne všetky kryštály)
// šance: srdce 1,2 % (len keď nemáš plné), magnet 0,6 %; vodca hordy = magnet, vodca zóny = srdce aj magnet
const heartMat = new THREE.MeshBasicMaterial({ color: 0xe8443a }), magMat = new THREE.MeshBasicMaterial({ color: 0x7fd6ff });
const heartGeo = new THREE.SphereGeometry(0.2, 8, 6), magGeo = new THREE.TorusGeometry(0.18, 0.06, 6, 12, Math.PI);
function dropPickup(p, kind) {
  const m = new THREE.Mesh(kind === 'heart' ? heartGeo : magGeo, kind === 'heart' ? heartMat : magMat); m.layers.enable(4);
  m.position.set(p.x + (Math.random() - 0.5), 0, p.z + (Math.random() - 0.5)); m.position.y = R.height(m.position.x, m.position.z) + 0.45; room.add(m);
  gems.push({ m, xp: 0, t: 0, kind, near: 0.9 });
}
function pickUp(kind) {
  if (kind === 'heart') { run.hearts = Math.min(maxHearts(), run.hearts + HEALK()); renderHearts(); floatText(`<span style="color:#e8443a">+${HEALK()} ${adv() ? 'života' : 'srdce'}</span>`, hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))); efekt('objav', 0.5, 1.4); }
  else { for (const g of gems) if (!g.kind) g.pull = true; floatText('<span style="color:#7fd6ff">Magnet!</span>', hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))); efekt('objav', 0.6, 1.1); }
  persist();
}
function rollPickup(e) {
  const p = e.g.position;
  if (e.zb) { dropPickup(p, 'heart'); dropPickup(p, 'magnet'); return; }
  if (e.hb) { dropPickup(p, 'magnet'); return; }
  const r = Math.random();
  if (r < 0.012 && run.hearts < maxHearts()) dropPickup(p, 'heart');
  else if (r > 0.994) dropPickup(p, 'magnet');
}
function updateGems(dt) {
  const mag = 2.2 + (run.magnet || 0) * 1.3, hp = hero.position;
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i]; g.t += dt; g.m.rotation.y += dt * 3;
    const d = Math.hypot(g.m.position.x - hp.x, g.m.position.z - hp.z);
    if (!g.kind && (d < mag || g.pull)) { g.pull = true; const k = Math.min(1, dt * (6 + g.t * 4)); g.m.position.x += (hp.x - g.m.position.x) * k; g.m.position.z += (hp.z - g.m.position.z) * k; g.m.position.y += (hp.y + 1 - g.m.position.y) * k; }
    if (g.kind && d < 0.9) { room.remove(g.m); gems.splice(i, 1); pickUp(g.kind); continue; }
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
  const el = $('xp'); if (!el) return; el.classList.toggle('off', !adv()); if (!adv()) return;
  const L = run.lvl || 1, x = Math.floor(run.xp || 0), need = xpNeed(L); el.innerHTML = `<i><b style="width:${Math.round(x / need * 100)}%"></b></i><span>úroveň ${L} · ${x}/${need}</span>`;
}
function openLevelUp() {
  lvlQueue--; efekt('objav', 0.8, 1.15);
  // NOVÁ ÚROVEŇ: stĺp svetla nad čarodejníkom, znamienka sa rozletia, záblesk; číslo úrovne ako príklad (12 + 1 = 13)
  const hp0 = hero.position.clone();
  for (let k = 0; k < 6; k++) burst(hp0.clone().add(new THREE.Vector3(0, 0.3 + k * 0.6, 0)), 40, 1.2 + k * 0.3, [0xffd25a, 0x8dff98, 0x7fd6ff, 0xffffff][k % 4], 1.1);
  document.body.classList.remove('lvflash'); void document.body.offsetWidth; document.body.classList.add('lvflash');
  // ponuka: 3 veci do kalkulačky ALEBO 3 karty (balance.js levelOffers – vzácnosť silných vecí podľa úrovne)
  const cards = offer(run, Math.random, 6).map(id => ({ id, name: CARDS[id].name, text: CARDS[id].text(lvl(run, id) + 1) }));
  // Majster: mix modulov na palicu a VYLEPŠENÍ (pravidlá na čísla), každé miesto 55 % vylepšenie
  const pack = adv() && run.pack.wands ? (() => { const mods = wandOffers(run.lvl, run, Math.random, 3), its = itemOffers(run.lvl, run.pack, Math.random, 3), out = []; for (let k = 0; k < 3; k++) { const src = (Math.random() < 0.55 && its.length) || !mods.length ? its : mods; out.push(src.shift()); } out.forEach(o => { if (o.give.t === 'wmod') o.rar = modRar(o.give.m); }); return { items: out }; })() : levelOffers(run.lvl, run, Math.random, cards), offers = pack.items;
  // obrázok: karta → zdroj/karty/<id>.jpg, kláves → veľký znak z pixelového písma; rám a štítok podľa vzácnosti
  const KEYLAB = { p: '( )', s: '√', q: 'x²', c: 'x³', f: '!' };
  const art = o => { const g = o.give; if (g.t === 'item') return `<div class="lvart key itm">${o.icon}</div>`; if (g.t === 'wmod') return `<div class="lvart key">${pix(modLabel(g.m))}</div>`; if (g.t === 'pal') return `<div class="lvart"><img src="../zdroj/karty/palica-${g.k}.jpg" alt="" onerror="this.remove()"></div>`; if (g.t === 'card') return `<div class="lvart"><img src="../zdroj/karty/${g.id}.jpg" alt="" onerror="this.remove()"></div>`;
    const k = g.t === 'n' ? String(g.v) : g.t === 'o' ? g.v : g.t === 'spec' ? KEYLAB[g.k] : null; return k ? `<div class="lvart key">${pix(k)}</div>` : `<div class="lvart"><img src="../zdroj/karty/${g.t === 'heart' ? 'srdce' : g.t}.jpg" alt="" onerror="this.remove()"></div>`; };
  const LV = run.lvl - lvlQueue;
  const el = overlay(`Úroveň ${LV}`, `<div class="lvhead">${pix(`${LV - 1}+1=${LV}`)}</div><div class="lvsigns">${['+', '-', '×', '÷'].map((o, i) => `<i style="--i:${i}">${pix(o)}</i>`).join('')}</div><p class="sub">${adv() ? 'Vyber si vylepšenie alebo kameň na palicu.' : 'Vyber si kartu alebo kláves do kalkulačky.'}</p>
    <div class="lvopts">${offers.map((o, i) => `<button class="lvo panel r-${o.rar}" data-i="${i}" style="--rc:${RARITY[o.rar].col};--i:${i}"><em class="rar">${RARITY[o.rar].name}</em>${art(o)}<b>${o.title}</b><span>${o.text}</span></button>`).join('')}</div>`, 'small lvup');
  offers.forEach((o, i) => setTimeout(() => efekt('minca', 0.35, o.rar === 'l' ? 1.6 : o.rar === 'e' ? 1.35 : 1.1), 180 + i * 140));   // každá karta pri odkrytí cinkne, vzácnejšia vyššie
  if (offers.some(o => o.rar === 'l')) setTimeout(() => efekt('objav', 0.7, 1.6), 600);
  el.querySelectorAll('.lvo').forEach(b => b.onclick = () => {
    const o = offers[+b.dataset.i], g = o.give;
    if (g.t === 'wmod') { const r = acquireMod(run.pack, g.m); say(r === 'merge' ? `${modLabel(g.m)} sa spojil s rovnakým – silnejší!` : r === 'bag' ? `${modLabel(g.m)} je v ruksaku – vlož ho v Knihe.` : `${modLabel(g.m)} je v palici.`, 2500); if (r === 'bag') $('bBook').classList.add('pulse'); }
    else if (g.t === 'staff') run.pack.staff++;
    else if (g.t === 'pal') { if (run.pack.wands) { closeOverlay(); persist(); return gainWand(g.k); } run.pack.kind = g.k; run.energy = staffStats(run.pack).emax; }
    else if (g.t === 'star') { run.pack.stars = run.pack.stars || {}; run.pack.stars[g.v] = (run.pack.stars[g.v] || 0) + 1; }
    else if (g.t === 'magnet') run.magnet = (run.magnet || 0) + 1;
    else if (g.t === 'heart') { run.maxH = (run.maxH || 0) + 1; run.hearts += HEALK(); renderHearts(); }
    else if (g.t === 'item') { addItem(run.pack, g.id); if (g.id === 'zivot') run.hearts += 5; if (g.id === 'bateria') run.energy = (run.energy || 0) + 4; renderHearts(); renderItems(); }
    else if (g.t === 'spec') { specAdd(run.pack.unlock, g.k); meta.unlock[g.k] = true; }
    else if (g.t === 'card') { closeOverlay(); addCard(g.id); return; }
    else { for (let k = 0; k < (o.n || 1); k++) addToken(run.pack, g); if (g.t === 'n') mergeNumbers(g.v); }
    persist(); closeOverlay(); if (['n', 'o', 'spec'].includes(g.t)) $('bBook').classList.add('pulse'); else say(`${o.title}!`, 1500);
    // prvý nový kláves v behu: rovno otvor Knihu, nech ho hráč vloží do vzorca (potom už len vylepšuje)
  });
}
// PALICA OD VODCU (Majster): výber 1 z 2 palíc, ktoré ešte nemáš; každá má viac jamiek a vlastné pravidlá na čísla
let wandQ = 0;
const ruleText = rule => Object.entries(rule || {}).map(([id, n]) => ITEMS[id] ? ITEMS[id].text(n) : '').filter(Boolean).join(' · ');
function openWandChoice() {
  wandQ--; efekt('objav', 0.8, 1.3);
  // 2 palice náhodne podľa vzácnosti (v ďalších zónach vzácnejšie); aj rovnaký druh, aký už máš – palíc môže byť viac
  const RW = { b: 1, v: 1, e: 0.5 + 0.2 * run.zone, l: 0.15 + 0.15 * run.zone }, pool = Object.keys(STAFF_MODELS).filter(k => k !== 'zakladna').map(k => ({ k, w: RW[STAFF_RAR[k]] })), pick = [];
  while (pick.length < 2 && pool.length) { const sum = pool.reduce((a, b) => a + b.w, 0); let r = Math.random() * sum, i = pool.findIndex(p => (r -= p.w) <= 0); if (i < 0) i = pool.length - 1; pick.push(pool.splice(i, 1)[0].k); }
  const P = run.pack, full = P.wands.length >= MAX_WANDS;
  const el = overlay('Palica od vodcu', `<p class="sub">Vodca pustil palice. Vyber si jednu${full ? ' – máš ich už ' + MAX_WANDS + ', jednu vymeníš' : ` – bude tvoja ${P.wands.length + 1}. palica`}.</p>
    <div class="lvopts wchoice">${pick.map((k, i) => { const m = STAFF_MODELS[k], n = WAND_SLOTS[k] || 3; return `<button class="lvo panel r-${STAFF_RAR[k]}" data-k="${k}" style="--rc:${RARITY[STAFF_RAR[k]].col};--i:${i}"><em class="rar">${RARITY[STAFF_RAR[k]].name}</em><div class="lvart"><img src="../zdroj/karty/palica-${k}.jpg" alt=""></div><b>Palica ${m.name}</b><i class="dots">${'<u></u>'.repeat(n)}</i><span>${n} jamky · rýchlosť ×${+(1 / m.cd).toFixed(2)} · sila ×${m.dmg}${m.shots > 1 ? ' · 2 ciele' : ''}</span><span class="rule">${ruleText(m.rule) || m.text}</span></button>`; }).join('')}</div>
    <div class="acts"><button class="btn ghost" id="skip">${icon('coin')} Radšej 10 mincí</button></div>`, 'small lvup');
  el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { closeOverlay(); gainWand(b.dataset.k); });
  el.querySelector('#skip').onclick = () => { closeOverlay(); addCoins(10, hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))); persist(); };
}
// získaná palica: do voľného miesta, inak výber, ktorú vymeniť (moduly prejdú na novú)
function gainWand(k) {
  const P = run.pack, i = addWand(P, k);
  if (i != null) { persist(); say(`Palica ${STAFF_MODELS[k].name} je ${i + 1}. palica – vlož do nej kamene v Knihe.`, 3500); $('bBook').classList.add('pulse'); return; }
  const el = overlay('Ktorú vymeníš?', `<p class="sub">Máš ${MAX_WANDS} palice. Kamene zo starej prejdú na Palicu ${STAFF_MODELS[k].name}.</p>
    <div class="repl">${P.wands.map((w, j) => `<button class="krow wrow" data-j="${j}"><img class="kimg" src="../zdroj/karty/palica-${w.kind}.jpg" alt=""><span class="kbar">${w.slots.map(m => `<i class="gem${m.t === 'num' ? ' base' : ''}" style="--c:${m.t === 'num' ? 'var(--line)' : OPCOL2[m.o]}">${pix(modLabel(m))}</i>`).join('')}</span></button>`).join('')}</div>
    <div class="acts"><button class="btn ghost" id="keep">Nechať si staré</button></div>`, 'small wandsbook');
  el.querySelectorAll('[data-j]').forEach(b => b.onclick = () => { replaceWand(P, +b.dataset.j, k); persist(); closeOverlay(); say(`Palica ${STAFF_MODELS[k].name}!`, 2500); });
  el.querySelector('#keep').onclick = () => { closeOverlay(); addCoins(10, hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))); };
}
// ---------- PALICA ZBLÍZKA (Majster): obraz sa rozmaže, zospodu sa vysunie palica s kalkulačkou; kamene z ruksaku = klávesy ----------
// koliesko / šípky / ◀ ▶ = ďalšia palica; ťuk na kláves = vloží kameň (číslo vymení základ); ⌫ = posledný späť do ruksaku; C = všetko späť
let staffI = 0, staffDir = 0, staffHit = false;
// ILUSTROVANÉ PALICE (Gemini → nastroje/palica.py → dither): obrázok + poloha okienok displeja a klávesov v %
const STAFF_ART = { zakladna: 'pocitadlo2', tazka: 'monolit', graficka: 'graficka' }, ART = {};
for (const [k, f] of Object.entries(STAFF_ART)) fetch(`palice/${f}.json`).then(r => r.json()).then(j => { ART[k] = { ...j, img: `palice/${f}.png` }; }).catch(() => {});
const STAFF_DECO = {
  zakladna: '<path d="M18 40 C6 30 4 14 14 6 M14 6 l-6 2 M14 6 l2 -6 M242 40 C254 30 256 14 246 6 M246 6 l6 2" />',
  rychla: '<path d="M14 40 L-36 26 L-24 38 L-52 40 L-30 50 L-48 58 L-22 62 L-34 72 L14 70 Z M246 40 L296 26 L284 38 L312 40 L290 50 L308 58 L282 62 L294 72 L246 70 Z" />',
  tazka: '<rect x="-10" y="-8" width="280" height="24" /><circle cx="6" cy="4" r="4" /><circle cx="254" cy="4" r="4" /><circle cx="130" cy="4" r="4" />',
  dvojita: '<rect x="40" y="-34" width="64" height="30" /><rect x="156" y="-34" width="64" height="30" /><path d="M72 -4 v10 M188 -4 v10" />',
  vedecka: '<path d="M60 -6 l14 -26 l14 26 M116 -6 l14 -34 l14 34 M172 -6 l14 -26 l14 26" /><circle cx="130" cy="-40" r="5" />',
  graficka: '<rect x="-14" y="-60" width="288" height="56" /><polyline points="-6,-32 20,-50 46,-14 72,-52 98,-20 124,-44 150,-12 176,-48 202,-24 228,-46 254,-16" />',
};
// DRAHOKAM (ilustrácia z Gemini, nastroje/gemy.py): brús podľa živlu, farba živlu, znak vyrytý na plôške
const GEMCUT = { num: 4, '+': 0, '-': 3, '×': 7, '÷': 5, '√': 2, '²': 1, '³': 1, '!': 1, 'π': 6, 'e': 6, 'φ': 6 };
const gemArt = m => `<span class="gemart g${m.t === 'num' ? 4 : GEMCUT[m.o] ?? 0}" style="--c:${m.t === 'num' ? '#f2efe6' : OPCOL2[m.o]}">${pix(modLabel(m))}</span>`;
// palica ako ilustrácia: okienka displeja = jamky (svietia vložené kamene), klávesy = kamene z ruksaku, výsledok svieti na kryštáli
function artWand(A, w, n, r, cost, dir, still) {
  const P = run.pack, ccol = m => m.t === 'num' ? '#f2efe6' : OPCOL2[m.o], last = w.slots.filter(m => m && m.t === 'mod').pop();
  const wins = A.wins.slice(0, n).map((o, j) => { const m = w.slots[j]; return `<i class="aw${m ? ' on' : ''}" data-w="${j}" style="left:${o.c[0]}%;top:${o.c[1]}%;width:${o.w}%;height:${o.h}%;--c:${m ? ccol(m) : 'transparent'}">${m ? pix(modLabel(m)) : ''}</i>`; }).join('');
  const keys = A.keys.map((o, j) => `<i class="ak" data-k="${j}" style="left:${o.c[0]}%;top:${o.c[1]}%;width:${o.r * 2}%"></i>`).join('');   // klávesy len stlačí animácia pri vhodení kameňa
  const res = r ? shortNum(Math.round(r.value * 100) / 100) : '?';
  if (A.sockets && A.sockets.length) {   // OBJÍMKY: drahokamy sa vsádzajú priamo do kalkulačky, výsledok svieti na displeji
    const socks = A.sockets.slice(0, n).map((c, j) => { const m = w.slots[j]; return `<i class="asock${m ? ' on' : ''}" data-w="${j}" style="left:${c[0]}%;top:${c[1]}%;width:${A.sw}%">${m ? gemArt(m) : ''}</i>`; }).join('');
    const D = A.disp;
    return `<div class="svart big${dir ? (dir > 0 ? ' fr' : ' fl') : still ? ' still' : ''}" style="--g:${last ? OPCOL2[last.o] : '#f2efe6'};aspect-ratio:${A.w}/${A.h}">
      <img src="${A.img}" alt="">${socks}${keys}
      <b class="adisp" style="left:${D.c[0] - D.w / 2}%;top:${D.c[1] - D.h / 2}%;width:${D.w}%;height:${D.h}%"><small>${r ? wandSteps(boostSlots(P, w.slots)).replace(/ = [^=]+$/, '') : 'najprv číslo'}<br>⚡${cost}</small>${r ? pix(String(res)) : ''}</b>
      <span class="afn" style="top:${A.sockets[0][1] - 1}%;left:${Math.max(...A.sockets.map(c => c[0])) + A.sw / 2 + 2}%"><button class="btn sq" id="svback" title="posledný kameň späť do vaku">⌫</button><button class="btn sq" id="svclr" title="všetky kamene okrem čísla späť">C</button></span>
    </div>`;
  }
  return ` <div class="svart${dir ? (dir > 0 ? ' fr' : ' fl') : still ? ' still' : ''}" style="--g:${last ? OPCOL2[last.o] : '#f2efe6'};aspect-ratio:${A.w}/${A.h}">
    <img src="${A.img}" alt="">${wins}${keys}
    <b class="ares">${pix(String(res))}</b>
    <span class="aform">${r ? wandSteps(boostSlots(P, w.slots)) : 'najprv číslo'} · ⚡${cost}</span>
    <span class="afn"><button class="btn sq" id="svback" title="posledný kameň späť do vaku">⌫</button><button class="btn sq" id="svclr" title="všetky kamene okrem čísla späť">C</button></span>
  </div>`;
}
function openStaff(dir = 0) {
  tutStep(1); $('bBook').classList.remove('pulse');
  const P = run.pack, N = P.wands.length; staffI = Math.max(0, Math.min(N - 1, staffI)); staffDir = dir;
  const still = ovEl.classList.contains('staffview') && ovEl.classList.contains('show');   // prekreslenie po ťuku – palica sa nevysúva znova
  const w = P.wands[staffI], kind = wandKind(P, staffI), S = staffStats({ ...P, kind }), M = manaStats(P), n = wandSlots(P, staffI);
  const bs = boostSlots(P, w.slots), r = evalWand(bs), cost = wandCost(w.slots, P), col = RARITY[STAFF_RAR[kind] || 'b'].col;
  const tok = m => `<i style="--c:${m.t === 'num' ? 'var(--line)' : OPCOL2[m.o]}">${pix(modLabel(m))}</i>`;
  const lcd = !w.slots.length ? '<span class="blink">_</span>' : r ? `<i>${pix(r.text.replace(/-/g, '-'))}</i>` : w.slots.map(tok).join('');   // vzorec so zátvorkami (počíta sa zľava doprava)
  const holes = Array.from({ length: n }, (_, j) => `<u class="${w.slots[j] ? 'on' : ''}" style="--c:${w.slots[j] ? (w.slots[j].t === 'num' ? 'var(--line)' : OPCOL2[w.slots[j].o]) : 'transparent'}"></u>`).join('');
  const keys = '';   // klávesy kalkulačky nie sú inventár – kamene sú vo VAKU (spoločný pre všetky palice) a hádžu sa do kalkulačky
  const vak = Array.from({ length: Math.max(12, P.bag.length) }, (_, j) => { const m = P.bag[j]; return m ? `<button class="vs art" data-b="${j}" style="--c:${m.t === 'num' ? 'var(--line)' : OPCOL2[m.o]}" title="${m.t === 'mod' ? MOD[m.o].name + ': ' + MOD[m.o].text : 'základné číslo – palica ním začína'} · ⚡${modCost(m)}">${gemArt(m)}</button>` : '<i class="vs empty"></i>'; }).join('');
  const html = `<div class="sv">
    <div class="svtabs">${N > 1 ? '<button class="btn sq" id="svl">◀</button>' : ''}<button class="btn" id="svbag">Ruksak</button><button class="btn on">Palica ${staffI + 1}/${N}</button><button class="btn sq" id="svi" title="o palici">i</button>${N > 1 ? '<button class="btn sq" id="svr">▶</button>' : ''}</div>
    <div class="svinfo dpanel" hidden><b style="color:${col}">Palica ${S.name}</b><span>${n} jamky · rýchlosť ×${+(1 / S.cd).toFixed(2)} · sila ×${S.dmg}</span><span class="rule">${ruleText(S.rule) || S.text}</span><span>mana ⚡${M.emax} · +${+M.regen.toFixed(1)}/s</span></div>
    ${ART[kind] ? artWand(ART[kind], w, n, r, cost, dir, still) : `<div class="svwand k-${kind}${dir ? (dir > 0 ? ' fr' : ' fl') : still ? ' still' : ''}" style="--c:${col}">
      <svg class="svdeco" viewBox="-40 -70 340 160">${STAFF_DECO[kind] || ''}</svg>
      <div class="svcalc">
        <div class="svlcd"><div class="f">${lcd}</div><div class="r">${r ? '= ' + shortNum(Math.round(r.value * 100) / 100) : '?'}</div><div class="m">${r ? wandSteps(bs) : 'najprv číslo'} · ⚡${cost}</div></div>
        <div class="svholes">${holes}</div>
        <div class="svkeys">${keys || '<span class="empty">ruksak je prázdny – kamene dostaneš pri úrovni a u obchodníka</span>'}<button class="sk fn" id="svback" title="posledný kameň späť do ruksaku">⌫</button><button class="sk fn" id="svclr" title="všetky kamene okrem čísla späť">C</button></div>
      </div>
      <div class="svshaft"></div>
    </div>`}
    <div class="svvak"><div class="vk">${vak}</div></div>
    <p class="svhint">hoď kameň do kalkulačky (potiahni alebo ťukni) · ťuk na okienko = späť do vaku · ${N > 1 ? 'koliesko / ◀ ▶ = ďalšia palica · ' : ''}Esc zavrie</p>
  </div>`;
  const again = ovEl.classList.contains('staffview') && ovEl.classList.contains('show');
  const el = again ? ovEl : overlay('Palica', html, 'staffview');
  if (again) el.querySelector('.box').innerHTML = `<span class="ptag">Palica</span>${html}`;
  else { addX(() => { closeOverlay(); if (fight.on) renderInput(); }); if (!el._wheelOn) el._wheelOn = 1, el.addEventListener('wheel', ev => { if (!el.classList.contains('staffview')) return; ev.preventDefault(); if (Math.abs(ev.deltaY) < 8 || performance.now() - (el._wt || 0) < 250) return; el._wt = performance.now(); el._flip(ev.deltaY > 0 ? 1 : -1); }, { passive: false }); }
  const redo = () => { persist(); openStaff(); };
  const put = j => {
    const m = P.bag[j]; if (!m) return;
    if (m.t === 'num') { P.bag.splice(j, 1); if (w.slots[0]) P.bag.push(w.slots[0]); w.slots[0] = m; }
    else { if (!w.slots.length) { say('Najprv číslo – palica začína číslom.', 1800); return; } if (w.slots.length >= n) { say(`Palica má len ${n} jamky – ⌫ uvoľní miesto.`, 1800); return; } P.bag.splice(j, 1); w.slots.push(m); }
    efekt('minca', 0.4, 1.2 + w.slots.length * 0.08); staffHit = true; redo();
  };
  // VHADZOVANIE: chytíš kameň vo vaku a pustíš ho nad kalkulačkou (alebo len ťukneš) → naskočí do ďalšieho okienka
  el.querySelectorAll('.vs[data-b]').forEach(g => g.onpointerdown = ev => {
    ev.preventDefault(); const j = +g.dataset.b, r0 = g.getBoundingClientRect(), x0 = ev.clientX, y0 = ev.clientY; let ghost = null;
    const target = () => el.querySelector('.svart') || el.querySelector('.svcalc');
    const mv = e => { if (!ghost && Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return;
      if (!ghost) { ghost = g.cloneNode(true); ghost.classList.add('ghost'); ghost.style.width = r0.width + 'px'; ghost.style.height = r0.height + 'px'; document.body.appendChild(ghost); g.classList.add('lifted'); }
      ghost.style.transform = `translate(${e.clientX - r0.width / 2}px, ${e.clientY - r0.height / 2}px) scale(1.3) rotate(${(e.clientX - x0) * 0.06}deg)`;
      const t = target(), r = t && t.getBoundingClientRect(), over = r && e.clientX > r.left + r.width * 0.25 && e.clientX < r.right - r.width * 0.25 && e.clientY > r.top + r.height * 0.15 && e.clientY < r.top + r.height * (t.classList.contains('svart') ? 0.46 : 1); el.classList.toggle('dropok', !!over); };
    const up = e => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      const ok = el.classList.contains('dropok'); el.classList.remove('dropok'); if (ghost) { ghost.remove(); g.classList.remove('lifted'); }
      if (!ghost || ok) put(j); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  // ťuk na okienko = kameň späť do vaku (základné číslo sa dá len vymeniť)
  el.querySelectorAll('.aw[data-w], .asock[data-w]').forEach(b => b.onclick = () => { const k = +b.dataset.w; if (!w.slots[k] || k === 0) { if (k === 0) say('Základné číslo vymeníš tak, že hodíš do kalkulačky iné číslo.', 2200); return; } P.bag.push(...w.slots.splice(k, 1)); efekt('minca', 0.3, 0.9); redo(); });
  if (staffHit) { staffHit = false; const ks = el.querySelectorAll('.ak'); if (ks.length) ks[Math.floor(Math.random() * ks.length)].classList.add('hit'); const ws = el.querySelectorAll('.aw.on, .asock.on'); if (ws.length) ws[ws.length - 1].classList.add('drop'); }
  el.querySelector('#svback').onclick = () => { if (w.slots.length > 1) { P.bag.push(w.slots.pop()); efekt('minca', 0.3, 0.9); redo(); } };
  el.querySelector('#svclr').onclick = () => { if (w.slots.length > 1) { P.bag.push(...w.slots.splice(1)); efekt('minca', 0.3, 0.8); redo(); } };
  el.querySelector('#svbag').onclick = () => { closeOverlay(); openWands(); };
  el.querySelector('#svi').onclick = () => { const i = el.querySelector('.svinfo'); i.hidden = !i.hidden; };   // názov a pravidlo palice len ako info
  const flip = d => { if (N < 2) return; staffI = (staffI + d + N) % N; efekt('minca', 0.25, 0.7); openStaff(d); };
  if (el.querySelector('#svl')) { el.querySelector('#svl').onclick = () => flip(-1); el.querySelector('#svr').onclick = () => flip(1); }
  el._flip = flip;
}
// DRUHÁ PALICA (ľavá ruka B): vlastný riadok v Knihe, vlastná energia; komba medzi palicami v suboj.js
function giveSecondStaff() {
  const P = run.pack; P.kind2 = 'zakladna'; if (P.wands) { P.wands[1] = P.wands[1] || newWand(); P.bRow = 1; } else { if (P.rows.length < MAX_ROWS) P.rows.push([]); P.bRow = P.rows.length - 1; } run.energy2 = staffStats({ ...P, kind: 'zakladna' }).emax; renderHandBtn(); persist();
  setTimeout(() => { say('Druhá palica! Strieľa sama vedľa prvej. Moduly jej vložíš v Knihe.', 5000); $('bBook').classList.add('pulse'); }, 1200);
}
// ---------- OBCHODNÍK MAJSTRA (inšpirácia Balatro / Slay the Spire / Brotato) ----------
// 3 miesta (karta, kláves, palica) + 1 služba · ceny ako príklady (2 × 5) · zamiešať (2, 3, 4…) · gumovanie klávesu (5, 8, 11…)
// · zámok = vec ostane na ďalšiu návštevu · úrok pri odchode: 1 minca za každých 10 (najviac 5)
const RAR_PRICE = { b: 6, v: 10, e: 15, l: 24 };
function priceExpr(p, rng) {
  const f = []; for (let a = 2; a <= 9; a++) if (p % a === 0 && p / a >= 2 && p / a <= 9) f.push(`${a}×${p / a}`);
  const a = 1 + Math.floor(rng() * Math.min(9, p - 1)), d = 1 + Math.floor(rng() * 9);
  const opts = [...f, ...(p > 2 ? [`${a}+${p - a}`] : []), `${p + d}-${d}`];
  return opts[Math.floor(rng() * opts.length)];
}
function shopItems(rng) {
  const L = run.lvl || 1, items = [];
  const id = run.pack.wands ? null : offer(run, rng, 1)[0];   // Majster: namiesto kariet vylepšenia (pravidlá na čísla)
  if (run.pack.wands) for (const o of itemOffers(L, run.pack, rng, 2)) items.push({ kind: 'item', give: o.give, title: o.title, text: o.text, rar: o.rar, art: o.icon });
  if (id) items.push({ kind: 'card', id, title: CARDS[id].name, text: CARDS[id].text(lvl(run, id) + 1), rar: CARD_RAR[id] || 'v', art: `<img src="../zdroj/karty/${id}.jpg" alt="">` });
  const k = (run.pack.wands ? wandOffers(L, run, rng, 1) : calcOffers(L, run, rng, 1))[0];
  if (k && k.give.t === 'wmod') items.push({ kind: 'key', give: k.give, n: 1, title: k.title, text: k.text, rar: modRar(k.give.m), art: pix(modLabel(k.give.m)) });
  else if (k) { const KL = { p: '( )', s: '√', q: 'x²', c: 'x³', f: '!' }, g = k.give; items.push({ kind: 'key', give: g, n: k.n || 1, title: k.title, text: k.text, rar: rarityOf(k), art: pix(g.t === 'n' ? String(g.v) : g.t === 'o' ? g.v : g.t === 'spec' ? KL[g.k] : '+2') }); }
  const cur = STAFFS[run.pack.kind] || STAFFS.zakladna, better = run.pack.wands ? Object.entries(STAFFS).filter(([k]) => k !== 'zakladna').sort(() => rng() - 0.5) : Object.entries(STAFFS).filter(([, m]) => m.price > cur.price);   // Majster: palica navyše (najviac 4)
  if (better.length) { const [pk, m] = better[Math.floor(rng() * Math.min(2, better.length))]; items.push({ kind: 'pal', k: pk, title: `Palica ${m.name}`, text: `displej ${m.disp} · ⚡${m.emax} · +${m.regen}/s`, rar: STAFF_RAR[pk], price: m.price, art: `<img src="../zdroj/karty/palica-${pk}.jpg" alt="">` }); }
  const svc = [['heal', 'Srdiečko', 'doplní 1 srdce', 6, icon('heart')], ['slot', '+2 políčka', 'dlhší vzorec', slotPrice(run.pack), pix('+2')], ['row', 'Ďalšie kúzlo', 'nový riadok v Knihe', rowPrice(run.pack), icon('book')], ['lv', 'Lepšia palica', '+25 % damage, +15 % energie', staffPrice(run.pack), icon('star')]]
    .filter(([s]) => s === 'heal' ? run.hearts < maxHearts() : s === 'slot' ? run.pack.slots < MAX_SLOTS : s === 'row' ? run.pack.rows.length < MAX_ROWS : run.pack.staff < MAX_STAFF);
  if (run.zone >= 2 && !run.pack.kind2 && !run.pack.wands) svc.push(['hand2', 'Druhá palica', 'ľavá ruka B · komba', 30, pix('B')]);
  if (svc.length) { const [sk, t, x, p, a] = svc[Math.floor(rng() * svc.length)]; items.push({ kind: 'svc', s: sk, title: t, text: x, rar: 'b', price: p, art: a }); }
  const infl = 1 + 0.25 * (run.zone - 1);   // ceny rastú so zónou (ako Brotato) – mince stále niečo znamenajú
  for (const it of items) { it.price = Math.round((it.price || RAR_PRICE[it.rar] + (it.kind === 'card' && lvl(run, it.id) ? 4 : 0)) * infl); it.expr = priceExpr(it.price, rng); }
  if (run.shopLock) { const li = items.findIndex(i => i.kind === run.shopLock.kind); const lk = { ...run.shopLock, locked: true }; if (li >= 0) items[li] = lk; else items.unshift(lk); }
  return items;
}
function openMerchant(view = 'shop') {
  const S = run.shop = run.shop || { items: shopItems(Math.random), rr: 0 };
  const rrCost = [2, 3, 5, 7, 11, 13, 17, 19, 23][Math.min(8, S.rr)],   // zamiešať stojí prvočísla 2, 3, 5, 7…
     erCost = 5 + 3 * (run.erased || 0);
  const coinChip = `<span class="chip">${icon('coin')} <b>${run.coins}</b></span>`;
  if (view === 'erase') {
    if (run.pack.wands) {   // GUMOVANIE MODULOV: z palice (okrem základu) aj z ruksaku
      const P = run.pack, list = [...P.wands.flatMap((w, i) => w.slots.map((m, j) => ({ m, i, j })).filter(x => x.j > 0)), ...P.bag.map((m, j) => ({ m, j, bag: 1 }))];
      const el = overlay('Gumovanie', `<div class="shophead">${dia('crown', 'big')}<div><b>Vygumuj modul</b><p class="sub">Kratšia palica je lacnejšia na energiu. Modul zmizne natrvalo. Cena ${pix(String(erCost))}</p></div>${coinChip}</div>
        <div class="ergrid">${list.map((x, k) => `<button class="wm" data-k="${k}" style="--c:${x.m.t === 'num' ? 'var(--line)' : OPCOL2[x.m.o]}" ${run.coins < erCost ? 'disabled' : ''}>${pix(modLabel(x.m))}<small>${x.bag ? 'ruksak' : x.i ? 'palica B' : 'palica A'}</small></button>`).join('') || '<span class="sub">nemáš čo gumovať</span>'}</div>
        <div class="acts"><button class="btn ghost" id="back">◂ Späť</button></div>`, 'offer shopscr');
      el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const x = list[+b.dataset.k]; run.coins -= erCost; run.erased = (run.erased || 0) + 1; if (x.bag) P.bag.splice(x.j, 1); else P.wands[x.i].slots.splice(x.j, 1); renderCoins(); persist(); say('Vygumované.'); openMerchant(); });
      el.querySelector('#back').onclick = () => openMerchant(); addX(() => openMerchant()); return;
    }
    const used = allIds(run.pack), toks = run.pack.inv.filter(t => t.t === 'n' || t.t === 'o' || t.t === 'd');
    const el = overlay('Gumovanie', `<div class="shophead">${dia('crown', 'big')}<div><b>Vygumuj kláves</b><p class="sub">Kratší vzorec je silnejší. Vybraný kláves zmizne natrvalo. Cena ${pix(String(erCost))}</p></div>${coinChip}</div>
      <div class="ergrid">${toks.map(t => `<button class="ck ${t.t}${used.has(t.id) ? ' inuse' : ''}" data-er="${t.id}" ${run.coins < erCost ? 'disabled' : ''}>${pix(t.t === 'd' ? '?' : String(t.v))}</button>`).join('')}</div>
      <div class="acts"><button class="btn ghost" id="back">◂ Späť</button></div>`, 'offer shopscr');
    el.querySelectorAll('[data-er]').forEach(b => b.onclick = () => { const id = +b.dataset.er; run.coins -= erCost; run.erased = (run.erased || 0) + 1; run.pack.inv = run.pack.inv.filter(t => t.id !== id); run.pack.rows = run.pack.rows.map(r => r.filter(x => x !== id)); renderCoins(); persist(); say(workingRows(run).length ? 'Vygumované.' : 'Vygumované – oprav vzorec v Knihe, inak nevystrelíš.', 3500); openMerchant(); });
    el.querySelector('#back').onclick = () => openMerchant(); addX(() => openMerchant()); return;
  }
  const el = overlay('Obchod', `<div class="shophead">${dia('crown', 'big')}<div><b>Obchodník</b><p class="sub">„Cenu si musíš vyrátať sám.“</p></div>${coinChip}</div>
    <div class="shgrid">${S.items.map((it, i) => { const can = run.coins >= it.price && !it.sold;
      return `<div class="shi r-${it.rar}${it.sold ? ' sold' : ''}" style="--rc:${RARITY[it.rar].col}"><em class="rar">${it.kind === 'svc' ? 'Služba' : RARITY[it.rar].name}</em><div class="lvart${it.kind === 'key' ? ' key' : it.kind === 'item' ? ' key itm' : ''}">${it.art}</div><b>${it.title}</b><span>${it.text}</span>
        <button class="btn buy" data-buy="${i}" ${can ? '' : 'disabled'}>${it.sold ? 'predané' : `${icon('coin')} ${pix(it.expr)}`}</button>${it.kind !== 'svc' && !it.sold ? `<button class="lock${it.locked ? ' on' : ''}" data-lock="${i}" title="podržať na ďalšiu návštevu">${icon('lock')}</button>` : ''}</div>`; }).join('')}</div>
    <div class="acts"><button class="btn" id="rr" ${run.coins >= rrCost ? '' : 'disabled'}>Zamiešať · ${icon('coin')} ${rrCost}</button><button class="btn" id="er" ${run.coins >= erCost ? '' : 'disabled'}>Gumovanie · ${icon('coin')} ${erCost}</button><button class="btn ghost" id="close">Odísť${run.coins >= 10 ? ` · úrok +${Math.min(5, Math.floor(run.coins / 10))}` : ''}</button></div>`, 'offer shopscr');
  el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
    const it = S.items[+b.dataset.buy]; if (run.coins < it.price || it.sold) return;
    run.coins -= it.price; it.sold = true; if (it.locked) run.shopLock = null; renderCoins(); efekt('minca', 0.6, 1.1);
    if (it.kind === 'card') { persist(); closeOverlay(); return addCard(it.id, () => openMerchant()); }
    if (it.kind === 'key' && it.give.t === 'wmod') acquireMod(run.pack, it.give.m);
    else if (it.kind === 'key') { const g = it.give; if (g.t === 'spec') { specAdd(run.pack.unlock, g.k); meta.unlock[g.k] = true; } else { for (let q = 0; q < it.n; q++) addToken(run.pack, g); if (g.t === 'n') mergeNumbers(g.v); } }
    if (it.kind === 'item') { addItem(run.pack, it.give.id); if (it.give.id === 'zivot') run.hearts += 5; renderHearts(); renderItems(); }
    if (it.kind === 'pal') { if (run.pack.wands) { persist(); closeOverlay(); return gainWand(it.k); } run.pack.kind = it.k; run.energy = staffStats(run.pack).emax; }
    if (it.kind === 'svc') { if (it.s === 'hand2') { closeOverlay(); giveSecondStaff(); return; } else if (it.s === 'heal') { run.hearts = Math.min(maxHearts(), run.hearts + HEALK()); renderHearts(); } else if (it.s === 'slot') run.pack.slots += 2; else if (it.s === 'row') run.pack.rows.push([]); else run.pack.staff++; }
    persist(); say(`${it.title}!`); openMerchant();
  });
  el.querySelectorAll('[data-lock]').forEach(b => b.onclick = () => { const it = S.items[+b.dataset.lock]; const on = !it.locked; S.items.forEach(x => x.locked = false); it.locked = on; run.shopLock = on ? (({ sold, locked, ...x }) => x)(it) : null; persist(); openMerchant(); });
  el.querySelector('#rr').onclick = () => { run.coins -= rrCost; S.rr++; const keep = S.items.find(x => x.locked); S.items = shopItems(Math.random); if (keep) S.items = S.items.map(x => x.kind === keep.kind ? keep : x); renderCoins(); persist(); openMerchant(); };
  el.querySelector('#er').onclick = () => openMerchant('erase');
  const leave = () => { const n = Math.min(5, Math.floor(run.coins / 10)); closeOverlay(); if (n) { const c = run.coins; addCoins(n, hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))); say(`Úrok: ${c} ÷ 10 = ${n} ${n > 1 ? 'mince' : 'minca'}`, 3000); } run.shopDone = true; persist(); };
  el.querySelector('#close').onclick = leave; addX(leave);
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
  run.shop = null; run.shopDone = false;
  const f = makeFighter('innkeeper', 1, room); f.g.position.set(at[0], R.height(...at), at[1]); f.play('Idle');
  merchant = { f, t: sec, lab: label(icon('mug') + ' Obchodník', new THREE.Vector3(at[0], 2.6, at[1]), 'shop'), near: false };
  say(`Obchodník je tu na ${sec} s – choď k nemu.`, 3000); efekt('objav', 0.5, 0.8);
}
function updateMerchant(dt) {
  if (!merchant) return;
  const m = merchant, p = m.f.g.position; m.f.mixer.update(dt); m.t -= dt;
  m.f.g.rotation.y = Math.atan2(hero.position.x - p.x, hero.position.z - p.z);
  const d = Math.hypot(hero.position.x - p.x, hero.position.z - p.z);
  if (d < 1.6 && !m.near && !paused && !run.shopDone) { m.near = true; openShop(); } if (d > 2.6) m.near = false;
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
const ZOOM_OUT = 2.0;   // Lukáš 26. 10.: svet menší a magickejší (+ tilt-shift v kresba.js)   // Majster: kamera o 25 % ďalej – hordu vidno skôr (postavy ostávajú v pomere k svetu)
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
  kresbaBlur.uniforms.uBand.value = 0.07;   // tilt-shift: úzky ostrý pás (predloha petitjus)
  drawTags(camera); drawTele(camera); drawHeroSprite(dt); drawFighterSprites(dt);
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
// PRÍBEH: ukáže sa raz, až keď hráč prvýkrát vstúpi do hry (nie pri spustení appky); potom rovno hra
function showStory() { scrOn = true; paused = true; document.body.classList.add('scron'); $('menuScr').classList.add('hide'); introStage = 1; renderIntro(); $('introScr').classList.remove('hide'); }
$('introScr').addEventListener('pointerdown', e => {
  e.stopPropagation(); if (introStage < 1) return;
  introStage++;
  if (introStage > STORY.length) { meta.intro = 1; persist(); $('introScr').classList.add('hide'); return startGame(); }
  renderIntro();
});
// vstup do hry z menu (počká, kým sa dotiahnu modely)
let markLoaded; const loadedP = new Promise(r => { markLoaded = r; });
async function startGame() {
  if (!loaded) { say('Chvíľku, kreslím svet…', 1500); await loadedP; }
  if (!meta.intro) return showStory();
  $('menuScr').classList.add('hide'); $('introScr').classList.add('hide'); scrOn = false; paused = false; document.body.classList.remove('scron'); if (iOrb) { scene.remove(iOrb.m); iOrb = null; } snapCam = true; startSay();
}
const ZONE_NAMES = ['Les zbojníkov', 'Zasnežené hory', 'Dungeon', 'Sopka'];
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
    startGame();
  });
}
// ---------- NASTAVENIA: celá obrazovka, stiahnuť do mobilu (PWA) ----------
let installEvt = null;
// obraz: kontrast, jas, farebnosť (filter na plátne hry, uložené v prehliadači)
const VIEW_KEY = 'mm-view', view = Object.assign({ c: 100, b: 100, s: 100 }, load(VIEW_KEY, {}));
const applyView = () => { $('c').style.filter = `contrast(${view.c}%) brightness(${view.b}%) saturate(${view.s}%)`; };
applyView();
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
// appka v mobile: sw.js sa kontroluje vždy (bez HTTP cache); keď príde nový service worker, stránka sa raz obnoví → nová verzia hry
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !sessionStorage.getItem('mm-swr')) { sessionStorage.setItem('mm-swr', '1'); location.reload(); } });
}
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
if (!afterLoad) { $('introScr').classList.add('hide'); introStage = -1; showMenu(); }
hudba('uvod');   // hudba menu hrá od prvého dotyku, aj kým sa ešte dotiahne svet

// ---------- štart ----------
await Promise.all([loadProps(), loadFighters(), loadHero()]);
// NOVÝ ČARODEJNÍK (Gemini sprite → nastroje/carodejnik-sprite.py): pixelová postavička sa kreslí ostro navrch sveta;
// 3D model ostáva neviditeľný (nekreslí farbu), aby čarodejník stále vrhal tieň a svietil palicou
// MALINKÁ SILUETA (Lukáš 26. 10.: ako v predlohe – pár pixelov, nie detailná postava): 12 × 16 bodov nakreslených tu,
// k = tmavá, g = tmavosivá (tieň plášťa, palica), c = svetlo kryštálu; riadky: 0 chôdza, 1 státie (plášť veje), 2 kúzlo
// telo bez palice (12 × 16); palica sa kreslí zvlášť pod uhlom – nikdy zvislo pred sebou ako vychádzková palica (Lukáš 26. 10.)
const BODY = ['...kk.......', '....kk......', '....kkk.....', '...kkkkk....', '.kkkkkkkk...', '...kkgkk....', '...kkkkkk...', '..kkkkkkk...', '..kkkkkkk...', '.kkkkkkkk...', '.gkkkkkkk...', 'ggkkkkkkk...', '.kkkkkkkk...', '..kk..kk....', '..k....k....', '............'];
const LEGS = [['..kk..kk....', '..k....k....'], ['...kk.kk....', '...k...k....'], ['..kk..kk....', '.k.....k....'], ['..kkkk......', '..k..k......']];
// uhol palice od zvislice (° – kladný = špička dopredu), posun ruky, záblesk kryštálu
// spredu (ide dolu) a zozadu (ide hore) – 8 smerov: hore/dolu tieto, šikmo a bokom bočný pohľad (zrkadlený doľava)
const BODY_F = ['......kk........', '.....kkk........', '.....kkkk.......', '....kkkkkk......', '..kkkkkkkkkk....', '....kgkkgk......', '....kkkkkk......', '...kkkkkkkk.....', '...kkkkkkkk.....', '..kkkkkkkkkk....', '..kgkkkkkkgk....', '..kkkkkkkkkk....', '...kkkkkkkk.....', '....kk..kk......', '....k....k......', '................'];
const BODY_B = BODY_F.map((l, y) => y === 5 ? '....kkkkkk......' : y >= 7 && y <= 11 ? l.slice(0, 6) + 'gg' + l.slice(8) : l);
const LEGS_F = [['....kk..kk......', '....k....k......'], ['....kk..kk......', '.........k......'], ['....kk..kk......', '....k....k......'], ['....kk..kk......', '....k...........']];
// palica sa výrazne hýbe LEN pri výstrele (Lukáš 26. 10.); pri chôdzi a státí ju drží pokojne šikmo, pohupuje sa len s krokom
const POSE = [
  ...[[42, 0], [42, -1], [42, 0], [42, -1]].map(([a, dy], i) => ({ row: 0, i, a, dy })),               // chôdza bokom
  ...[[30, 0], [30, -1], [30, 0], [30, 0]].map(([a, dy], i) => ({ row: 1, i, a, dy })),                 // státie bokom
  ...[[-40, -1, 0], [25, -2, 1], [70, -1, 1], [90, 0, 2]].map(([a, dy, fl], i) => ({ row: 2, i, a, dy, fl })),   // kúzlo: rozmach → výpad → záblesk
  ...[0, 1, 2, 3].map(i => ({ row: 3, i, a: 18, dy: i % 2 ? -1 : 0, front: 1 })),                     // chôdza dolu (spredu)
  ...[0, 1, 2, 3].map(i => ({ row: 4, i, a: -18, dy: i % 2 ? -1 : 0, back: 1 })),                     // chôdza hore (zozadu)
];
const FR = POSE.map(P => {
  const B = P.front ? BODY_F : P.back ? BODY_B : BODY;
  const g = Array.from({ length: 16 }, (_, y) => (B[y] + '................').slice(0, 16).split(''));
  if (P.row === 0) { g[13] = (LEGS[P.i][0] + '....').split(''); g[14] = (LEGS[P.i][1] + '....').split(''); g[10][0] = P.i % 2 ? '.' : 'g'; }
  if (P.row === 1) { g[11][0] = P.i === 2 ? '.' : 'g'; g[10][0] = P.i === 2 ? 'g' : '.'; if (P.i === 2) g[0][3] = 'k'; }
  if (P.front || P.back) { g[13] = LEGS_F[P.i][0].split(''); g[14] = LEGS_F[P.i][1].split(''); }
  const hx = P.front || P.back ? 10.5 : 7.5, hy = 8 + P.dy, rad = P.a * Math.PI / 180, L = P.front || P.back ? 7 : 8, put = (x, y, ch) => { x = Math.round(x); y = Math.round(y); if (y >= 0 && y < 16 && x >= 0 && x < 16 && (ch !== 'k' || g[y][x] === '.')) g[y][x] = ch; };   // palica (w) aj cez telo – vidno ju vždy
  for (let t = 0.5; t <= L; t += 0.5) put(hx + Math.sin(rad) * t, hy - Math.cos(rad) * t, 'w');   // palica
  const tx = hx + Math.sin(rad) * (L + 1), ty = hy - Math.cos(rad) * (L + 1);
  put(tx, ty, 'c'); if (P.fl) { put(tx + 1, ty, 'c'); put(tx - 1, ty, 'c'); put(tx, ty + 1, 'c'); put(tx, ty - 1, 'c'); }
  if (P.fl === 2) { put(tx + 2, ty, 'c'); put(tx - 2, ty, 'c'); put(tx, ty + 2, 'c'); put(tx, ty - 2, 'c'); }
  if (!(P.front || P.back)) { g[8][7] = 'k'; g[8 + P.dy] && (g[8 + P.dy][8] = 'k'); }   // ruka drží palicu
  return g.map(r => r.join(''));
});
const SPR = { cw: 16, ch: 16, rows: 5 };
{ const cv = document.createElement('canvas'); cv.width = 64; cv.height = 80; const x = cv.getContext('2d'), PC = { k: '#211c21', g: '#4b434a', w: '#8c8089', c: '#fff6dc' };
  FR.forEach((f, i) => f.forEach((l, y) => [...l].forEach((ch, xx) => { if (PC[ch]) { x.fillStyle = PC[ch]; x.fillRect((i % 4) * 16 + xx, Math.floor(i / 4) * 16 + y, 1, 1); } })));
  SPR.url = cv.toDataURL(); window.__spr = SPR.url; SPR.tex = new THREE.CanvasTexture(cv); SPR.tex.magFilter = SPR.tex.minFilter = THREE.NearestFilter; SPR.tex.generateMipmaps = false; SPR.mesh = addSprite(SPR.tex, 64, 80); }
setLampLight(crystalLight);
const sprEl = document.createElement('div'); sprEl.id = 'hero2d'; document.body.appendChild(sprEl);
if (SPR) hero.traverse(o => { if (o.isMesh) { o.material.colorWrite = false; o.material.depthWrite = false; o.layers.disable(1); o.castShadow = false; } });
let sprT = 0, sprFlip = false; const sprLast = new THREE.Vector3(), sprA = new THREE.Vector3(), sprB = new THREE.Vector3();
const ghosts = Array.from({ length: 6 }, () => { const d = document.createElement('div'); d.className = 'hero2d-ghost'; document.body.appendChild(d); return d; }), trail = [];
let sprView = 'side';
function drawHeroSprite(dt) {
  if (!SPR || !R) { sprEl.style.display = 'none'; return; }
  const moved = hero.position.distanceTo(sprLast) / Math.max(dt, 1e-3);
  sprA.copy(hero.position).project(camera); const fx = (sprA.x + 1) / 2 * innerWidth, fy = (1 - sprA.y) / 2 * innerHeight;
  sprB.copy(sprLast).project(camera); const mdx = fx - (sprB.x + 1) / 2 * innerWidth, mdy = fy - (1 - sprB.y) / 2 * innerHeight;
  sprLast.copy(hero.position);
  const casting = heroLocked(), moving = moved > 0.6 && !casting;
  // SMER (8 smerov): kúzlo vždy bokom k cieľu; pri chôdzi hore = zozadu, dolu = spredu, inak bokom (doľava zrkadlo)
  if (casting && aim.p) { const lx = (aim.p.clone().project(camera).x + 1) / 2 * innerWidth; sprView = 'side'; if (Math.abs(lx - fx) > 2) sprFlip = lx < fx; }
  else if (moving && Math.hypot(mdx, mdy) > 0.3) { if (Math.abs(mdy) > Math.abs(mdx) * 1.3) sprView = mdy > 0 ? 'front' : 'back'; else { sprView = 'side'; sprFlip = mdx < 0; } }
  sprT += dt;
  const row = casting ? 2 : sprView === 'front' ? 3 : sprView === 'back' ? 4 : moving ? 0 : 1, fps = moving ? 9 : casting ? 10 : 4, col = (sprView !== 'side' && !moving && !casting) ? 0 : Math.floor(sprT * fps) % 4;
  sprB.copy(hero.position).add(new THREE.Vector3(0, 1.6, 0)).project(camera); const hpx = Math.abs((1 - sprB.y) / 2 * innerHeight - fy);
  const k = Math.max(1, Math.round(hpx / 16)), w = SPR.cw * k, h = SPR.ch * k, ax = row >= 3 ? 6.5 : 4.5, flip = row >= 3 ? false : sprFlip;   // celé pixely – ostrá silueta
  const css = (x, y) => `display:${inside ? 'none' : 'block'};background-image:url(${SPR.url});width:${w}px;height:${h}px;background-size:${SPR.cw * 4 * k}px ${SPR.ch * SPR.rows * k}px;background-position:${-col * SPR.cw * k}px ${-row * SPR.ch * k}px;transform-origin:${ax * k}px 50%;transform:translate(${x - ax * k}px, ${y - h * 0.94}px) scaleX(${flip ? -1 : 1})`;
  sprEl.style.display = 'none';
  // postavička vo vrstve s hĺbkou (kresba.js addSprite): zakryjú ju predmety pred ňou
  { const M = SPR.mesh, U2 = M.material.uniforms, x0 = fx - (flip ? SPR.cw - ax : ax) * k, y0 = fy - h * 0.94;
    M.visible = !inside && !document.body.classList.contains('ovon'); M.position.set(x0 + w / 2, y0 + h / 2, 0); M.scale.set(w, -h, 1);
    U2.uFrame.value.set(col / 4, 1 - (row + 1) / SPR.rows, 1 / 4, 1 / SPR.rows); U2.uFlip.value = flip ? 1 : 0;
    sprB.copy(hero.position).add(new THREE.Vector3(0, 0.6, 0)).project(camera); U2.uDepth.value = sprB.z * 0.5 + 0.5; }
  // DASH je vidieť: za čarodejníkom ostávajú svetlé duchovia, ktorí doznejú
  if (G.dashing) trail.push({ x: fx, y: fy, t: 0, s: css(fx, fy) });
  for (const g of trail) g.t += dt; while (trail.length && (trail[0].t > 0.35 || trail.length > 6)) trail.shift();
  ghosts.forEach((d, i) => { const g = trail[i]; if (!g) { d.style.display = 'none'; return; } d.style.cssText = g.s + `;opacity:${(0.55 * (1 - g.t / 0.35)).toFixed(2)}`; });
}
buildInterior();
buildRoom();
resize(viewZoom); resizeKresba(); addEventListener('resize', () => { resize(viewZoom); resizeKresba(); });
renderHearts(); renderCoins(); renderStreak(); renderInput(); renderSlots(); renderXp(); renderHandBtn();
bottomEl.classList.add('hidden');
$('loading') && $('loading').remove();
loaded = true; markLoaded();
{ const v = $('veil'); if (v) { v.classList.toggle('day', !adv()); setTimeout(() => { v.classList.add('off'); setTimeout(() => v.remove(), 600); }, 250); } }   // clona zmizne až keď je svet nakreslený
for (const id of ['introScr', 'menuScr']) { $(id).classList.add('live'); $(id).classList.toggle('night', adv()); }   // za introm a menu beží živá scéna
const startSay = () => say(adv() ? 'Pohyb: WASD alebo šípky · klik = kúzlo z Knihy.' : run.w.camps.length === 0 && run.zone === 1 ? 'Ťukni na zem a choď. Svet je veľký – nájdi bandy zbojníkov a ich kľúče.' : 'Poraz bandy a nájdi kľúče od brány vodcu.', 4200);
if (afterLoad === 'game') startGame(); else if (afterLoad === 'menu') showMenu();
const clock = new THREE.Clock();
// SLUČKA: ďalší snímok sa naplánuje VŽDY (aj keď update spadne na chybe) – inak hra zamrzla; chyby sa zapíšu do localStorage 'mm-err' na ladenie
function logErr(e) { console.error(e); try { const L = JSON.parse(localStorage.getItem('mm-err') || '[]'); L.push({ t: new Date().toISOString(), m: String(e && e.stack || e).slice(0, 400) }); localStorage.setItem('mm-err', JSON.stringify(L.slice(-20))); } catch (_) {} }
addEventListener('error', ev => logErr(ev.error || ev.message)); addEventListener('unhandledrejection', ev => logErr(ev.reason));
function tick() { requestAnimationFrame(tick); if (G.over && G.endShown && !ovEl.classList.contains('show') && performance.now() - G.overT > 2500) { try { endScreen(); } catch (e) { logErr(e); } }   // strážca: koniec behu musí byť vidno
  const dt = Math.min(0.05, clock.getDelta()); simT += dt; try { update(dt, simT); } catch (e) { logErr(e); } try { draw(dt); } catch (e) { logErr(e); } }
let simT = 0;
requestAnimationFrame(tick);
// TESTOVACIA MAPA (Lukáš 26. 10.): index.html?test – bez hôrd, panel vľavo: 8 biómov, deň/tma, privolať hordu; na ladenie vzhľadu svetov
const TEST = new URLSearchParams(location.search).has('test'); let testHorde = false, testDark = null;
if (TEST) {
  const p = document.createElement('div'); p.id = 'testmap'; p.className = 'dpanel';
  p.innerHTML = `<b>Testovacia mapa</b>${BIOMES.map((b, i) => `<button class="btn" data-z="${i + 1}">${i + 1} · ${b.name}</button>`).join('')}<button class="btn" data-l="0">Deň</button><button class="btn" data-l="1">Tma</button><button class="btn" data-l="">Podľa sveta</button><button class="btn" id="tmh">Privolať hordu</button><button class="btn" id="tmw">Palice ×3 · π · e · φ</button>`;
  document.body.appendChild(p);
  p.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { closeOverlay(); run.hearts = Math.max(run.hearts, maxHearts()); run.zone = +b.dataset.z - 1; nextZoneWorld(); });
  p.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { testDark = b.dataset.l === '' ? null : +b.dataset.l; });
  p.querySelector('#tmh').onclick = () => { testHorde = true; hordeT = 0; };
  p.querySelector('#tmw').onclick = () => { run.pack.wands = [{ kind: 'zakladna', slots: [{ t: 'num', v: 7 }, { t: 'mod', o: '×', v: 3 }] }, { kind: 'zakladna', slots: [{ t: 'num', v: 5 }, { t: 'mod', o: 'π' }] }, { kind: 'zakladna', slots: [{ t: 'num', v: 9 }, { t: 'mod', o: 'e' }] }, { kind: 'zakladna', slots: [{ t: 'num', v: 8 }, { t: 'mod', o: 'φ' }] }]; persist(); say('4 palice: 7×3 · 5×π · 9×e · 8×φ – strieľajú na striedačku', 2500); };
}
// testovací háčik: __h.step(s) posunie hru o s sekúnd (Browser pane beží pomaly)
window.__h = {
  step(s) { for (let k = 0; k < s * 30; k++) { simT += 1 / 30; update(1 / 30, simT); } draw(1); },
  press, fight, camLook, get viewZoom() { return viewZoom; }, get run() { return run; }, get R() { return R; }, hero, openPack, chooseMode, get gates() { return gates; }, get bands() { return bands; }, tp(x, z) { hero.position.set(x, place.height(x, z), z); target = null; },
  walk(x, z) { target = new THREE.Vector3(x, 0, z); }, get goalDone() { return goalDone; }, get chests() { return chests; }, get bushes() { return bushes; }, get lock() { return lock; },
  kresbaMat, gameOver, spawnMerchant, mergeNumbers, openBook, openMap, openShop, cardOffer, closeOverlay, get paused() { return paused; }, nextZone: () => nextZoneWorld(), dropPickup: k => dropPickup(hero.position, k), setHorde(n) { hordeN = n; hordeT = 0.05; }, get dbg() { return { fadeT, lockOn, inside, locked: heroLocked(), over: G.over, target, fightOn: fight.on }; }, newRun() { run = newRun(); persist(); }, wandChoice() { wandQ++; }, get hordeLeft() { return hordeLeft; }, get magic() { return magic; },
};
