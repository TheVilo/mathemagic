// Mathemagic – zóna ako beh (roguelike): mapa so 7 krokmi, v každej miestnosti iný cieľ.
// Skúmanie = ťukneš na zem a čarodejník tam dôjde. Banda pri ohni = súboj na mieste (suboj.js).
// Kniha kúziel = karty, ktoré pridávajú efekty; krčma = obchod (interiér); vodca na konci dá nové znamienko.
import { THREE, scene, camera, U, sun, hemi, PAPER, MAT, GRASS, FLOWER, RAW, std, inst, placeModels, loadProps, spark, burst, updateParticles, ditherMat, blurMat, resize, setView, render, pix, icon, digitTexture } from './svet.js';
import { hero, loadHero, heroPlay, updateHero, heroLocked, loadFighters, makeFighter } from './postavy.js';
import { initFight, fight, startFight, fightPress, updateFight, drawTags, renderInput, endFight, aimPoint } from './suboj.js';
import { CARDS, SLOTS, lvl, offer, makeMap, ROOM_INFO } from './karty.js';
import { genRoom, mulberry32 } from './gen.js';
import { svetloDen, renderKresba, resizeKresba, kresbaMat, kresbaBlur } from './kresba.js';
import { points } from './svet.js';
points.layers.enable(4);   // iskry patria kúzlu

// ---------- stav behu a zbierka (localStorage) ----------
const RUN_KEY = 'mm-run', META_KEY = 'mm-meta';
function newRun() {
  const seed = 1 + Math.floor(Math.random() * 99999);
  return { seed, zone: 1, step: 0, map: makeMap(mulberry32(seed)), path: ['boj'], kind: 'boj', hearts: 3, coins: 0, cards: [], ops: ['+'], range: 5 };
}
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v || d; } catch (e) { return d; } };
let run = load(RUN_KEY, null); if (!run || !run.map || run.hearts <= 0) run = newRun(); // prehratý beh sa nepokračuje
const meta = load(META_KEY, { seen: [] });
const persist = () => { try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* bez ukladania */ } };
const maxHearts = () => 3 + lvl(run, 'srdce');

// ---------- UI ----------
const $ = id => document.getElementById(id);
const heartsEl = $('hearts'), coinsEl = $('coins'), goalEl = $('goal'), msgEl = $('msg'), padEl = $('pad'), inpEl = $('inp'), bottomEl = $('bottom'), ovEl = $('ov'), streakEl = $('streak'), labelsEl = $('labels');
function renderHearts(lost) { heartsEl.innerHTML = Array.from({ length: maxHearts() }, (_, i) => `<i class="heart ${i < run.hearts ? '' : 'off'} ${lost && i === run.hearts ? 'pop' : ''}"></i>`).join(''); }
function renderCoins(pop) { coinsEl.innerHTML = icon('coin', '#e8b040') + `<b>${run.coins}</b>`; if (pop) { coinsEl.classList.remove('pop'); void coinsEl.offsetWidth; coinsEl.classList.add('pop'); } }
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
function addCoins(n, at) { run.coins += n; renderCoins(true); if (at) floatText(icon('coin', '#e8b040') + '+' + n, at, 'coin'); }
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
let R = null, room = null, gate = null, band = [], chests = [], runes = [], bushes = [], labels = [], goalDone = false, lock = null, inside = false;
const roomRng = () => mulberry32(run.seed * 31 + run.zone * 997 + run.step * 7);

