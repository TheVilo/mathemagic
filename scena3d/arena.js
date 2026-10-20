// Mathemagic – skúšobná aréna nového súboja (návrh).
// Bojovníci idú naraz z viacerých strán, každý má nad hlavou vlastný príklad. Napíšeš výsledok
// a kúzlo vyletí z kryštálu palice do toho, komu výsledok patrí. Nikto nečaká v rade.
// Druhy: Zbojník (rýchly, ľahký príklad), Rytier (štít = najprv doplň chýbajúce), Barbar (3 čísla, zblízka sa rozbehne),
// Strelec (stojí vzadu a strieľa šípy s príkladom – odpovedz a šíp zhorí). 5 správnych za sebou = reťazový blesk.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { genRoom, ROOMS, mulberry32 } from './gen.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const PAPER = 0xd9d6ce;
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAPER);
scene.fog = new THREE.Fog(PAPER, 26, 60);
const VIEW = 6.2;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const U = { time: { value: 0 } };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...o });
const IP = `
  #ifdef USE_INSTANCING
    vec3 ip = instanceMatrix[3].xyz;
  #else
    vec3 ip = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif`;
function animate(mat, code) {
  mat.onBeforeCompile = sh => { sh.uniforms.uTime = U.time; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + code); };
  mat.customProgramCacheKey = () => code;
  return mat;
}

// ---------- svetlo ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.25);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);

// ---------- čistinka (rovnaký generátor ako miestnosti, bossova miestnosť má veľkú čistinku) ----------
const SWAY = IP + `
  float hh = max(0.0, position.y);
  float sw = sin(uTime * 1.3 + ip.x * 0.2 + ip.z * 0.13) * 0.5 + sin(uTime * 2.7 + ip.z * 0.4) * 0.15;
  transformed.x += sw * 0.03 * hh * hh; transformed.z += sw * 0.02 * hh * hh;`;
const MAT = {
  ground: std(0xffffff, { flatShading: false, vertexColors: true }),
  grass: animate(std(0x5e5b55, { flatShading: false }), IP + `
    float h = position.y / 0.4;
    transformed.x += (sin(uTime * 1.8 + ip.x * 0.35 + ip.z * 0.25) * 0.5 + sin(uTime * 3.1 + ip.x * 1.3) * 0.18) * 0.12 * h * h;`),
  flower: animate(std(0xd43a3a, { emissive: 0x3a0505 }), IP + `
    transformed.x += sin(uTime * 1.8 + ip.x * 0.35 + ip.z * 0.25) * 0.025;`),
};
const GRASS = new THREE.BufferGeometry();
GRASS.setAttribute('position', new THREE.Float32BufferAttribute([-0.025, 0, 0, 0.025, 0, 0, 0.04, 0.4, 0], 3));
GRASS.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
const FLOWER = new THREE.IcosahedronGeometry(0.11, 0);

const KENNEY = ['log', 'log_large', 'log_stack', 'stump_old', 'stump_oldTall', 'stump_round', 'rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'rock_smallA', 'rock_smallB', 'rock_smallC', 'rock_smallFlatA', 'rock_tallA', 'rock_tallB',
  'statue_columnDamaged', 'statue_column', 'statue_obelisk', 'statue_block', 'campfire_stones', 'tent_smallClosed', 'plant_bush', 'plant_bushLarge', 'plant_bushSmall', 'mushroom_redGroup', 'mushroom_tanGroup', 'sign',
  'tree_oak', 'tree_detailed', 'tree_fat', 'tree_default', 'tree_cone', 'tree_pineDefaultA', 'tree_pineRoundB', 'tree_pineTallA', 'tree_thin', 'tree_tall', 'tree_simple'];