function label(html, pos, cls = '') { const el = document.createElement('div'); el.className = 'wlabel ' + cls; el.innerHTML = html; labelsEl.appendChild(el); const l = { el, pos }; labels.push(l); return l; }
function clearRoom() {
  if (room) scene.remove(room);
  for (const l of labels) l.el.remove();
  labels = []; band = []; chests = []; runes = []; bushes = []; lock = null;
  endFight();
}
function buildRoom() {
  clearRoom(); inside = false;
  scene.background.set(PAPER); scene.fog.color.set(PAPER); svetloDen();
  R = genRoom(run.seed + run.zone * 101, run.step, run.kind, { rune: run.step === 2 && run.range < 10 });
  room = new THREE.Group(); scene.add(room); G.room = room;
  // zem
  const geo = new THREE.PlaneGeometry(R.W + 16, R.H + 16, (R.W + 16) * 2, (R.H + 16) * 2);
  geo.rotateX(-Math.PI / 2); geo.translate(R.W / 2, 0, R.H / 2);
  const pa = geo.attributes.position, col = new Float32Array(pa.count * 3), c1 = new THREE.Color(0xd8d4ca), c2 = new THREE.Color(0xe4e0d7), cc = new THREE.Color();
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i); pa.setY(i, R.height(x, z)); cc.copy(c1).lerp(c2, R.onPath(x, z) ? 1 : 0); col.set([cc.r, cc.g, cc.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, MAT.ground); ground.receiveShadow = true; room.add(ground); ground.layers.enable(2);
  inst(room, GRASS, MAT.grass, R.grass, R.height, false).layers.enable(2);
  inst(room, FLOWER, MAT.flower, R.flowers.map(f => ({ ...f, y: R.height(f.x, f.z) + 0.12 + f.s * 0.05 })), R.height);
  placeModels(room, R.props, R.height);
  place = { height: R.height, inside: R.inside, blockers: R.props.filter(p => p.col).map(p => ({ x: p.x, z: p.z, r: p.col * p.s })), ground };
  buildGate();
  // banda sedí pri ohni; vodca stojí
  if (R.camp) {
    const c = R.camp;
    if (c.boss) { const f = makeFighter('barbarian', 1.5, room); f.g.position.set(c.x, R.height(c.x, c.z), c.z); f.g.rotation.y = -Math.PI / 2; f.play('2H_Melee_Idle'); band.push(f); }
    else c.types.slice(0, c.n).forEach((k, i) => {
      const f = makeFighter(k, c.elite && i === 0 ? 1.25 : 1, room), a = i / c.n * Math.PI * 2 + 0.4, x = c.x + Math.cos(a) * 1.7, z = c.z + Math.sin(a) * 1.7;
      f.g.position.set(x, R.height(x, z), z); f.g.rotation.y = Math.atan2(c.x + 1.2 - x, c.z + 1.5 - z); f.sitting = true; f.play('Sit_Floor_Idle'); band.push(f);
    });
  }
  // nálezy
  for (const f of R.finds) {
    if (f.kind === 'chest') { const ch = makeChest(); ch.position.set(f.x, R.height(f.x, f.z), f.z); ch.rotation.y = 0.3; room.add(ch); chests.push({ ...f, obj: ch, open: false }); place.blockers.push({ x: f.x, z: f.z, r: 0.55 }); }
    if (f.kind === 'rune') { const r = runeStone('10'); r.position.set(f.x, R.height(f.x, f.z), f.z); room.add(r); runes.push({ ...f, obj: r, done: false }); }
  }
  bushes = R.hides.map(h => ({ ...h, searched: false, shake: 0 }));
  if (R.building) label(icon('mug') + ' Krčma', new THREE.Vector3(R.building.door[0], 3.6, R.building.door[1] - 0.6), 'shop');
  if (run.kind === 'zamok') { const n = 4 + Math.floor(roomRng()() * (Math.min(run.range, 10) - 3)); lock = { n, a: null, solved: false }; lock.label = label(icon('lock') + pix(n), new THREE.Vector3(R.gate[0] - 0.6, 3.4, R.gate[1]), 'lock'); }
  goalDone = run.kind === 'obchod';
  hero.position.set(R.start[0], R.height(...R.start), R.start[1]); hero.rotation.y = Math.PI / 2;
  vel.set(0, 0, 0); target = null;
  renderGoal();
}
function renderGoal() {
  const info = ROOM_INFO[run.kind];
  goalEl.innerHTML = `<span class="st">${run.zone}·${run.step + 1}/7</span>` + (goalDone ? `<b class="ok">Brána je otvorená →</b>` : `<b>${info.goal}</b>`);
  goalEl.classList.toggle('done', goalDone);
}
// brána: dva kamenné stĺpy, medzi nimi bariéra, kým nie je cieľ miestnosti splnený
function buildGate() {
  gate = new THREE.Group();
  for (const dz of [-2.4, 2.4]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.7), MAT.stone); p.position.set(0, 1.3, dz); p.castShadow = true; gate.add(p);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.9), MAT.stone); cap.position.set(0, 2.7, dz); gate.add(cap);
  }
  const barrier = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 2.2).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8dff98, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  barrier.position.y = 1.1; gate.add(barrier);
  gate.userData = { barrier, open: 0 };
  gate.position.set(R.gate[0], R.height(...R.gate), R.gate[1]);
  room.add(gate);
}
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

// ---------- krčma (interiér z KayKit Dungeon) ----------
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
  for (const [x, c] of [[-0.6, 0xffa050], [IX + 3, 0xffc070]]) { const l = new THREE.PointLight(c, 18, 14, 1.4); l.position.set(x < 0 ? IX + x : x, 2.6, x < 0 ? -3.6 : 1.6); l.castShadow = false; interior.add(l); }
  // koberec pri dverách = von
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8dff98 })); rug.position.set(IX, 0.02, 4.1); interior.add(rug);
  innkeeper = makeFighter('innkeeper', 1, interior); innkeeper.g.position.set(IX - 0.6, 0, -3.2); innkeeper.play('Idle');
}
function enterInterior() {
  fade(() => {
    inside = true; room.visible = false; interior.visible = true;
    scene.background.set(0x15161a); scene.fog.color.set(0x15161a); hemi.intensity = 0.55; sun.intensity = 0.6;
    place = { height: () => 0, inside: (x, z) => x > IX - 5.4 && x < IX + 5.4 && z > -3.1 && z < 4.6, blockers: [{ x: IX - 0.6, z: -2, r: 1.6 }, { x: IX + 3.8, z: 2.2, r: 0.9 }], ground: interior.children[0] };
    hero.position.set(IX, 0, 2.6); hero.rotation.y = Math.PI; vel.set(0, 0, 0); target = null;
    labels.forEach(l => { l.el.style.display = 'none'; });
    goalEl.innerHTML = `<b>${icon('mug')} Krčma</b>`;
    shopNear = false;
  });
}
function exitInterior() {
  fade(() => {
    inside = false; interior.visible = false; room.visible = true;
    scene.background.set(PAPER); scene.fog.color.set(PAPER); svetloDen();
    place = { height: R.height, inside: R.inside, blockers: R.props.filter(p => p.col).map(p => ({ x: p.x, z: p.z, r: p.col * p.s })), ground: room.children[0] };
    hero.position.set(R.building.door[0], R.height(...R.building.door), R.building.door[1] + 2); vel.set(0, 0, 0); target = null;
    labels.forEach(l => { l.el.style.display = ''; });
    renderGoal();
  });
}