const KAYKIT = ['building_tower_A_blue', 'building_tower_B_blue', 'building_well_blue'];
const MODELS = {};
function prepMat(mat, sway, keepColor) {
  const m = mat.clone();
  m.flatShading = true; m.metalness = 0; m.roughness = 0.9;
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time;
    if (!keepColor) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))) * 1.05;');
    if (sway) sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY);
  };
  m.customProgramCacheKey = () => (sway ? 's' : '') + (keepColor ? 'c' : 'g');
  return m;
}
const loader = new GLTFLoader();
function loadProps() {
  const one = (name, url, scale) => new Promise(res => loader.load(url, g => {
    g.scene.updateMatrixWorld(true);
    const parts = [], sway = name.startsWith('tree_'), keep = name.startsWith('mushroom_red');
    g.scene.traverse(o => { if (o.isMesh) parts.push({ geo: o.geometry.clone().applyMatrix4(o.matrixWorld).scale(scale, scale, scale), mat: prepMat(o.material, sway, keep && /red/i.test(o.material.name + o.material.color.getHexString())) }); });
    MODELS[name] = parts; res();
  }, undefined, () => res()));
  const sc = n => n.startsWith('tree_') ? 3.1 : n.startsWith('statue_') ? 2.3 : n.startsWith('tent') || n.startsWith('campfire') ? 2.2 : n === 'sign' ? 2 : 1.7;
  return Promise.all([...KENNEY.map(n => one(n, `modely/priroda/${n}.glb`, sc(n))), ...KAYKIT.map(n => one(n, `modely/stavby/${n}.gltf`, 3.6))]);
}
let R;
function inst(geo, mat, items, shadow = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => { q.setFromAxisAngle(Y, it.r || 0); s.setScalar(it.s || 1); p.set(it.x, it.y ?? R.height(it.x, it.z), it.z); m.compose(p, q, s); mesh.setMatrixAt(i, m); });
  mesh.count = items.length; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.computeBoundingSphere();
  scene.add(mesh); return mesh;
}
const HERO = new THREE.Vector3();
function buildArena() {
  R = genRoom(1 + Math.floor(Math.random() * 9999), ROOMS - 1);
  const geo = new THREE.PlaneGeometry(R.W + 16, R.H + 16, (R.W + 16) * 2, (R.H + 16) * 2);
  geo.rotateX(-Math.PI / 2); geo.translate(R.W / 2, 0, R.H / 2);
  const pa = geo.attributes.position, col = new Float32Array(pa.count * 3), c1 = new THREE.Color(0xd8d4ca), c2 = new THREE.Color(0xe4e0d7), cc = new THREE.Color();
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i); pa.setY(i, R.height(x, z)); cc.copy(c1).lerp(c2, R.onPath(x, z) ? 1 : 0); col.set([cc.r, cc.g, cc.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, MAT.ground); ground.receiveShadow = true; scene.add(ground);
  HERO.set(R.camp.x - 5, 0, R.camp.z); HERO.y = R.height(HERO.x, HERO.z);
  const nearFight = (x, z) => x > HERO.x - 2 && Math.abs(z - HERO.z) < 9 && Math.hypot(x - HERO.x, z - HERO.z) < 11;
  inst(GRASS, MAT.grass, R.grass, false);
  inst(FLOWER, MAT.flower, R.flowers.map(f => ({ ...f, y: R.height(f.x, f.z) + 0.12 + f.s * 0.05 })));
  const byModel = {};
  for (const p of R.props) if (!(nearFight(p.x, p.z) && p.col > 0.35)) (byModel[p.m] = byModel[p.m] || []).push({ ...p, y: R.height(p.x, p.z) - 0.04 }); // v ceste bojovníkom nič vysoké
  for (const [name, items] of Object.entries(byModel)) for (const part of MODELS[name] || []) inst(part.geo, part.mat, items);
}