// ---------- prekryvné okná: karty, kniha, mapa, obchod, koniec ----------
let paused = false;
function overlay(html, cls = '') { ovEl.className = 'ov show ' + cls; ovEl.innerHTML = `<div class="box">${html}</div>`; paused = true; return ovEl; }
function closeOverlay() { ovEl.className = 'ov'; ovEl.innerHTML = ''; paused = false; }
function cardHtml(id, l = 0, extra = '') {
  const c = CARDS[id], next = Math.max(1, l);
  return `<div class="card" data-id="${id}" style="--c:${c.color}">${extra}<div class="ci">${icon(c.icon, c.color)}</div><b>${c.name}</b><p>${c.text(next)}</p><div class="lv">${[1, 2].map(i => `<i class="${i <= next ? 'on' : ''}"></i>`).join('')}</div></div>`;
}
// výber 1 z 3 (po súboji, z truhlice)
function cardOffer(title, after) {
  const ids = offer(run, roomRng());
  if (!ids.length) { addCoins(8); after && after(); return; }
  const el = overlay(`<h2>${title}</h2><p class="sub">Vyber si jedno kúzlo do Knihy.</p><div class="cards">${ids.map(id => cardHtml(id, lvl(run, id) + 1, lvl(run, id) ? '<em>úroveň 2</em>' : '')).join('')}</div><button class="ghost" id="skip">${icon('coin', '#e8b040')} Radšej 5 mincí</button>`, 'offer');
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
  renderHearts(); persist(); after && after();
}
function openBook(opts = {}) {
  const ops = ['+', '-', '×', '÷'].map(o => `<div class="op ${o === '+' || run.ops.includes(o) ? 'have' : ''}">${o === '+' || run.ops.includes(o) ? pix(o) : pix('?')}</div>`).join('');
  const ranges = [5, 10, 20].map(r => `<div class="rg ${run.range >= r ? 'have' : ''}">do ${r}</div>`).join('');
  const slots = Array.from({ length: SLOTS }, (_, i) => { const c = run.cards[i]; return c ? cardHtml(c.id, c.l).replace('class="card"', `class="card slot" data-slot="${i}"`) : `<div class="card empty" data-slot="${i}"><p>prázdne miesto</p></div>`; }).join('');
  const all = Object.keys(CARDS).map(id => meta.seen.includes(id) ? `<div class="mini" style="--c:${CARDS[id].color}" title="${CARDS[id].name}">${icon(CARDS[id].icon, CARDS[id].color)}<span>${CARDS[id].name}</span></div>` : `<div class="mini off">${pix('?')}<span>???</span></div>`).join('');
  const el = overlay(`<h2>${icon('heart', '#1c1d21')} Kniha kúziel</h2>
    ${opts.replace ? `<p class="sub warn">Kniha je plná. Ťukni na kúzlo, ktoré vymeníš za <b>${CARDS[opts.replace].name}</b>.</p>` : ''}
    <div class="sec"><h3>Znamienka</h3><div class="ops">${ops}</div><h3>Čísla</h3><div class="ranges">${ranges}</div></div>
    <div class="sec"><h3>Kúzla ${run.cards.length}/${SLOTS}</h3><div class="cards small">${slots}</div></div>
    <div class="sec"><h3>Zbierka ${meta.seen.length}/${Object.keys(CARDS).length}</h3><div class="minis">${all}</div></div>
    <button id="close">${opts.replace ? 'Nechať pôvodné' : 'Zavrieť'}</button>`, 'book');
  if (opts.replace) el.querySelectorAll('.card.slot').forEach(c => c.addEventListener('click', () => {
    const i = +c.dataset.slot; if (run.cards[i].id === 'srdce') run.hearts = Math.min(run.hearts, 3);
    run.cards[i] = { id: opts.replace, l: 1 }; if (opts.replace === 'srdce') run.hearts++;
    closeOverlay(); renderHearts(); persist(); say(`Nové kúzlo: ${CARDS[opts.replace].name}`); opts.after && opts.after();
  }));
  el.querySelector('#close').onclick = () => { closeOverlay(); opts.after && opts.after(); };
}
const NODE_ICON = { boj: 'swords', poklad: 'key', zamok: 'lock', elita: 'skull', obchod: 'mug', boss: 'crown' };
function openMap(choose) {
  const cols = run.map.map((opts, i) => {
    const nodes = opts.map(k => {
      const past = i < run.step && run.path[i] === k, cur = i === run.step && run.path[i] === k, pick = choose && i === run.step + 1;
      return `<button class="node ${past ? 'past' : ''} ${cur ? 'cur' : ''} ${pick ? 'pick' : ''} ${i < run.step && run.path[i] !== k ? 'skip' : ''}" data-k="${k}" ${pick ? '' : 'disabled'}>${icon(NODE_ICON[k])}<span>${ROOM_INFO[k].name}</span></button>`;
    }).join('');
    return `<div class="col">${nodes}</div>`;
  }).join('<div class="link"></div>');
  const el = overlay(`<h2>Zóna ${run.zone}: Lúka a les</h2><p class="sub">${choose ? 'Kam pôjdeš ďalej?' : 'Tvoja cesta k vodcovi zbojníkov.'}</p><div class="map">${cols}</div>${choose ? '' : '<button id="close">Zavrieť</button>'}`, 'mapov');
  if (choose) el.querySelectorAll('.node.pick').forEach(b => b.addEventListener('click', () => { closeOverlay(); goTo(b.dataset.k); }));
  else el.querySelector('#close').onclick = closeOverlay;
}
function goTo(kind) {
  run.step++; run.kind = kind; run.path[run.step] = kind; persist();
  fade(() => { buildRoom(); say(ROOM_INFO[kind].goal + '!'); });
}
function openShop() {
  const rng = mulberry32(run.seed + run.zone * 7 + run.step * 13), ids = offer(run, rng), price = id => (lvl(run, id) ? 14 : 10);
  const heal = run.hearts < maxHearts();
  const el = overlay(`<h2>${icon('mug')} Krčmár</h2><p class="sub">„Za mince ti predám kúzla. Čísla a znamienka si musíš vypočítať sám.“</p>
    <div class="cards">${ids.map(id => cardHtml(id, lvl(run, id) + 1, `<em class="price">${icon('coin', '#e8b040')} ${price(id)}</em>`)).join('')}</div>
    <div class="row"><button id="heal" ${heal && run.coins >= 6 ? '' : 'disabled'}>${icon('heart', '#d43a3a')} Srdiečko · ${icon('coin', '#e8b040')} 6</button><button class="ghost" id="close">Odísť od pultu</button></div>`, 'offer');
  el.querySelectorAll('.card').forEach(c => {
    const id = c.dataset.id; if (run.coins < price(id)) c.classList.add('poor');
    c.addEventListener('click', () => { if (run.coins < price(id)) { say('Nemáš dosť mincí.'); return; } run.coins -= price(id); renderCoins(); closeOverlay(); addCard(id); });
  });
  el.querySelector('#heal').onclick = () => { run.coins -= 6; run.hearts++; renderHearts(); renderCoins(); persist(); closeOverlay(); say('Srdiečko doplnené.'); };
  el.querySelector('#close').onclick = closeOverlay;
}
function gameOver() {
  G.over = true; endFight(); heroPlay('Death_A', 0.1, 99); bottomEl.classList.add('hidden');
  setTimeout(() => {
    const el = overlay(`<h2>Beh skončil</h2><p class="sub">Došiel si do zóny ${run.zone}, miestnosť ${run.step + 1}. Správne odpovede: <b>${G.stats.ok}</b>.</p><p class="sub">Kúzla v Zbierke ti ostávajú. Nový beh = nová mapa.</p><button id="again">Nový beh</button>`, 'end');
    el.querySelector('#again').onclick = () => { run = newRun(); persist(); location.reload(); };
  }, 1600);
}

// ---------- výhra v súboji ----------
function winFight(opts) {
  goalDone = true; renderGoal(); bottomEl.classList.add('hidden'); fight.on = false;
  setTimeout(() => heroPlay('Cheer', 0.2, 1.8), 700);
  const n = band.length;
  if (opts.boss) {
    const newOp = run.ops.includes('-') ? null : '-';
    if (newOp) run.ops.push(newOp);
    run.hearts = maxHearts(); renderHearts(); addCoins(20);
    persist();
    setTimeout(() => {
      const el = overlay(`<h2>Vodca porazený!</h2><div class="bigop">${pix(newOp || '+')}</div><p class="sub">${newOp ? 'Získal si nové znamienko: <b>mínus</b>. Odteraz kúzliš aj odčítaním.' : 'Zóna je hotová.'}</p><button id="next">Ďalej</button>`, 'end');
      el.querySelector('#next').onclick = () => { closeOverlay(); cardOffer('Odmena od vodcu', nextZone); };
    }, 2200);
    return;
  }
  setTimeout(() => addCoins(n * 2 + (opts.elite ? 8 : 0), hero.position.clone().add(new THREE.Vector3(0, 2.6, 0))), 700);
  persist();
  setTimeout(() => cardOffer(opts.elite ? 'Elita porazená!' : 'Banda porazená!', () => say('Brána je otvorená. Choď ďalej →')), 2200);
}
function nextZone() {
  run.zone++; run.step = 0; run.map = makeMap(mulberry32(run.seed + run.zone * 77)); run.path = ['boj']; run.kind = 'boj'; persist();
  fade(() => { buildRoom(); say(`Zóna ${run.zone}! Teraz aj mínus.`); });
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
    renderLock('good'); lockOn = false; lock.solved = true; goalDone = true; renderGoal();
    say(`Zámok otvorený! ${lock.a} + ${lock.b} = ${lock.n}`); heroPlay('Spellcast_Shoot', 0.1, 1);
    burst(gate.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 160, 5, 0x8dff98);
    lock.label.el.classList.add('done');
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
  keys[e.key.toLowerCase()] = true;
  const k = /^[0-9]$/.test(e.key) ? e.key : e.key === 'Backspace' ? '←' : null;
  if (k && (fight.on || lockOn)) { press(k); const b = [...padEl.children].find(x => x.dataset.k === k); if (b) { b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 110); } }
  if (e.key === 'Escape' && paused && !G.over && ovEl.querySelector('#close')) ovEl.querySelector('#close').click();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let target = null, tapMark = null;