// ---------- postavy (KayKit Adventurers, CC0) ----------
// Bojovníci sú šedí ako čarodejník, len plášť majú červený – v ditheringu ostane ako farebný akcent.
function tone(mat, k) {
  mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n  diffuseColor.rgb = vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))) * ${k.toFixed(2)};`); };
  mat.customProgramCacheKey = () => 'tone' + k;
  return mat;
}
const KINDS = {
  rogue: { file: 'Rogue', name: 'Zbojník', keep: ['Knife', 'Knife_Offhand'], weapons: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'], h: 1.95, speed: 0.8, hp: 1, attack: 'Dualwield_Melee_Attack_Chop', walk: 'Running_B' },
  knight: { file: 'Knight', name: 'Rytier', keep: ['1H_Sword', 'Badge_Shield'], weapons: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', '2H_Sword'], h: 2.15, speed: 0.42, hp: 2, attack: '1H_Melee_Attack_Chop', walk: 'Walking_A', shield: true },
  barbarian: { file: 'Barbarian', name: 'Barbar', keep: ['2H_Axe'], weapons: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug'], h: 2.4, speed: 0.38, hp: 2, attack: '2H_Melee_Attack_Chop', walk: 'Walking_A', charge: true },
  hooded: { file: 'Rogue_Hooded', name: 'Strelec', keep: ['2H_Crossbow'], weapons: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'], h: 1.95, speed: 0.6, hp: 1, attack: '2H_Ranged_Shoot', walk: 'Walking_A', ranged: true },
};
const TPL = {};
const loadGlb = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
async function loadFighters() {
  await Promise.all(Object.entries(KINDS).map(async ([k, d]) => {
    const g = await loadGlb(`modely/bojovnici/${d.file}.glb`);
    const box = new THREE.Box3().setFromObject(g.scene);
    TPL[k] = { scene: g.scene, clips: g.animations, scale: d.h / (box.max.y - box.min.y) };
  }));
}

// čarodejník
const hero = new THREE.Group(); scene.add(hero);
const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: 0x6fd27a })); crystal.scale.y = 1.6;
const crystalLight = new THREE.PointLight(0x7dff8a, 1.6, 5, 1.6);
const crystalAnchor = new THREE.Object3D(); crystalAnchor.add(crystal, crystalLight);
let hMixer = null, hActs = {}, hCur = null, hLock = 0;
async function loadHero() {
  const g = await loadGlb('modely/Mage.glb'), m = g.scene, box = new THREE.Box3().setFromObject(m);
  m.scale.setScalar(2.1 / (box.max.y - box.min.y));
  m.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (['Spellbook', 'Spellbook_open', '1H_Wand'].includes(o.name)) { o.visible = false; return; }
    o.material = tone(o.material.clone(), 1.08);
    if (o.name === '2H_Staff') { // kryštál na špičke palice – odtiaľ letia kúzla
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox, tip = new THREE.Vector3();
      const ax = ['x', 'y', 'z'].reduce((a, k) => (b.max[k] - b.min[k] > b.max[a] - b.min[a] ? k : a), 'y');
      tip.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2); tip[ax] = b.max[ax];
      crystalAnchor.position.copy(tip); o.add(crystalAnchor);
      crystalAnchor.scale.setScalar(1 / o.getWorldScale(new THREE.Vector3()).x);
    }
  });
  hero.add(m);
  hMixer = new THREE.AnimationMixer(m);
  g.animations.forEach(a => { hActs[a.name] = hMixer.clipAction(a); });
  for (const n of ['Spellcast_Shoot', 'Hit_A', 'Cheer', 'Death_A']) { hActs[n].setLoop(THREE.LoopOnce); hActs[n].clampWhenFinished = true; }
  heroPlay('Idle');
}
function heroPlay(name, fade = 0.15, lock = 0) {
  const a = hActs[name]; if (!a) return;
  if (hCur === a && !lock) return;
  a.reset().fadeIn(fade).play(); if (hCur && hCur !== a) hCur.fadeOut(fade);
  hCur = a; hLock = lock;
}

// ---------- častice (farebné) ----------
const PMAX = 1400, pPos = new Float32Array(PMAX * 3), pVel = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true }));
points.frustumCulled = false; scene.add(points);
let pi = 0;
const tmpC = new THREE.Color();
function spark(p, vx, vy, vz, life, color) {
  const i = pi; pi = (pi + 1) % PMAX; tmpC.set(color);
  pPos.set([p.x, p.y, p.z], i * 3); pVel.set([vx, vy, vz], i * 3); pCol.set([tmpC.r, tmpC.g, tmpC.b], i * 3); pLife[i] = life;
}
function burst(p, n, speed, color, life = 0.9) {
  for (let s = 0; s < n; s++) { const a = Math.random() * 6.28, u = Math.random() * 2 - 1, r = speed * (0.4 + Math.random() * 0.6), q = Math.sqrt(1 - u * u); spark(p, Math.cos(a) * r * q, Math.abs(u) * r, Math.sin(a) * r * q, life * (0.6 + Math.random() * 0.6), color); }
}

// ---------- príklady (1. ročník: + a − do 10, doplň chýbajúce, tri čísla) ----------
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function makeProblem(kind) {
  const plus = Math.random() < 0.55;
  if (kind === 'easy') { // výsledok do 5–7
    if (plus) { const a = ri(1, 4), b = ri(1, 5 - a + 1); return { text: `${a}+${b}`, answer: a + b, op: '+' }; }
    const a = ri(2, 7), b = ri(1, a - 1); return { text: `${a}-${b}`, answer: a - b, op: '-' };
  }
  if (kind === 'missing') {
    if (plus) { const c = ri(3, 10), b = ri(1, c - 1); return { text: `?+${b}=${c}`, answer: c - b, op: '+' }; }
    const c = ri(4, 10), a = ri(1, c - 1); return { text: `${c}-?=${a}`, answer: c - a, op: '-' };
  }
  if (kind === 'three') {
    if (plus) { const a = ri(1, 4), b = ri(1, 4), c = ri(1, Math.max(1, 10 - a - b)); return { text: `${a}+${b}+${c}`, answer: a + b + c, op: '+' }; }
    const a = ri(2, 6), b = ri(1, 4), c = ri(1, a + b - 1); return { text: `${a}+${b}-${c}`, answer: a + b - c, op: '-' };
  }
  if (plus) { const a = ri(1, 9), b = ri(1, 10 - a); return { text: `${a}+${b}`, answer: a + b, op: '+' }; }
  const a = ri(3, 10), b = ri(1, a - 1); return { text: `${a}-${b}`, answer: a - b, op: '-' };
}
// výsledky na scéne sa nesmú biť (ani 1 a 10 naraz), aby kúzlo vždy vedelo, kam letieť
const clash = (a, b) => { const x = String(a), y = String(b); return x.startsWith(y) || y.startsWith(x); };
function freshProblem(kind, self) {
  let p;
  for (let k = 0; k < 60; k++) { p = makeProblem(kind); if (!targets().some(t => t !== self && t.p && clash(t.p.answer, p.answer))) break; }
  p.born = performance.now();
  return p;
}

// ---------- pixelové písmo ----------
const PIX = {
  '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111', '3': '11111000100010000010000011000101110',
  '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110', '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000',
  '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100', '+': '00000001000010011111001000010000000', '-': '00000000000000011111000000000000000',
  '=': '00000000001111100000111110000000000', '?': '01110100010000100010001000000000100', '←': '00000001000100011111010000010000000',
};
function pix(str) {
  const ch = [...String(str)]; let d = '';
  ch.forEach((c, k) => { const g = PIX[c]; if (g) for (let i = 0; i < 35; i++) if (g[i] === '1') d += `M${k * 7 + (i % 5)} ${(i / 5) | 0}h1v1h-1z`; });
  return `<svg class="pix" viewBox="0 0 ${ch.length * 7 - 2} 7" shape-rendering="crispEdges"><path d="${d}"/></svg>`;
}

// ---------- bojovníci ----------
const enemies = [], bolts = [];
const targets = () => [...enemies.filter(e => e.state !== 'dead'), ...bolts];
const tagsEl = document.getElementById('tags');
function makeTag(t, name) {
  const el = document.createElement('div'); el.className = 'tag';
  el.innerHTML = `${name ? `<div class="nm">${name}<span class="hp"></span></div>` : ''}<div class="pr"></div>`;
  tagsEl.appendChild(el); t.el = el; return el;
}
function renderTag(t) {
  const pr = t.el.querySelector('.pr'); pr.innerHTML = pix(t.p.text);
  t.el.classList.toggle('minus', t.p.op === '-');
  t.el.classList.toggle('shield', !!t.shield);
  const hp = t.el.querySelector('.hp'); if (hp) hp.innerHTML = (t.shield ? '<b class="sh"></b>' : '') + '<i></i>'.repeat(Math.max(0, t.hp));
}
function spawn(kind) {
  const d = KINDS[kind], tpl = TPL[kind], g = new THREE.Group(), m = skClone(tpl.scene);
  m.scale.setScalar(tpl.scale); g.add(m);
  const mats = [];
  m.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    if (d.weapons.includes(o.name) && !d.keep.includes(o.name)) { o.visible = false; return; }
    o.material = /_Cape$/.test(o.name) ? std(0xb83a34, { flatShading: false, emissive: 0x000000 }) : tone(o.material.clone(), 0.98);
    mats.push(o.material);
  });
  const others = enemies.filter(e => e.state !== 'dead').map(e => Math.atan2(e.g.position.z - HERO.z, e.g.position.x - HERO.x));
  let a = 0, best = -1;
  for (let k = 0; k < 12; k++) { const c = (Math.random() * 2 - 1) * 1.05, gap = Math.min(9, ...others.map(o => Math.abs(o - c))); if (gap > best) { best = gap; a = c; } }
  const r = d.ranged ? 11 : 11.5;
  g.position.set(HERO.x + Math.cos(a) * r, 0, HERO.z + Math.sin(a) * r);
  scene.add(g);
  const mixer = new THREE.AnimationMixer(m), acts = {};
  tpl.clips.forEach(c => { acts[c.name] = mixer.clipAction(c); });
  for (const n of [d.attack, 'Hit_A', 'Hit_B', 'Death_A', 'Block_Hit', 'Dodge_Backward', 'Cheer']) if (acts[n]) { acts[n].setLoop(THREE.LoopOnce); acts[n].clampWhenFinished = true; }
  const e = { kind, d, g, mats, mixer, acts, cur: null, state: 'walk', hp: d.hp, shield: !!d.shield, flash: 0, t: 0, shoot: 2.5 + Math.random() * 2, speedK: 1 };
  e.p = freshProblem(e.shield ? 'missing' : kind === 'rogue' ? 'easy' : kind === 'barbarian' ? 'three' : 'normal', e);
  makeTag(e, d.name); renderTag(e);
  play(e, d.walk);
  enemies.push(e);
  return e;
}
function play(e, name, fade = 0.15) {
  const a = e.acts[name]; if (!a || e.cur === a) return;
  a.reset().fadeIn(fade).play(); if (e.cur) e.cur.fadeOut(fade); e.cur = a;
}
function shootBolt(e) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a3a }));
  const light = new THREE.PointLight(0xff7a3a, 3, 4, 1.6); mesh.add(body, light);
  mesh.position.copy(e.g.position).add(new THREE.Vector3(0, 1.3, 0));
  scene.add(mesh);
  const b = { bolt: true, mesh, from: mesh.position.clone(), t: 0, dur: 9 };
  b.p = freshProblem('easy', b);
  makeTag(b); b.el.classList.add('bolt'); renderTag(b);
  bolts.push(b);
}
function removeBolt(b, hitHero) {
  const i = bolts.indexOf(b); if (i >= 0) bolts.splice(i, 1);
  scene.remove(b.mesh); b.el.remove();
  burst(b.mesh.position, hitHero ? 40 : 70, 3, hitHero ? 0xff7a3a : 0xffd25a, 0.7);
}

// ---------- kúzla (letia z kryštálu palice) ----------
const spells = [];
const COL = { '+': 0x8dff98, '-': 0x7fc8ff };
function cast(t, fast) {
  t.locked = true; t.el.classList.add('locked');
  const color = COL[t.p.op] || COL['+'];
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45) }));
  const light = new THREE.PointLight(color, 0, 9, 1.4); orb.add(light); orb.visible = false; scene.add(orb);
  spells.push({ t: 0, target: t, color, fast, orb, light, from: new THREE.Vector3() });
  heroPlay('Spellcast_Shoot', 0.08, 0.9);
  aim = t;
}
const targetPos = t => t.bolt ? t.mesh.position.clone() : t.g.position.clone().add(new THREE.Vector3(0, 1.1, 0));
function updateSpells(dt) {
  for (let i = spells.length - 1; i >= 0; i--) {
    const s = spells[i]; s.t += dt;
    const cw = crystal.getWorldPosition(new THREE.Vector3());
    if (s.t < 0.22) { // nabitie na kryštáli
      const k = s.t / 0.22;
      crystal.scale.set(1 + k, (1 + k) * 1.6, 1 + k); crystalLight.color.set(s.color); crystalLight.intensity = 3 + k * 14;
      for (let n = 0; n < 4; n++) { const a = Math.random() * 6.28, r = 0.9; spark(new THREE.Vector3(cw.x + Math.cos(a) * r, cw.y + (Math.random() - 0.5) * 0.8, cw.z + Math.sin(a) * r), -Math.cos(a) * 3.5, 0, -Math.sin(a) * 3.5, 0.25, s.color); }
      s.from.copy(cw);
    } else if (s.t < 0.22 + 0.34) { // let
      const k = (s.t - 0.22) / 0.34, e = k * k * (3 - 2 * k), to = targetPos(s.target);
      s.orb.visible = true; s.light.intensity = 14;
      s.orb.position.lerpVectors(s.from, to, e); s.orb.position.y += Math.sin(e * Math.PI) * 1.2;
      s.orb.scale.setScalar((s.fast ? 1.5 : 1) * (1 + Math.sin(s.t * 40) * 0.15));
      crystal.scale.set(1, 1.6, 1);
      for (let n = 0; n < (s.fast ? 8 : 5); n++) spark(s.orb.position, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 0.5, s.color);
    } else if (!s.hit) {
      s.hit = true; s.flash = 1;
      const p = targetPos(s.target);
      burst(p, s.fast ? 200 : 110, s.fast ? 6 : 4, s.color);
      burst(p, 30, 2, 0xffffff, 0.5);
      if (s.fast) shake = Math.max(shake, 0.35);
      hitTarget(s.target, s.fast);
    } else {
      s.flash -= dt * 3;
      s.orb.scale.setScalar(Math.max(0.001, s.flash * (s.fast ? 4 : 2.6))); s.light.intensity = Math.max(0, s.flash) * 30;
      if (s.flash <= 0) { scene.remove(s.orb); spells.splice(i, 1); }
    }
  }
}
function hitTarget(t, fast) {
  if (t.bolt) { removeBolt(t); return; }
  const e = t; e.locked = false; e.el.classList.remove('locked'); e.flash = 1;
  if (e.state === 'dead') return;
  if (fast) floatText('Rýchlo!', e);
  if (e.shield) { // štít padol, rytier ostáva
    e.shield = false; e.p = freshProblem('normal', e); renderTag(e);
    e.state = 'hit'; e.t = 0; play(e, 'Block_Hit', 0.05); e.knock = fast ? 1.6 : 0.8;
    floatText('Štít rozbitý!', e); return;
  }
  e.hp--;
  if (e.hp <= 0) {
    e.state = 'dead'; e.t = 0; play(e, 'Death_A', 0.05); e.el.remove();
    e.knock = fast ? 1.4 : 0.6;
    checkWave(); return;
  }
  e.p = freshProblem(e.kind === 'barbarian' ? 'three' : 'normal', e); renderTag(e);
  e.state = 'hit'; e.t = 0; play(e, 'Hit_A', 0.05); e.knock = fast ? 2 : 1; e.charging = false;
}

// reťazový blesk: 5 správnych za sebou → zasiahne všetkých naraz
const chains = [];
function chainLightning() {
  const from = crystal.getWorldPosition(new THREE.Vector3());
  say('Reťazový blesk!'); shake = 0.6;
  heroPlay('Spellcast_Shoot', 0.05, 1.1);
  let prev = from;
  for (const t of targets().filter(t => !t.locked)) {
    const to = targetPos(t), group = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0xfff27a });
    const pts = [prev.clone()];
    for (let k = 1; k < 7; k++) pts.push(prev.clone().lerp(to, k / 7).add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7)));
    pts.push(to.clone());
    for (let k = 0; k < pts.length - 1; k++) {
      const len = pts[k].distanceTo(pts[k + 1]), seg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, len), mat);
      seg.position.copy(pts[k]).lerp(pts[k + 1], 0.5); seg.lookAt(pts[k + 1]); group.add(seg);
    }
    const light = new THREE.PointLight(0xfff27a, 20, 8, 1.4); light.position.copy(to); group.add(light);
    scene.add(group); chains.push({ group, life: 0.45 });
    burst(to, 90, 5, 0xfff27a);
    hitTarget(t, true);
    prev = to;
  }
}

// ---------- vlny ----------
const WAVES = [
  [['rogue', 0], ['rogue', 2.5], ['rogue', 5]],
  [['rogue', 0], ['knight', 1.5], ['rogue', 5], ['rogue', 8]],
  [['hooded', 0], ['rogue', 2], ['barbarian', 4], ['rogue', 8], ['knight', 11]],
];
let wave = -1, queue = [], waveT = 0, hearts = 3, streak = 0, over = false, input = '', aim = null, shake = 0;
function startWave(n) {
  wave = n; waveT = 0; queue = WAVES[n].map(([k, at]) => ({ k, at }));
  document.getElementById('wave').innerHTML = `Vlna ${n + 1}/${WAVES.length}`;
  say(n === 0 ? 'Napíš výsledok – kúzlo letí k tomu, komu patrí.' : `Vlna ${n + 1}!`);
}
function checkWave() {
  if (queue.length || enemies.some(e => e.state !== 'dead')) return;
  for (const b of [...bolts]) removeBolt(b);
  if (wave + 1 < WAVES.length) setTimeout(() => startWave(wave + 1), 2200);
  else { over = true; heroPlay('Cheer', 0.2, 99); say('Víťazstvo! Všetky vlny porazené.'); document.getElementById('again').classList.remove('hidden'); }
}
function hurtHero() {
  if (over) return;
  hearts--; renderHearts(true); shake = 0.5; hurt = 1; streak = 0; renderStreak();
  heroPlay('Hit_A', 0.05, 0.7);
  burst(hero.position.clone().add(new THREE.Vector3(0, 1, 0)), 50, 3, 0xd43a3a, 0.6);
  if (hearts <= 0) { over = true; heroPlay('Death_A', 0.1, 99); say('Prehra. Skús to znova!'); document.getElementById('again').classList.remove('hidden'); }
}
function renderHearts(lost) { document.getElementById('hearts').innerHTML = [0, 1, 2].map(i => `<i class="heart ${i < hearts ? '' : 'off'} ${lost && i === hearts ? 'pop' : ''}"></i>`).join(''); }
function renderStreak() { document.getElementById('streak').innerHTML = '<span>Blesk</span>' + [0, 1, 2, 3, 4].map(i => `<i class="${i < streak ? 'on' : ''}"></i>`).join(''); }

// ---------- písanie výsledku ----------
const inpEl = document.getElementById('inp'), padEl = document.getElementById('pad');
function press(k) {
  if (over) return;
  if (k === '←') { input = input.slice(0, -1); return renderInput(); }
  if (!/^[0-9]$/.test(k)) return;
  input += k;
  const live = targets().filter(t => !t.locked);
  const exact = live.find(t => String(t.p.answer) === input);
  const longer = live.some(t => String(t.p.answer).length > input.length && String(t.p.answer).startsWith(input));
  if (exact && !longer) {
    const fast = performance.now() - exact.p.born < 3500 + (exact.p.text.length > 4 ? 2000 : 0);
    streak++; renderStreak();
    cast(exact, fast);
    input = ''; renderInput();
    if (streak >= 5) { streak = 0; setTimeout(() => { chainLightning(); renderStreak(); }, 450); }
    return;
  }
  if (!longer) { // taký výsledok tu nikto nemá
    streak = 0; renderStreak();
    inpEl.classList.remove('bad'); void inpEl.offsetWidth; inpEl.classList.add('bad');
    input = ''; renderInput(k); return;
  }
  renderInput();
}
function renderInput(wrong) {
  inpEl.innerHTML = wrong ? pix(wrong) : input ? pix(input) : '<span class="ph">napíš výsledok</span>';
  for (const t of targets()) t.el.classList.toggle('match', !!input && String(t.p.answer).startsWith(input) && !t.locked);
}
['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '←'].forEach(k => {
  const b = document.createElement('button'); b.dataset.k = k; b.innerHTML = pix(k); if (k === '←') b.className = 'del';
  b.addEventListener('pointerdown', e => { e.preventDefault(); press(k); });
  padEl.appendChild(b);
});
addEventListener('keydown', e => {
  const k = /^[0-9]$/.test(e.key) ? e.key : e.key === 'Backspace' ? '←' : null;
  if (!k) return;
  press(k); const b = [...padEl.children].find(x => x.dataset.k === k); if (b) { b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 110); }
});
document.getElementById('again').onclick = () => location.reload();
let msgT = 0;
const msgEl = document.getElementById('msg');
function say(text) { msgEl.textContent = text; msgEl.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => msgEl.classList.remove('show'), 2400); }
function floatText(text, e) {
  const v = e.g.position.clone().add(new THREE.Vector3(0, 2.6, 0)).project(camera), d = document.createElement('div');
  d.className = 'float'; d.textContent = text;
  d.style.left = (v.x + 1) / 2 * innerWidth + 'px'; d.style.top = (1 - v.y) / 2 * innerHeight + 'px';
  document.body.appendChild(d); setTimeout(() => d.remove(), 1100);
}

// ---------- dithering + rozmazanie do hĺbky (ako v hre) ----------
const LOW_H = 270;
const low = new THREE.WebGLRenderTarget(16, 16), dith = new THREE.WebGLRenderTarget(16, 16, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const ditherMat = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: low.texture }, uLow: { value: new THREE.Vector2() }, uHurt: { value: 0 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tScene; uniform vec2 uLow; uniform float uHurt; varying vec2 vUv;
    float bayer(vec2 p){ vec2 q = mod(p, 4.0); int i = int(q.x) + int(q.y) * 4; float b = 0.0;
      if (i==0) b=0.; else if (i==1) b=8.; else if (i==2) b=2.; else if (i==3) b=10.; else if (i==4) b=12.; else if (i==5) b=4.; else if (i==6) b=14.; else if (i==7) b=6.;
      else if (i==8) b=3.; else if (i==9) b=11.; else if (i==10) b=1.; else if (i==11) b=9.; else if (i==12) b=15.; else if (i==13) b=7.; else if (i==14) b=13.; else b=5.;
      return (b + 0.5) / 16.0; }
    void main(){
      vec2 px = floor(vUv * uLow);
      vec3 c = pow(max(texture2D(tScene, (px + 0.5) / uLow).rgb, 0.0), vec3(1.0 / 2.2));
      float th = bayer(px);
      vec3 ink = vec3(0.105, 0.11, 0.13), paper = vec3(0.87, 0.855, 0.82), col;
      float l = smoothstep(0.08, 0.92, dot(c, vec3(0.299, 0.587, 0.114)));
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
      if (sat > 0.32 && mx > 0.22) {
        vec3 hue = c / mx; float lit = clamp(mx * 1.15, 0.0, 1.0);
        col = lit > th * 0.9 ? mix(hue * 0.92, vec3(1.0, 0.98, 0.94), smoothstep(0.82, 1.0, mx) * 0.55) : mix(ink, hue * 0.4, 0.5);
      } else { float v = l * 2.0; float b = floor(v); float lv = b + (v - b > th ? 1.0 : 0.0); col = lv < 0.5 ? ink : lv < 1.5 ? mix(ink, paper, 0.5) : paper; }
      vec2 q = vUv - 0.5; float vig = smoothstep(0.18, 0.5, length(q));
      if (uHurt > 0.0 && vig * uHurt > th) col = mix(col, vec3(0.75, 0.2, 0.18), 0.6);
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const blurMat = new THREE.ShaderMaterial({
  uniforms: { tImg: { value: dith.texture }, uLow: { value: new THREE.Vector2() }, uFocus: { value: 0.5 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tImg; uniform vec2 uLow; uniform float uFocus; varying vec2 vUv;
    void main(){
      float dy = abs(vUv.y - uFocus); vec2 q = vUv - 0.5;
      float r = smoothstep(0.28, 0.6, dy) * 3.0 + dot(q, q) * 3.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 20; i++) { float fi = float(i), a = fi * 2.39996; acc += texture2D(tImg, vUv + vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 20.0) * r / uLow).rgb; }
      gl_FragColor = vec4(acc / 20.0 * (1.0 - dot(q, q) * 0.35), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ditherMat);
quadScene.add(quad);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  const a = innerWidth / innerHeight, v = a < 1 ? VIEW * 1.25 / a : VIEW; // na výšku vidno celú šírku boja
  camera.left = -v * a; camera.right = v * a; camera.top = v; camera.bottom = -v; camera.updateProjectionMatrix();
  const lw = Math.round(LOW_H * a);
  low.setSize(lw, LOW_H); dith.setSize(lw, LOW_H);
  ditherMat.uniforms.uLow.value.set(lw, LOW_H); blurMat.uniforms.uLow.value.set(lw, LOW_H);
}
addEventListener('resize', resize);

// ---------- slučka ----------
const toHero = new THREE.Vector3();
function update(dt, t) {
  U.time.value = t;
  // spomalenie, keď je niekto tesne pri tebe
  const danger = !over && (enemies.some(e => (e.state === 'walk' || e.state === 'charge') && e.g.position.distanceTo(hero.position) < 2.6) || bolts.some(b => b.mesh.position.distanceTo(hero.position) < 2.4));
  slow += ((danger ? 0.4 : 1) - slow) * (1 - Math.exp(-dt * 6));
  const edt = dt * slow;
  hurt = Math.max(0, hurt - dt * 1.2);
  ditherMat.uniforms.uHurt.value = Math.max(danger ? 0.45 : 0, hurt);

  // vlny
  if (wave >= 0 && !over) { waveT += dt; while (queue.length && queue[0].at <= waveT) spawn(queue.shift().k); }

  for (const e of enemies) {
    const pos = e.g.position; e.t += edt;
    toHero.subVectors(hero.position, pos).setY(0);
    const dist = toHero.length(); toHero.normalize();
    if (e.state !== 'dead') e.g.rotation.y = Math.atan2(toHero.x, toHero.z);
    if (e.knock > 0) { const k = Math.min(e.knock, edt * 6); pos.addScaledVector(toHero, -k); e.knock -= k; }
    if (e.state === 'walk' || e.state === 'charge') {
      if (e.d.charge && dist < 3.6 && e.state === 'walk') { e.state = 'charge'; play(e, 'Running_A'); floatText('Útok!', e); }
      const sp = e.d.speed * (e.state === 'charge' ? 2.6 : 1);
      if (e.d.ranged && dist < 7.6) { e.state = 'aim'; e.t = 0; play(e, '2H_Ranged_Aiming'); }
      else if (dist > 1.15) {
        pos.addScaledVector(toHero, sp * edt);
        for (const o of enemies) if (o !== e && o.state !== 'dead') { const dx = pos.x - o.g.position.x, dz = pos.z - o.g.position.z, dd = Math.hypot(dx, dz); if (dd < 1.1 && dd > 0.001) { pos.x += dx / dd * (1.1 - dd) * 0.5; pos.z += dz / dd * (1.1 - dd) * 0.5; } }
      } else if (!over) { e.state = 'attack'; e.t = 0; play(e, e.d.attack, 0.08); }
    } else if (e.state === 'attack') {
      if (e.t > 0.45 && !e.struck) { e.struck = true; hurtHero(); }
      if (e.t > 1.1) { e.struck = false; e.state = 'back'; e.t = 0; play(e, 'Walking_Backwards'); }
    } else if (e.state === 'back') { // po údere ustúpi a ide znova
      pos.addScaledVector(toHero, -1.6 * edt);
      if (e.t > 1.6) { e.state = 'walk'; play(e, e.d.walk); }
    } else if (e.state === 'aim') {
      e.shoot -= edt;
      if (e.shoot <= 0 && !over) { e.shoot = 6.5; play(e, e.d.attack, 0.05); e.cur.reset().play(); setTimeout(() => { if (e.state === 'aim') shootBolt(e); }, 300); }
      else if (e.cur === e.acts[e.d.attack] && !e.cur.isRunning()) play(e, '2H_Ranged_Aiming');
    } else if (e.state === 'hit') {
      if (e.t > 0.6) { e.state = e.d.ranged && dist < 7.8 ? 'aim' : 'walk'; play(e, e.state === 'aim' ? '2H_Ranged_Aiming' : e.d.walk); }
    } else if (e.state === 'dead') {
      if (e.t > 1.4) pos.y -= edt * 0.8;
      if (e.t > 3.2) e.g.visible = false;
    }
    if (e.state !== 'dead' || e.t < 1.4) pos.y = R.height(pos.x, pos.z);
    e.flash = Math.max(0, e.flash - dt * 4);
    for (const m of e.mats) if (m.emissive) m.emissive.setScalar(e.flash * 0.9);
    e.mixer.update(edt);
  }
  for (const b of [...bolts]) {
    b.t += edt;
    const to = hero.position.clone().add(new THREE.Vector3(0, 1.1, 0)), k = Math.min(1, b.t / b.dur);
    b.mesh.position.lerpVectors(b.from, to, k); b.mesh.lookAt(to);
    if (Math.random() < 0.6) spark(b.mesh.position, (Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4, 0.5, 0xff7a3a);
    if (k >= 1 && !b.locked) { removeBolt(b, true); hurtHero(); }
  }
  for (let i = chains.length - 1; i >= 0; i--) { const c = chains[i]; c.life -= dt; c.group.visible = Math.random() < 0.8; if (c.life <= 0) { scene.remove(c.group); chains.splice(i, 1); } }

  // čarodejník sa otáča k cieľu kúzla
  const look = aim && (aim.bolt ? aim.mesh : aim.g) ? targetPos(aim) : hero.position.clone().add(new THREE.Vector3(1, 0, 0));
  const want = Math.atan2(look.x - hero.position.x, look.z - hero.position.z);
  let dr = want - hero.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); hero.rotation.y += dr * (1 - Math.exp(-dt * 12));
  if (hMixer) {
    if (hLock > 0) hLock -= dt; else if (!over) heroPlay('Idle', 0.25);
    hMixer.update(dt);
  }
  crystal.rotation.y += dt * 1.5;
  if (!spells.length) { crystal.scale.set(1, 1.6, 1); crystalLight.color.set(0x7dff8a); crystalLight.intensity = 1.6 + streak * 1.2 + Math.sin(t * 4) * 0.3; }
  if (Math.random() < 0.3 + streak * 0.12) spark(crystal.getWorldPosition(new THREE.Vector3()), (Math.random() - 0.5) * 0.5, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5, 0.8, streak >= 3 ? 0xfff27a : 0x8dff98);
  updateSpells(dt);

  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -99; continue; }
    pLife[i] -= dt; pVel[i * 3 + 1] -= dt * 1.5;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  shake = Math.max(0, shake - dt * 1.6);
}
let slow = 1, hurt = 0;
const center = new THREE.Vector3();
function draw() {
  center.copy(HERO).add(new THREE.Vector3(4.2, 0.6, 0.4));
  const sh = new THREE.Vector3((Math.random() - 0.5) * shake * 0.5, (Math.random() - 0.5) * shake * 0.5, 0);
  camera.position.copy(center).add(new THREE.Vector3(0, 12.1, 17)).add(sh); camera.lookAt(center.clone().add(sh));
  sun.position.set(HERO.x - 15, HERO.y + 10, HERO.z + 8); sun.target.position.copy(HERO);
  const hv = hero.position.clone().add(new THREE.Vector3(0, 1, 0)).project(camera);
  blurMat.uniforms.uFocus.value = (hv.y + 1) / 2;
  // štítky s príkladmi nad hlavami
  for (const t of targets()) {
    const v = (t.bolt ? t.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)) : t.g.position.clone().add(new THREE.Vector3(0, t.d.h + 0.35, 0))).project(camera);
    t.el.style.transform = `translate(${(v.x + 1) / 2 * innerWidth}px, ${(1 - v.y) / 2 * innerHeight}px) translate(-50%, -100%)`;
  }
  renderer.setRenderTarget(low); renderer.render(scene, camera);
  quad.material = ditherMat; renderer.setRenderTarget(dith); renderer.render(quadScene, quadCam);
  quad.material = blurMat; renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
}

await Promise.all([loadProps(), loadFighters(), loadHero()]);
buildArena();
hero.position.copy(HERO); hero.rotation.y = Math.PI / 2;
resize(); renderHearts(); renderStreak(); renderInput();
document.getElementById('loading').remove();
const clock = new THREE.Clock();
function tick() { const dt = Math.min(0.05, clock.getDelta()); update(dt, clock.elapsedTime); draw(); requestAnimationFrame(tick); }
requestAnimationFrame(tick);
setTimeout(() => startWave(0), 1200);
let simT = 0;
window.__a = { step(s) { for (let k = 0; k < s * 30; k++) { simT += 1 / 30; update(1 / 30, simT); } draw(); }, press, get enemies() { return enemies; }, get bolts() { return bolts; }, targets, startWave };