$('c').addEventListener('pointerdown', e => {
  if (paused || fight.on || lockOn || !place.ground) return;
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObject(place.ground)[0];
  if (hit) { target = hit.point.clone(); tapMark = { p: hit.point.clone(), t: 0 }; }
});
$('bBook').onclick = () => { if (!paused && !fight.on) openBook(); };
$('bMap').onclick = () => { if (!paused && !fight.on) openMap(false); };
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
  if (dir.lengthSq()) target = null;
  else if (target) { dir.subVectors(target, hero.position).setY(0); if (dir.length() < 0.15) { target = null; dir.set(0, 0, 0); } }
  if (dir.lengthSq()) dir.normalize();
  if (fight.on || paused || lockOn || fadeT > 0 || G.over || heroLocked()) { dir.set(0, 0, 0); if (fight.on || G.over) target = null; }
  vel.lerp(dir.multiplyScalar(3.4), 1 - Math.exp(-dt * 8));
  const nx = hero.position.x + vel.x * dt, nz = hero.position.z + vel.z * dt;
  const ok = (x, z) => place.inside(x, z) && (inside || goalDone || x < R.gate[0] - 1.2) && place.blockers.every(b => (b.x - x) ** 2 + (b.z - z) ** 2 > b.r * b.r);
  if (ok(nx, nz)) { hero.position.x = nx; hero.position.z = nz; }
  else if (ok(nx, hero.position.z)) hero.position.x = nx;
  else if (ok(hero.position.x, nz)) hero.position.z = nz;
  else { vel.multiplyScalar(0.3); target = null; }
  hero.position.y = place.height(hero.position.x, hero.position.z);
  const speed = vel.length();
  const aim = aimPoint();
  const want = aim ? Math.atan2(aim.x - hero.position.x, aim.z - hero.position.z) : speed > 0.2 ? Math.atan2(vel.x, vel.z) : fight.on && band[0] ? Math.atan2(band[0].g.position.x - hero.position.x, band[0].g.position.z - hero.position.z) : hero.rotation.y;
  let dr = want - hero.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); hero.rotation.y += dr * (1 - Math.exp(-dt * 10));
  updateHero(dt, speed, fight.on);
  U.hero.value.copy(hero.position);

  if (fight.on || fight.enemies.length) updateFight(dt);
  if (!fight.on) for (const f of band) if (f.state !== 'dead' && !fight.enemies.includes(f)) f.mixer.update(dt);
  if (innkeeper && inside) innkeeper.mixer.update(dt);
  if (!inside && R) updateRoom(dt, t); else if (inside) updateInside();
  updateParticles(dt);
  if (tapMark) { tapMark.t += dt; tapRing.visible = tapMark.t < 0.5 && !fight.on; tapRing.position.copy(tapMark.p).setY(tapMark.p.y + 0.05); tapRing.scale.setScalar(1 + tapMark.t * 1.5); }
  shakeV = Math.max(0, shakeV - dt * 1.6); hurtV = Math.max(0, hurtV - dt * 1.2);
  kresbaMat.uniforms.uHurt.value = Math.max(G.danger && fight.on ? 0.45 : 0, hurtV);
  if (fadeT > 0) { fadeT += dt * 2; if (fadeT >= 1 && fadeCb) { const cb = fadeCb; fadeCb = null; cb(); snapCam = true; } if (fadeT >= 2) fadeT = 0; }
  kresbaMat.uniforms.uFade.value = fadeT > 0 ? (fadeT < 1 ? fadeT : 2 - fadeT) : 0;
}
function updateRoom(dt, t) {
  const hp = hero.position, busy = paused || fight.on || lockOn || fadeT > 0 || G.over;
  // brána
  const g = gate.userData; g.open += ((goalDone ? 1 : 0) - g.open) * (1 - Math.exp(-dt * 3));
  g.barrier.material.opacity = 0.55 * (1 - g.open) + Math.sin(t * 3.3) * 0.08 * (1 - g.open); g.barrier.visible = g.open < 0.97;
  if (busy) return;
  // banda si ťa všimne
  if (R.camp && !goalDone && Math.hypot(R.camp.x - hp.x, R.camp.z - hp.z) < (R.camp.boss ? 8.5 : 6.5)) {
    startFight(band, { boss: R.camp.boss, elite: R.camp.elite });
    bottomEl.classList.remove('hidden', 'lockmode'); target = null;
    say(R.camp.boss ? 'Vodca zbojníkov! Počítaj a kúzli.' : 'Banda! Napíš výsledok – kúzlo letí k tomu, komu patrí.', 3000);
    return;
  }
  // truhlice
  for (const c of chests) if (!c.open && hp.distanceTo(c.obj.position) < 1.5) {
    c.open = true; heroPlay('Interact', 0.1, 0.8);
    if (c.obj.userData.lid) c.anim = 0;
    burst(c.obj.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 80, 3, 0xffd25a);
    if (c.n === 0) setTimeout(() => addCoins(4 + Math.floor(Math.random() * 4), c.obj.position.clone().add(new THREE.Vector3(0, 1.5, 0))), 400);
    else setTimeout(() => cardOffer('Truhlica!', null), 700);
  }
  for (const c of chests) if (c.anim !== undefined && c.anim < 1) { c.anim = Math.min(1, c.anim + dt * 2.5); c.obj.userData.lid.rotation.x = -c.anim * 1.6; }
  // runa „do 10“
  for (const r of runes) {
    const u = r.obj.userData;
    if (!r.done) { u.stone.rotation.y = Math.sin(t * 1.2) * 0.25; u.stone.position.y = 0.95 + Math.sin(t * 2) * 0.06; u.light.intensity = 2.5 + Math.sin(t * 4); if (Math.random() < 0.15) spark(r.obj.position.clone().add(new THREE.Vector3(Math.random() - 0.5, 0.4, Math.random() - 0.5)), 0, 1.2, 0, 1, 0xffd25a); }
    if (!r.done && hp.distanceTo(r.obj.position) < 1.6) {
      r.done = true; run.range = Math.max(run.range, r.n); persist(); heroPlay('Cheer', 0.2, 1.6);
      burst(r.obj.position.clone().add(new THREE.Vector3(0, 1, 0)), 160, 4, 0xffd25a); u.halo.visible = false; u.light.intensity = 0;
      setTimeout(() => overlay(`<h2>Runa čísel!</h2><div class="bigop">${pix('10')}</div><p class="sub">Odteraz počítaš až do 10. Príklady budú väčšie – a kúzla silnejšie.</p><button id="close">Super</button>`, 'end').querySelector('#close').onclick = closeOverlay, 700);
    }
  }
  // kríky v pokladovej miestnosti: niečo sa v nich trblieta
  glintT -= dt;
  if (glintT <= 0) { glintT = 1.6; for (const b of bushes) if (!b.searched) burst(new THREE.Vector3(b.x + (Math.random() - 0.5), R.height(b.x, b.z) + 1 + Math.random() * 0.6, b.z + (Math.random() - 0.5)), 8, 1, 0xffd25a, 0.8); }
  for (const b of bushes) if (!b.searched && Math.hypot(b.x - hp.x, b.z - hp.z) < 1.7) {
    b.searched = true; heroPlay('Interact', 0.1, 0.8);
    const p = new THREE.Vector3(b.x, R.height(b.x, b.z) + 1.2, b.z);
    burst(p, 50, 2.5, 0x6f6c66, 0.6);
    if (b.key) {
      goalDone = true; renderGoal(); say('Kľúč! Brána je otvorená →');
      if (RAW.key) { const k = RAW.key.clone(true); k.scale.setScalar(1.6); k.position.copy(p); room.add(k); b.keyObj = k; b.kt = 0; }
      burst(p, 140, 4, 0xffd25a);
    } else if (Math.random() < 0.6) addCoins(2, p.clone().add(new THREE.Vector3(0, 0.8, 0)));
    else floatText('Nič…', p);
  }
  for (const b of bushes) if (b.keyObj) { b.kt += dt; b.keyObj.position.y = R.height(b.x, b.z) + 1.2 + Math.min(1.4, b.kt * 1.5); b.keyObj.rotation.y += dt * 3; if (b.kt > 1.8) { room.remove(b.keyObj); b.keyObj = null; } }
  // zámok pri bráne
  if (lock && !lock.solved && !lockOn && Math.hypot(R.gate[0] - hp.x, R.gate[1] - hp.z) < 3.4) openLock();
  if (lockOn && Math.hypot(R.gate[0] - hp.x, R.gate[1] - hp.z) > 4.5) { lockOn = false; bottomEl.classList.add('hidden'); }
  // krčma
  if (R.building && Math.hypot(R.building.door[0] - hp.x, R.building.door[1] - hp.z) < 1.3) enterInterior();
  // prechod bránou → mapa
  if (goalDone && hp.x > R.gate[0] - 0.3) {
    if (run.step + 1 >= run.map.length) return;
    hero.position.x = R.gate[0] - 1.2; target = null;
    openMap(true);
  }
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
  else if (R.camp && (fight.on || (fight.enemies.length && !goalDone))) {
    const c = R.camp; look = hero.position.clone().lerp(new THREE.Vector3(c.x, 0, c.z), 0.5); look.y = hero.position.y + 0.6; view = R.camp.boss ? 6.6 : 6.0;
  } else {
    const hw = viewZoom * innerWidth / innerHeight;
    look = new THREE.Vector3(Math.min(Math.max(hero.position.x, hw - 2), R.W - hw + 2), hero.position.y + 0.9, Math.min(Math.max(hero.position.z, 3), R.H - 3)); view = 5.2;
  }
  const kc = snapCam ? 1 : 1 - Math.exp(-dt * 2.6); snapCam = false;
  camLook.lerp(look, kc); if (!Number.isFinite(camLook.x + camLook.y + camLook.z)) camLook.copy(look);
  if (Math.abs(viewZoom - view) > 0.001) { viewZoom += (view - viewZoom) * kc; setView(viewZoom); }
  const sh = new THREE.Vector3((Math.random() - 0.5) * shakeV * 0.5, (Math.random() - 0.5) * shakeV * 0.5, 0);
  camPos.copy(camLook).add(new THREE.Vector3(0, 12.1, 17));
  camera.position.copy(camPos).add(sh); camera.lookAt(camLook.clone().add(sh));
  sun.position.set(hero.position.x - 15, hero.position.y + 10, hero.position.z + 8); sun.target.position.copy(hero.position);
  const hv = hero.position.clone().add(new THREE.Vector3(0, 1, 0)).project(camera);
  kresbaBlur.uniforms.uBand.value = fight.on ? 0.3 : 0.22;
  drawTags(camera);
  for (const l of labels) { const v = l.pos.clone().project(camera); l.el.style.transform = `translate(${(v.x + 1) / 2 * innerWidth}px, ${(1 - v.y) / 2 * innerHeight}px) translate(-50%, -100%)`; }
  $('streak').classList.toggle('hidden', !fight.on);
  renderKresba((hv.y + 1) / 2, hero.position);
}

// ---------- štart ----------
await Promise.all([loadProps(), loadFighters(), loadHero()]);
buildInterior();
buildRoom();
resize(viewZoom); resizeKresba(); addEventListener('resize', () => { resize(viewZoom); resizeKresba(); });
renderHearts(); renderCoins(); renderStreak(); renderInput();
bottomEl.classList.add('hidden');
$('loading').remove();
say(run.step === 0 && run.zone === 1 ? 'Ťukni na zem a choď. Pri ohni sedí banda zbojníkov…' : ROOM_INFO[run.kind].goal + '!', 3500);
const clock = new THREE.Clock();
function tick() { const dt = Math.min(0.05, clock.getDelta()); simT += dt; update(dt, simT); draw(dt); requestAnimationFrame(tick); }
let simT = 0;
requestAnimationFrame(tick);
// testovací háčik: __h.step(s) posunie hru o s sekúnd (Browser pane beží pomaly)
window.__h = {
  step(s) { for (let k = 0; k < s * 30; k++) { simT += 1 / 30; update(1 / 30, simT); } draw(1); },
  press, fight, camLook, get viewZoom() { return viewZoom; }, get run() { return run; }, get R() { return R; }, hero, goTo, tp(x, z) { hero.position.set(x, place.height(x, z), z); target = null; },
  walk(x, z) { target = new THREE.Vector3(x, 0, z); }, get goalDone() { return goalDone; }, get chests() { return chests; }, get bushes() { return bushes; }, get lock() { return lock; },
  openBook, openMap, closeOverlay, get paused() { return paused; }, get dbg() { return { fadeT, lockOn, inside, locked: heroLocked(), over: G.over, target, fightOn: fight.on }; }, newRun() { run = newRun(); persist(); },
};
