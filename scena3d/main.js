// Mathemagic 3D: zóna je rad miestností (obrazoviek), každá sa vypočíta zo semienka (gen.js).
// V každej je horda Slizkov; brána ďalej sa otvorí, až keď porazíš všetkých. Posledná miestnosť je Kráľ Slizko.
// Scéna má skutočné svetlo a tiene, potom dithering a rozmazanie do hĺbky (ostré je len pásmo okolo postáv).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { recordAnswer, createMathState } from '../js/math.js';
import { genRoom, ROOMS, mulberry32 } from './gen.js';

// ---------- uloženie (pri vstupe do miestnosti a po bossovi) ----------
const SAVE_KEY = 'mm-save';
let save = { seed: 1 + Math.floor(Math.random() * 9999), zone: 1, room: 0, numbers: [1, 2], coins: 0 };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.seed) save = s; } catch (e) { /* bez ukladania */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* bez ukladania */ } };

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const PAPER = 0xd9d6ce;
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAPER);
scene.fog = new THREE.Fog(PAPER, 26, 60);
const VIEW = 4.8;
let viewZoom = VIEW;
const camera = new THREE.OrthographicCamera(-VIEW * 16 / 9, VIEW * 16 / 9, VIEW, -VIEW, 0.1, 200);

const U = { time: { value: 0 }, hero: { value: new THREE.Vector3() }, vel: { value: new THREE.Vector3() } };
function animate(mat, code) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time; sh.uniforms.uHero = U.hero; sh.uniforms.uVel = U.vel;
    sh.vertexShader = 'uniform float uTime; uniform vec3 uHero; uniform vec3 uVel;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + code);
  };
  mat.customProgramCacheKey = () => code;
  return mat;
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...o });
const IP = `
  #ifdef USE_INSTANCING
    vec3 ip = instanceMatrix[3].xyz;
  #else
    vec3 ip = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif`;

// ---------- svetlo ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------- materiály a tvary miestnosti ----------
const SWAY = IP + `
  float hh = max(0.0, position.y);
  float sw = sin(uTime * 1.3 + ip.x * 0.2 + ip.z * 0.13) * 0.5 + sin(uTime * 2.7 + ip.z * 0.4) * 0.15;
  transformed.x += sw * 0.045 * hh * hh;
  transformed.z += sw * 0.02 * hh * hh;`;
const MAT = {
  ground: std(0xffffff, { flatShading: false, vertexColors: true }),
  grass: animate(std(0x5e5b55, { flatShading: false }), IP + `
    float h = position.y / 0.4;
    float wind = sin(uTime * 1.8 + ip.x * 0.35 + ip.z * 0.25) * 0.5 + sin(uTime * 3.1 + ip.x * 1.3) * 0.18;
    transformed.x += wind * 0.12 * h * h;
    vec2 d = ip.xz - uHero.xz; float k = smoothstep(1.1, 0.0, length(d));
    transformed.xz += normalize(d + 0.0001) * k * 0.3 * h; transformed.y -= k * 0.2 * h;`),
  flower: animate(std(0xd43a3a, { emissive: 0x3a0505 }), IP + `
    transformed.x += sin(uTime * 1.8 + ip.x * 0.35 + ip.z * 0.25) * 0.025;`),
  trunk: animate(std(0x5d5751), SWAY), leafDark: animate(std(0x6f6c66), SWAY), leafLight: animate(std(0x8b8780), SWAY), birch: animate(std(0xcfcac0), SWAY),
  rock: std(0x9a968f), stone: std(0xb1ada5),
};
const r2 = mulberry32(11);
const TREE = [
  { trunk: new THREE.CylinderGeometry(0.16, 0.26, 2.2, 7).translate(0, 1.1, 0), tm: MAT.trunk, leaf: mergeGeometries([0, 1, 2, 3, 4].map(k => { const a = k / 5 * Math.PI * 2; return new THREE.IcosahedronGeometry(0.9 + r2() * 0.5, 1).translate(Math.cos(a) * 0.6, 2.7 + r2() * 0.6, Math.sin(a) * 0.6); }).concat([new THREE.IcosahedronGeometry(1.1, 1).translate(0, 3.3, 0)])), lm: MAT.leafLight },
  { trunk: new THREE.CylinderGeometry(0.12, 0.2, 1.4, 6).translate(0, 0.7, 0), tm: MAT.trunk, leaf: mergeGeometries([0, 1, 2, 3].map(k => new THREE.ConeGeometry(1.5 - k * 0.3, 1.5, 8).translate(0, 1.6 + k * 0.85, 0).toNonIndexed())), lm: MAT.leafDark },
  { trunk: new THREE.CylinderGeometry(0.08, 0.12, 3.6, 6).translate(0, 1.8, 0), tm: MAT.birch, leaf: mergeGeometries([0, 1, 2, 3].map(k => new THREE.IcosahedronGeometry(0.55, 0).scale(0.8, 1.4, 0.8).translate((r2() - 0.5) * 0.7, 3.0 + k * 0.45, (r2() - 0.5) * 0.7))), lm: MAT.leafLight },
];
const GRASS = new THREE.BufferGeometry();
GRASS.setAttribute('position', new THREE.Float32BufferAttribute([-0.025, 0, 0, 0.025, 0, 0, 0.04, 0.4, 0], 3));
GRASS.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
const FLOWER = new THREE.IcosahedronGeometry(0.11, 0);
const ROCK = new THREE.DodecahedronGeometry(0.8, 0).scale(1, 0.7, 1);

// ---------- modely (Kenney Nature Kit + KayKit Medieval Hexagon, oba CC0) ----------
// Každý model sa rozloží na časti (geometria + materiál), farby sa prevedú do šedej; stromy sa kývu vo vetre.
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
    if (sway) sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY.replace(/0\.045/g, '0.03'));
  };
  m.customProgramCacheKey = () => (sway ? 's' : '') + (keepColor ? 'c' : 'g');
  return m;
}
function loadModels() {
  const loader = new GLTFLoader();
  const one = (name, url, scale) => new Promise(res => loader.load(url, g => {
    g.scene.updateMatrixWorld(true);
    const parts = [], sway = name.startsWith('tree_'), keep = name.startsWith('mushroom_red');
    g.scene.traverse(o => { if (o.isMesh) parts.push({ geo: o.geometry.clone().applyMatrix4(o.matrixWorld).scale(scale, scale, scale), mat: prepMat(o.material, sway, keep && /red/i.test(o.material.name + o.material.color.getHexString()) ) }); });
    MODELS[name] = parts; res();
  }, undefined, () => res()));
  // mierka podľa druhu (čarodejník má 2,1): stromy ~3,5–4,5, kamene a kmene menšie, stavby vyššie
  const sc = n => n.startsWith('tree_') ? 3.1 : n.startsWith('statue_') ? 2.3 : n.startsWith('tent') || n.startsWith('campfire') ? 2.2 : n === 'sign' ? 2 : 1.7;
  return Promise.all([...KENNEY.map(n => one(n, `modely/priroda/${n}.glb`, sc(n))), ...KAYKIT.map(n => one(n, `modely/stavby/${n}.gltf`, 3.6))]);
}

// ---------- miestnosť ----------
let R = null, room = null; // R = vypočítané dáta, room = objekty v scéne
const occluders = [];
function inst(geo, mat, items, shadow = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => { q.setFromAxisAngle(Y, it.r || 0); s.setScalar(it.s || 1); p.set(it.x, it.y ?? R.height(it.x, it.z), it.z); m.compose(p, q, s); mesh.setMatrixAt(i, m); });
  mesh.count = items.length; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.userData.items = items;
  mesh.computeBoundingSphere();
  room.add(mesh); return mesh;
}
function buildRoom(index) {
  if (room) { scene.remove(room); room.traverse(o => { if (o.geometry && o.userData.own) o.geometry.dispose(); }); }
  occluders.length = 0;
  R = genRoom(save.seed + save.zone * 101, index);
  room = new THREE.Group(); scene.add(room);
  // zem: o kus väčšia ako miestnosť, okraj stúpa do kopca
  const geo = new THREE.PlaneGeometry(R.W + 16, R.H + 16, (R.W + 16) * 2, (R.H + 16) * 2);
  geo.rotateX(-Math.PI / 2); geo.translate(R.W / 2, 0, R.H / 2);
  const pa = geo.attributes.position;
  const col = new Float32Array(pa.count * 3), c1 = new THREE.Color(0xd8d4ca), c2 = new THREE.Color(0xe4e0d7), cc = new THREE.Color();
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), z = pa.getZ(i); pa.setY(i, R.height(x, z));
    cc.copy(c1).lerp(c2, R.onPath(x, z) ? 1 : 0); col.set([cc.r, cc.g, cc.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, MAT.ground); ground.receiveShadow = true; ground.userData.own = true; ground.name = 'ground'; room.add(ground);
  inst(GRASS, MAT.grass, R.grass, false);
  inst(FLOWER, MAT.flower, R.flowers.map(f => ({ ...f, y: R.height(f.x, f.z) + 0.12 + f.s * 0.05 })));
  const byModel = {};
  for (const p of R.props) (byModel[p.m] = byModel[p.m] || []).push({ ...p, y: R.height(p.x, p.z) - 0.04 });
  for (const [name, items] of Object.entries(byModel)) for (const part of MODELS[name] || []) occluders.push(inst(part.geo, part.mat, items));
  buildGate();
  buildCamp();
  buildFinds();
  hero.position.set(R.start[0], R.height(...R.start), R.start[1]); hero.rotation.y = Math.PI / 2;
  vel.set(0, 0, 0); target = null;
  roomLabel();
}

// brána: dva kamenné stĺpy, medzi nimi svietiaca bariéra, kým nie je miestnosť vyčistená
let gate = null;
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

// ---------- čarodejník (KayKit Mage, CC0) ----------
const hero = new THREE.Group();
scene.add(hero);
const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: 0x6fd27a })); crystal.scale.y = 1.6;
const crystalLight = new THREE.PointLight(0x7dff8a, 1.6, 5, 1.6);
const crystalAnchor = new THREE.Object3D();
crystalAnchor.add(crystal, crystalLight);
let mixer = null, actions = {}, current = null, casting = 0;
function grayify(mat, cape) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time; sh.uniforms.uVel = U.vel; sh.uniforms.uCape = { value: cape || new THREE.Vector2(0, 1) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))) * 1.08;');
    if (cape) sh.vertexShader = 'uniform float uTime; uniform vec3 uVel; uniform vec2 uCape;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float f = clamp((uCape.y - position.y) / (uCape.y - uCape.x), 0.0, 1.0);
      float sp = length(uVel.xz);
      transformed.z -= f * f * (0.08 + sp * 0.5) + sin(uTime * (5.0 + sp * 4.0) + position.x * 6.0) * f * (0.03 + sp * 0.06);
      transformed.x += sin(uTime * 3.7 + position.y * 5.0) * f * 0.02;`);
  };
  mat.customProgramCacheKey = () => (cape ? 'cape' : 'gray');
}
new GLTFLoader().load('modely/Mage.glb', gltf => {
  const m = gltf.scene;
  const box = new THREE.Box3().setFromObject(m), h = box.max.y - box.min.y;
  m.scale.setScalar(2.1 / h);
  m.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (['Spellbook', 'Spellbook_open', '1H_Wand'].includes(o.name)) { o.visible = false; return; }
    o.material = o.material.clone();
    if (o.name === 'Mage_Cape') { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; grayify(o.material, new THREE.Vector2(b.min.y, b.max.y)); }
    else grayify(o.material);
    if (o.name === '2H_Staff') {
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox, tip = new THREE.Vector3();
      const ax = ['x', 'y', 'z'].reduce((a, k) => (b.max[k] - b.min[k] > b.max[a] - b.min[a] ? k : a), 'y');
      tip.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2); tip[ax] = b.max[ax];
      crystalAnchor.position.copy(tip); o.add(crystalAnchor);
      crystalAnchor.scale.setScalar(1 / o.getWorldScale(new THREE.Vector3()).x);
    }
  });
  hero.add(m);
  mixer = new THREE.AnimationMixer(m);
  gltf.animations.forEach(a => { actions[a.name] = mixer.clipAction(a); });
  for (const n of ['Spellcast_Shoot', 'Hit_A', 'Cheer']) { actions[n].setLoop(THREE.LoopOnce); actions[n].clampWhenFinished = true; }
  play('Idle');
});
function play(name, fade = 0.2) {
  const a = actions[name]; if (!a || current === a) return;
  a.reset().fadeIn(fade).play();
  if (current) current.fadeOut(fade);
  current = a;
}

// ---------- Slizkovia (horda v miestnosti) a Kráľ Slizko ----------
const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x15161a }), gold = new THREE.MeshBasicMaterial({ color: 0xffd25a });
const slimeGeo = new THREE.SphereGeometry(0.6, 20, 14), eyeGeo = new THREE.SphereGeometry(0.13, 10, 8), pupGeo = new THREE.SphereGeometry(0.06, 8, 6), mouthGeo = new THREE.TorusGeometry(0.08, 0.02, 5, 10, Math.PI);
const rng = mulberry32(save.seed * 7 + 3);
function makeSlime(scale, hp, crown = false) {
  const g = new THREE.Group(), mat = std(0xb4b1a9, { flatShading: false, roughness: 0.35, emissive: 0x000000 });
  const body = new THREE.Mesh(slimeGeo, mat); body.position.y = 0.42; body.castShadow = true; g.add(body);
  for (const sx of [-0.2, 0.2]) {
    const e = new THREE.Mesh(eyeGeo, white); e.position.set(sx, 0.08, 0.5); body.add(e);
    const p = new THREE.Mesh(pupGeo, black); p.position.set(sx * 1.05, 0.08, 0.61); body.add(p);
  }
  const mo = new THREE.Mesh(mouthGeo, black); mo.position.set(0, -0.08, 0.57); mo.rotation.z = Math.PI; body.add(mo);
  if (crown) for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 5), gold); const a = k / 5 * Math.PI * 2; c.position.set(Math.cos(a) * 0.3, 0.62, Math.sin(a) * 0.3); body.add(c); }
  g.scale.setScalar(scale);
  room.add(g);
  return { g, body, mat, hp, max: hp, alive: true, home: new THREE.Vector3(), ph: rng() * 6, wt: rng() * 3, target: new THREE.Vector3() };
}
let camp = null;
function buildCamp() {
  const c = R.camp, slimes = [];
  for (let k = 0; k < c.n; k++) {
    const sl = c.boss ? makeSlime(2.1, 30, true) : makeSlime(0.85 + rng() * 0.3, 5 + Math.round(R.tier * 5));
    const a = k / c.n * Math.PI * 2, x = c.x + (c.boss ? 0 : Math.cos(a) * 1.6), z = c.z + (c.boss ? 0 : Math.sin(a) * 1.6);
    sl.home.set(x, R.height(x, z), z); sl.g.position.copy(sl.home); sl.target.copy(sl.home); sl.g.rotation.y = -Math.PI / 2;
    slimes.push(sl);
  }
  camp = { ...c, slimes, done: false };
}

// ---------- súbojový kruh z run a kroky ----------
const accentMat = new THREE.MeshBasicMaterial({ color: 0x8dff98 });
const runes = new THREE.Group();
runes.add(new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.045, 6, 64).rotateX(Math.PI / 2), accentMat));
for (let k = 0; k < 16; k++) {
  const a = k / 16 * Math.PI * 2, plus = new THREE.Group();
  plus.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.07), accentMat), new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.28), accentMat));
  plus.position.set(Math.cos(a) * 3.75, 0, Math.sin(a) * 3.75); runes.add(plus);
}
runes.visible = false; scene.add(runes);
const stepStones = [0, 1, 2, 3, 4].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.visible = false; scene.add(m); return m; });

// ---------- kúzlo ----------
const PMAX = 700, pPos = new Float32Array(PMAX * 3), pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX);
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x8dff98, size: 0.11, sizeAttenuation: true }));
points.frustumCulled = false; scene.add(points);
let pi = 0;
function spark(x, y, z, vx, vy, vz, life) { const i = pi; pi = (pi + 1) % PMAX; pPos.set([x, y, z], i * 3); pVel.set([vx, vy, vz], i * 3); pLife[i] = life; }
const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xb6ffbe }));
const orbLight = new THREE.PointLight(0x7dff8a, 0, 9, 1.4); orb.add(orbLight); orb.visible = false; scene.add(orb);
const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: 0x8dff98 })); ring.rotation.x = Math.PI / 2; ring.visible = false; scene.add(ring);
const opOrbs = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9dffa8 })); m.visible = false; scene.add(m); return m; });
let spell = null;
function cast(target, operands, onHit) {
  if (spell) return;
  if (actions.Spellcast_Shoot) { play('Spellcast_Shoot', 0.1); casting = 1.5; }
  hero.rotation.y = Math.atan2(target.g.position.x - hero.position.x, target.g.position.z - hero.position.z);
  spell = { t: 0, target, from: new THREE.Vector3(), to: target.g.position.clone().add(new THREE.Vector3(0, 0.5 * target.g.scale.y, 0)), operands, onHit, power: operands.reduce((a, b) => a + b, 0) };
}
function updateSpell(dt, t) {
  if (!spell) { orb.visible = false; opOrbs.forEach(o => { o.visible = false; }); return; }
  spell.t += dt;
  const cw = crystal.getWorldPosition(new THREE.Vector3()), n = spell.operands.length, head = hero.position.clone().add(new THREE.Vector3(0, 2.9, 0));
  opOrbs.forEach((o, i) => {
    if (i >= n || spell.t > 0.8) { o.visible = false; return; }
    const born = i * 0.14, g = Math.min(1, Math.max(0, (spell.t - born) / 0.12));
    const side = new THREE.Vector3(Math.cos(hero.rotation.y), 0, -Math.sin(hero.rotation.y));
    const home = head.clone().addScaledVector(side, (i - (n - 1) / 2) * 0.75), m = Math.max(0, (spell.t - 0.5) / 0.3);
    o.position.lerpVectors(home, cw, m * m); o.scale.setScalar((0.12 + spell.operands[i] * 0.05) * g * (1 - m * 0.5)); o.visible = g > 0;
  });
  const tb = spell.target.body, tm = spell.target.mat;
  if (spell.t < 0.8) {
    const k = spell.t / 0.8;
    crystal.scale.set(1 + k * 0.8, (1 + k * 0.8) * 1.6, 1 + k * 0.8); crystalLight.intensity = 2 + k * 14;
    for (let s = 0; s < 3; s++) { const a = Math.random() * 6.28, r = 1.2; spark(cw.x + Math.cos(a) * r, cw.y + (Math.random() - 0.5), cw.z + Math.sin(a) * r, -Math.cos(a) * 2.4, 0, -Math.sin(a) * 2.4, 0.45); }
    spell.from.copy(cw);
  } else if (spell.t < 1.5) {
    const k = (spell.t - 0.8) / 0.7, e = k * k * (3 - 2 * k);
    orb.visible = true; orbLight.intensity = 14;
    orb.position.lerpVectors(spell.from, spell.to, e); orb.position.y += Math.sin(e * Math.PI) * 2.2;
    orb.scale.setScalar((0.8 + spell.power * 0.08) * (1 + Math.sin(t * 30) * 0.12));
    for (let s = 0; s < 5; s++) spark(orb.position.x, orb.position.y, orb.position.z, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 0.6);
    crystal.scale.set(1, 1.6, 1);
  } else if (!spell.hit) {
    spell.hit = true; spell.flash = 1;
    ring.visible = true; ring.position.copy(spell.to).setY(spell.target.g.position.y + 0.12); ring.scale.setScalar(0.2);
    for (let s = 0; s < 160; s++) { const a = Math.random() * 6.28, u = Math.random() * 2 - 1, r = 2 + Math.random() * 4; spark(spell.to.x, spell.to.y, spell.to.z, Math.cos(a) * r * Math.sqrt(1 - u * u), Math.abs(u) * r, Math.sin(a) * r * Math.sqrt(1 - u * u), 0.9 + Math.random() * 0.5); }
    tm.emissive.setScalar(1);
    spell.onHit();
  } else {
    spell.flash = Math.max(0, spell.flash - dt * 2.2);
    ring.scale.setScalar(0.2 + (1 - spell.flash) * 3.2);
    tb.scale.set(1 + spell.flash * 0.25, 1 - spell.flash * 0.3, 1 + spell.flash * 0.25);
    tm.emissive.setScalar(spell.flash * spell.flash);
    if (spell.flash <= 0) { ring.visible = false; tm.emissive.setScalar(0); spell = null; orb.visible = false; return; }
    orb.visible = true; orb.position.copy(spell.to); orb.scale.setScalar(spell.flash * 3 + 0.001); orbLight.intensity = spell.flash * 30;
  }
}

// ---------- dithering + rozmazanie do hĺbky ----------
// 1. scéna sa vykreslí v nízkom rozlíšení, 2. dithering (3 tóny + farebné akcenty), 3. rozmazanie mimo pásma postáv.
const LOW_H = 270;
const low = new THREE.WebGLRenderTarget(16, 16), dith = new THREE.WebGLRenderTarget(16, 16, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const ditherMat = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: low.texture }, uLow: { value: new THREE.Vector2() }, uTones: { value: 3 }, uOn: { value: 1 }, uFade: { value: 0 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tScene; uniform vec2 uLow; uniform float uTones; uniform float uOn; uniform float uFade; varying vec2 vUv;
    float bayer(vec2 p){ vec2 q = mod(p, 4.0); int i = int(q.x) + int(q.y) * 4; float b = 0.0;
      if (i==0) b=0.; else if (i==1) b=8.; else if (i==2) b=2.; else if (i==3) b=10.; else if (i==4) b=12.; else if (i==5) b=4.; else if (i==6) b=14.; else if (i==7) b=6.;
      else if (i==8) b=3.; else if (i==9) b=11.; else if (i==10) b=1.; else if (i==11) b=9.; else if (i==12) b=15.; else if (i==13) b=7.; else if (i==14) b=13.; else b=5.;
      return (b + 0.5) / 16.0; }
    void main(){
      vec2 px = floor(vUv * uLow);
      vec3 c = pow(max(texture2D(tScene, (px + 0.5) / uLow).rgb, 0.0), vec3(1.0 / 2.2));
      float th = bayer(px);
      vec3 ink = vec3(0.105, 0.11, 0.13), paper = vec3(0.87, 0.855, 0.82);
      vec3 col;
      if (uOn < 0.5) col = c;
      else {
        float l = smoothstep(0.08, 0.92, dot(c, vec3(0.299, 0.587, 0.114)));
        float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
        if (sat > 0.32 && mx > 0.22) {
          vec3 hue = c / mx; float lit = clamp(mx * 1.15, 0.0, 1.0);
          col = lit > th * 0.9 ? mix(hue * 0.92, vec3(1.0, 0.98, 0.94), smoothstep(0.82, 1.0, mx) * 0.55) : mix(ink, hue * 0.4, 0.5);
        } else if (uTones > 2.5) {
          float v = l * 2.0; float b = floor(v); float lv = b + (v - b > th ? 1.0 : 0.0);
          col = lv < 0.5 ? ink : lv < 1.5 ? mix(ink, paper, 0.5) : paper;
        } else col = l > th ? paper : ink;
      }
      if (uFade > 0.0 && th < uFade) col = paper;   // prechod medzi miestnosťami sa rozpadne do bodiek
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const blurMat = new THREE.ShaderMaterial({
  uniforms: { tImg: { value: dith.texture }, uLow: { value: new THREE.Vector2() }, uFocus: { value: 0.5 }, uBand: { value: 0.16 }, uMax: { value: 3.2 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tImg; uniform vec2 uLow; uniform float uFocus; uniform float uBand; uniform float uMax; varying vec2 vUv;
    void main(){
      float dy = abs(vUv.y - uFocus);
      vec2 q = vUv - 0.5;
      float r = smoothstep(uBand, uBand + 0.32, dy) * uMax + dot(q, q) * 4.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 20; i++) {
        float fi = float(i), a = fi * 2.39996;
        vec2 o = vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 20.0) * r / uLow;
        acc += texture2D(tImg, vUv + o).rgb;
      }
      vec3 col = acc / 20.0;
      col *= 1.0 - dot(q, q) * 0.35;
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ditherMat);
quadScene.add(quad);
function setView(v) { const a = innerWidth / innerHeight; camera.left = -v * a; camera.right = v * a; camera.top = v; camera.bottom = -v; camera.updateProjectionMatrix(); }
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  setView(viewZoom);
  const lw = Math.round(LOW_H * innerWidth / innerHeight);
  low.setSize(lw, LOW_H); dith.setSize(lw, LOW_H);
  ditherMat.uniforms.uLow.value.set(lw, LOW_H); blurMat.uniforms.uLow.value.set(lw, LOW_H);
}
addEventListener('resize', resize);

// ---------- nálezy v miestnosti: runy (nové číslo) a truhlice ----------
const PIXD = { '3': '11111000100010000010000011000101110', '4': '00010001100101010010111110001000010' };
function digitTexture(ch) {
  const c = document.createElement('canvas'); c.width = 48; c.height = 72; const g = c.getContext('2d');
  g.fillStyle = '#e8e4da'; g.fillRect(0, 0, 48, 72); g.fillStyle = '#1c1d21';
  const bits = PIXD[ch]; for (let i = 0; i < 35; i++) if (bits[i] === '1') g.fillRect(9 + (i % 5) * 6, 14 + ((i / 5) | 0) * 6, 6, 6);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function runeStone(n) {
  const g = new THREE.Group(), side = std(0xc8c4ba);
  const stone = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.05, 0.22), [side, side, side, side, new THREE.MeshStandardMaterial({ map: digitTexture(String(n)), roughness: 0.9 }), side]);
  stone.position.y = 0.95; stone.castShadow = true; g.add(stone);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 6, 32).rotateX(Math.PI / 2), gold); halo.position.y = 0.05; g.add(halo);
  const light = new THREE.PointLight(0xffd25a, 3, 5, 1.6); light.position.y = 1.2; g.add(light);
  g.userData = { stone, halo, light };
  return g;
}
function makeChest() {
  const ch = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.62), std(0x6a625a));
  body.position.y = 0.3; body.castShadow = true; ch.add(body);
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.57, -0.31); ch.add(lidPivot);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.22, 0.64), std(0x7a7168)); lid.position.set(0, 0.1, 0.31); lid.castShadow = true; lidPivot.add(lid);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.05), gold); lock.position.set(0, 0.5, 0.33); ch.add(lock);
  ch.userData = { lidPivot, lock };
  return ch;
}
let finds = [];
function buildFinds() {
  finds = R.finds.filter(f => !(f.n > 0 && save.numbers.includes(f.n))).map(f => {
    const obj = f.kind === 'rune' ? runeStone(f.n) : makeChest();
    obj.position.set(f.x, R.height(f.x, f.z), f.z); if (f.kind === 'chest') obj.rotation.y = -Math.PI / 2;
    room.add(obj);
    return { ...f, obj, done: false };
  });
}
function updateFinds(dt, t) {
  for (const f of finds) {
    const u = f.obj.userData;
    if (f.kind === 'rune' && !f.done) {
      u.stone.rotation.y = Math.sin(t * 1.2) * 0.25; u.stone.position.y = 0.95 + Math.sin(t * 2) * 0.06;
      u.halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08); u.light.intensity = 2.5 + Math.sin(t * 4);
      if (Math.random() < 0.15) spark(f.obj.position.x + (Math.random() - 0.5), f.obj.position.y + 0.4, f.obj.position.z + (Math.random() - 0.5), 0, 1.2, 0, 1);
    }
    if (!f.done && !fight.on && hero.position.distanceTo(f.obj.position) < 1.5) collect(f);
    if (f.anim !== undefined) {
      f.anim += dt;
      if (f.kind === 'chest') u.lidPivot.rotation.x = -Math.min(1, f.anim * 2.5) * 1.9;
      const r = f.rune;
      if (r) {
        r.position.y = f.obj.position.y + 0.6 + Math.min(1.6, f.anim * 1.6); r.rotation.y += dt * 4;
        if (f.anim > 1.6 && r.visible) { r.visible = false; for (let s = 0; s < 80; s++) spark(r.position.x, r.position.y + 0.9, r.position.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 1); }
      }
    }
  }
}
function collect(f) {
  f.done = true; f.anim = 0;
  if (f.kind === 'chest') f.obj.userData.lock.visible = false;
  if (f.n === 0) { const c = 3 + Math.floor(rng() * 4); save.coins += c; persist(); roomLabel(); setTimeout(() => say(`Truhlica: ${c} mincí!`), 400); return; }
  if (f.kind === 'rune') { f.rune = f.obj.userData.stone; f.rune.position.copy(f.obj.position); room.add(f.rune); f.obj.userData.halo.visible = false; f.obj.userData.light.intensity = 0; }
  else { const r = runeStone(f.n); r.position.copy(f.obj.position); r.userData.halo.visible = false; room.add(r); f.rune = r; }
  save.numbers = [...new Set([...save.numbers, f.n])].sort((a, b) => a - b); persist();
  setTimeout(() => { say(`Nové číslo: ${f.n}! Teraz ho vieš v kúzlach.`); if (actions.Cheer) { play('Cheer', 0.2); casting = 2; } }, 600);
}

// ---------- súboj krok za krokom s hordou ----------
// Najbližší Slizko stojí 4 kroky od teba, ostatní čakajú za ním v rade. Každé kolo jeden príklad:
// správne a rýchlo = zásah a odhodí ho späť; správne pomaly = zásah, ale príde o krok bližšie;
// zle = príde o krok bližšie a ukáže sa správny výsledok. Keď dôjde k tebe, ubudne srdiečko.
const mathS = createMathState(), rngM = mulberry32(save.seed * 13 + 5);
const STEPS = 4, GAP = 1.05;
const fight = { on: false, queue: [], active: null, pos: STEPS, hearts: 3, p: null, input: '', t0: 0, phase: 'idle', dir: new THREE.Vector3(), base: new THREE.Vector3(), last: '', hidden: [], cool: 0 };
const cardEl = document.getElementById('card'), ptextEl = document.getElementById('ptext'), stepsEl = document.getElementById('steps'), padEl = document.getElementById('pad'), msgEl = document.getElementById('msg');
const PIX = {
  '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111', '3': '11111000100010000010000011000101110',
  '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110', '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000',
  '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100', '+': '00000001000010011111001000010000000', '=': '00000000001111100000111110000000000',
  '?': '01110100010000100010001000000000100', '←': '00000001000100011111010000010000000', '✔': '00000000010001010100010000000000000',
};
function pix(str) {
  const ch = [...String(str)]; let d = '';
  ch.forEach((c, k) => { const g = PIX[c]; if (g) for (let i = 0; i < 35; i++) if (g[i] === '1') d += `M${k * 7 + (i % 5)} ${(i / 5) | 0}h2v1h-2z`; });
  return `<svg class="pix" viewBox="0 0 ${ch.length * 7 - 1} 7" shape-rendering="crispEdges"><path d="${d}"/></svg>`;
}
['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '←', '✔'].forEach(k => {
  const b = document.createElement('button'); b.dataset.k = k; b.innerHTML = pix(k);
  if (k === '✔') b.className = 'ok'; if (k === '←') b.className = 'del';
  b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); press(k); });
  padEl.appendChild(b);
});
function hearts(lost) { document.getElementById('hearts').innerHTML = [0, 1, 2].map(i => `<i class="heart ${i < fight.hearts ? '' : 'off'} ${lost && i === fight.hearts ? 'pop' : ''}"></i>`).join(''); }
hearts();
let msgT = 0;
function say(text) { msgEl.textContent = text; msgEl.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => msgEl.classList.remove('show'), 2200); }
function roomLabel() {
  const left = camp && !camp.done ? camp.slimes.filter(s => s.alive).length : 0;
  document.getElementById('cmpTxt').textContent = `Zóna ${save.zone} · ${R.boss ? 'Kráľ Slizko' : `miestnosť ${R.index + 1}/${ROOMS - 1}`} · ` + (left ? `zostáva ${left}` : 'brána je otvorená') + ` · ${save.coins} mincí`;
  document.getElementById('cmpArrow').style.transform = left ? 'rotate(0rad)' : 'rotate(1.5708rad)';
}
const slimeSpot = n => fight.base.clone().addScaledVector(fight.dir, 0.9 + n * GAP).setY(0);
const docked = () => innerWidth < 900 || matchMedia('(pointer: coarse)').matches;
function dock() { cardEl.classList.toggle('dock', docked()); }
addEventListener('resize', dock); dock();
const posY = (v) => { v.y = R.height(v.x, v.z); return v; };

function startFight() {
  fight.on = true; fight.phase = 'start';
  fight.queue = camp.slimes.filter(s => s.alive);
  fight.base.copy(hero.position);
  fight.dir.set(camp.x - hero.position.x, 0, camp.z - hero.position.z).normalize();
  hero.rotation.y = Math.atan2(fight.dir.x, fight.dir.z);
  lineUp(true);
  runes.position.copy(posY(hero.position.clone().lerp(slimeSpot(STEPS), 0.5))); runes.position.y += 0.05;
  runes.visible = true; runes.scale.setScalar(0.01);
  padEl.classList.remove('hidden');
  say(camp.boss ? 'Kráľ Slizko! Počítaj a kúzli.' : fight.queue.length > 1 ? `Horda! ${fight.queue.length} Slizkovia. Počítaj a kúzli.` : 'Súboj! Počítaj a kúzli.');
  hideOccluders(true);
  setTimeout(nextProblem, 800);
}
function lineUp(reset) {
  if (reset) fight.pos = camp.boss ? 5 : STEPS;
  fight.active = fight.queue[0];
  fight.queue.forEach((s, k) => { s.hop = { from: s.g.position.clone(), to: slimeSpot(k === 0 ? fight.pos : fight.pos + 0.6 + k * 1.15 * s.g.scale.x), t: 0, dur: 0.5 }; });
}
function sideVec() {
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3(fight.dir.z, 0, -fight.dir.x), right = new THREE.Vector3().crossVectors(side.clone().negate(), up);
  if (right.dot(fight.dir) < 0) side.negate();
  return side;
}
// stromy a kamene medzi bočnou kamerou a súbojom sa skryjú
function hideOccluders(on) {
  const m = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  if (!on) { for (const [mesh, i, mat] of fight.hidden) { mesh.setMatrixAt(i, mat); mesh.instanceMatrix.needsUpdate = true; } fight.hidden = []; return; }
  const side = sideVec(), center = fight.base.clone().addScaledVector(fight.dir, 2.6);
  for (const mesh of occluders) mesh.userData.items.forEach((it, i) => {
    const v = new THREE.Vector3(it.x - center.x, 0, it.z - center.z), front = v.dot(side), along = Math.abs(v.dot(fight.dir));
    if (front > -1.5 && front < 24 && along < 10) { mesh.getMatrixAt(i, m); fight.hidden.push([mesh, i, m.clone()]); mesh.setMatrixAt(i, zero); mesh.instanceMatrix.needsUpdate = true; }
  });
}

// Balíček príkladov: všetky kombinácie zo známych čísel v troch druhoch, premiešané – nič sa neopakuje, chyby sa vracajú.
let bag = [], bagKey = '';
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rngM() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mk(operands, missing = -1) {
  const sum = operands.reduce((x, y) => x + y, 0);
  const text = operands.map((n, i) => (i === missing ? '?' : n)).join(' + ') + (missing >= 0 ? ' = ' + sum : '');
  return { operands, missing, sum, answer: missing >= 0 ? operands[missing] : sum, text, operation: '+', ops: operands.slice(1).map(() => '+') };
}
function fillBag() {
  const N = save.numbers, add = [], three = [], miss = [];
  for (const a of N) for (const b of N) { add.push(mk([a, b])); miss.push(mk([a, b], rngM() < 0.5 ? 0 : 1)); }
  for (const a of N) for (const b of N) for (const c of N) if (a + b + c <= 12) three.push(mk([a, b, c]));
  bag = shuffle([...add, ...shuffle(three).slice(0, camp.boss ? 10 : mathS.difficulty > 10 ? 6 : 3), ...shuffle(miss).slice(0, Math.max(2, Math.floor(miss.length / 2)))]);
  bagKey = N.join();
}
function nextProblem() {
  if (!fight.on || fight.phase === 'win') return;
  if (!bag.length || bagKey !== save.numbers.join()) fillBag();
  let i = bag.findIndex(q => q.text !== fight.last); if (i < 0) i = 0;
  fight.p = bag.splice(i, 1)[0];
  fight.last = fight.p.text; fight.input = ''; fight.t0 = performance.now(); fight.phase = 'ask';
  cardEl.classList.remove('hidden', 'help');
  renderCard();
}
const dots = n => (n <= 5 ? `<span class="dots">${'<i></i>'.repeat(n)}</span>` : '');
function renderCard(state = '') {
  const p = fight.p; if (!p || !fight.active) return; let h = '';
  const ans = state === 'bad' || state === 'good' ? p.answer : fight.input || '?';
  const slot = `<span id="answer" class="${state || (fight.input ? 'typed' : '')}">${pix(ans)}</span>`;
  p.operands.forEach((n, i) => { if (i) h += `<span class="sym">${pix('+')}</span>`; h += i === p.missing ? `<span class="op">${slot}</span>` : `<span class="op">${pix(n)}${dots(n)}</span>`; });
  h += `<span class="sym">${pix('=')}</span>` + (p.missing >= 0 ? `<span class="op">${pix(p.sum)}${dots(p.sum)}</span>` : slot);
  ptextEl.innerHTML = h;
  const name = camp.boss ? 'Kráľ Slizko' : 'Slizko', more = fight.queue.length - 1, max = camp.boss ? 5 : 4;
  stepsEl.innerHTML = `${name} je ` + Array.from({ length: max }, (_, i) => `<i class="${i + 1 <= fight.pos ? 'on' : ''}"></i>`).join('') + ` ${fight.pos} ${fight.pos === 1 ? 'krok' : fight.pos < 5 ? 'kroky' : 'krokov'} od teba` + (more > 0 ? ` · za ním ešte ${more}` : '');
  cardEl.querySelector('#ehp i').style.width = Math.max(0, fight.active.hp / fight.active.max * 100) + '%';
}
function press(k) {
  if (!fight.on || fight.phase !== 'ask') return;
  if (/^[0-9]$/.test(k)) { if (fight.input.length < 3) fight.input += k; if (fight.input.length >= String(fight.p.answer).length) return submit(); }
  else if (k === '←') fight.input = fight.input.slice(0, -1);
  else if (k === '✔') return submit();
  renderCard();
}
function submit() {
  if (!fight.input) return;
  const p = fight.p, ms = performance.now() - fight.t0, ok = +fight.input === p.answer, a = fight.active;
  recordAnswer(mathS, p, ok, ms);
  fight.phase = 'wait';
  if (ok) {
    renderCard('good');
    const fast = ms < 3500 + (p.operands.length - 2) * 2500;
    cast(a, p.operands, () => {
      a.hp -= p.sum; floatNum(p.sum, a);
      if (a.hp <= 0) return defeat(a);
      if (fast) { say('Rýchlo! Slizko odletel späť.'); stepTo(Math.min(camp.boss ? 5 : STEPS, fight.pos + 1)); }
      else stepTo(fight.pos - 1);
      renderCard('good');
      setTimeout(nextProblem, 900);
    });
  } else {
    bag.push(p);
    renderCard('bad');
    say(`Správne je ${p.answer}. Nevadí!`);
    setTimeout(() => { stepTo(fight.pos - 1); setTimeout(nextProblem, 900); }, 900);
  }
}
function stepTo(n) {
  const a = fight.active;
  if (n <= 0) { // dôjde k čarodejníkovi a udrie
    a.hop = { from: a.g.position.clone(), to: slimeSpot(0), t: 0, dur: 0.35 };
    setTimeout(() => {
      fight.hearts--; hearts(true);
      if (actions.Hit_A) { play('Hit_A', 0.05); casting = 0.8; }
      for (let s = 0; s < 40; s++) spark(hero.position.x, hero.position.y + 1, hero.position.z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0.6);
      if (fight.hearts <= 0) { say('Oddýchni si a skús znova!'); fight.hearts = 3; a.hp = a.max; setTimeout(() => hearts(), 1200); }
      lineUp(true); renderCard();
    }, 380);
    return;
  }
  fight.pos = n; lineUp(false); renderCard();
}
function defeat(a) {
  a.alive = false; a.dying = 1;
  fight.queue.shift(); roomLabel();
  if (!fight.queue.length) return win();
  say('Porazený! Ďalší Slizko.');
  setTimeout(() => { lineUp(true); setTimeout(nextProblem, 700); }, 700);
}
function win() {
  fight.phase = 'win'; cardEl.classList.add('hidden'); padEl.classList.add('hidden');
  camp.done = true;
  const coins = camp.boss ? 20 : camp.n * 2; save.coins += coins;
  if (camp.boss) { save.zone += 1; save.room = 0; persist(); }
  say(camp.boss ? 'Kráľ Slizko porazený! Zóna je hotová a hra uložená. Brána vedie do ďalšej zóny.' : `Miestnosť vyčistená! +${coins} mincí. Brána sa otvorila.`);
  if (actions.Cheer) { play('Cheer', 0.2); casting = 2.2; }
  setTimeout(() => { fight.on = false; fight.phase = 'idle'; runes.visible = false; hideOccluders(false); roomLabel(); }, 1800);
}
function floatNum(n, a) {
  const v = a.g.position.clone().add(new THREE.Vector3(0, 1.4 * a.g.scale.y, 0)).project(camera), d = document.createElement('div');
  d.className = 'float'; d.innerHTML = pix(n);
  d.style.left = (v.x + 1) / 2 * innerWidth + 'px'; d.style.top = (1 - v.y) / 2 * innerHeight + 'px';
  document.body.appendChild(d); setTimeout(() => d.remove(), 1100);
}
function placeCard() {
  if (docked() || cardEl.classList.contains('hidden') || !fight.active) return;
  const v = fight.active.g.position.clone().add(new THREE.Vector3(0, 1.9 * fight.active.g.scale.y, 0)).project(camera);
  const half = cardEl.offsetWidth / 2 + 12;
  cardEl.style.left = Math.max(half, Math.min(innerWidth - half, (v.x + 1) / 2 * innerWidth)) + 'px';
  cardEl.style.top = Math.max(150, (1 - v.y) / 2 * innerHeight) + 'px';
}
function updateSlimes(dt, t) {
  for (const s of camp.slimes) {
    if (!s.g.visible) continue;
    if (s.dying) {
      s.dying -= dt * 1.2; s.body.scale.setScalar(Math.max(0.001, s.dying));
      if (Math.random() < 0.8) spark(s.g.position.x, s.g.position.y + 0.4, s.g.position.z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0.8);
      if (s.dying <= 0) { s.dying = 0; s.g.visible = false; }
      continue;
    }
    if (s.hop) {
      const h = s.hop; h.t += dt; const k = Math.min(1, h.t / h.dur);
      s.g.position.lerpVectors(h.from, h.to, k);
      s.g.position.y = R.height(s.g.position.x, s.g.position.z) + Math.sin(k * Math.PI) * 0.7;
      s.body.scale.set(1 - Math.sin(k * Math.PI) * 0.12, 0.75 + Math.sin(k * Math.PI) * 0.25, 1 - Math.sin(k * Math.PI) * 0.12);
      if (k >= 1) s.hop = null;
    } else if (!fight.on) {
      s.wt -= dt;
      if (s.wt <= 0) { s.wt = 2 + Math.random() * 3; s.target.set(s.home.x + (Math.random() - 0.5) * 2.5, 0, s.home.z + (Math.random() - 0.5) * 2.5); }
      const d = new THREE.Vector3(s.target.x - s.g.position.x, 0, s.target.z - s.g.position.z);
      if (d.length() > 0.1) s.g.position.addScaledVector(d.normalize(), dt * 0.5);
      s.g.position.y = R.height(s.g.position.x, s.g.position.z);
    }
    if (!s.hop && !(spell && spell.hit && spell.target === s)) s.body.scale.set(1 + Math.sin(t * 3 + s.ph) * 0.05, 0.75 - Math.sin(t * 3 + s.ph) * 0.05, 1 + Math.sin(t * 3 + s.ph) * 0.05);
    if (fight.on) s.g.rotation.y = Math.atan2(hero.position.x - s.g.position.x, hero.position.z - s.g.position.z);
  }
}
let changing = 0;
function updateRoom(dt) {
  if (fight.on && fight.phase === 'ask' && performance.now() - fight.t0 > 3000) cardEl.classList.add('help'); // bodky až po 3 s
  if (runes.visible) { runes.rotation.y += dt * 0.25; runes.scale.setScalar(Math.min(1, runes.scale.x + dt * 3)); }
  stepStones.forEach((m, i) => {
    m.visible = fight.on && fight.phase !== 'win' && i < (camp.boss ? 5 : 4);
    if (!m.visible) return;
    const p = posY(slimeSpot(i + 1)); m.position.set(p.x, p.y + 0.04, p.z);
    m.material.color.setHex(i + 1 <= fight.pos ? 0xffffff : 0x8dff98);
  });
  // brána sa otvorí po vyčistení miestnosti
  const g = gate.userData; g.open += ((camp.done ? 1 : 0) - g.open) * (1 - Math.exp(-dt * 3));
  g.barrier.material.opacity = 0.55 * (1 - g.open) + Math.sin(performance.now() / 300) * 0.08 * (1 - g.open);
  g.barrier.visible = g.open < 0.97;
  // horda si ťa všimne
  if (!fight.on && !camp.done && Math.hypot(camp.x - hero.position.x, camp.z - hero.position.z) < (camp.boss ? 8 : 6)) startFight();
  // prechod bránou do ďalšej miestnosti
  if (camp.done && !fight.on && !changing && hero.position.x > R.gate[0] - 0.3) {
    changing = 1;
    const next = R.boss ? 0 : R.index + 1;
    fade(() => { save.room = next; persist(); buildRoom(next); say(R.boss ? 'Posledná miestnosť: Kráľ Slizko!' : `Miestnosť ${next + 1}. Poraz všetkých a brána sa otvorí.`); changing = 0; });
  }
}
let fadeT = 0, fadeCb = null;
function fade(cb) { fadeT = 0.0001; fadeCb = cb; }

// ---------- ovládanie ----------
const keys = {};
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  const k = /^[0-9]$/.test(e.key) ? e.key : e.key === 'Backspace' ? '←' : e.key === 'Enter' ? '✔' : null;
  if (k && fight.on) { press(k); const b = [...padEl.children].find(x => x.dataset.k === k); if (b) { b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 120); } }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let target = null;
canvas.addEventListener('pointerdown', e => {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObject(room.getObjectByName('ground'))[0];
  if (hit) target = hit.point.clone();
});
let night = false;
const bN = document.getElementById('bNight'), bT = document.getElementById('bTones'), bD = document.getElementById('bDither'), bW = document.getElementById('bWorld');
bN.onclick = () => { night = !night; bN.classList.toggle('on', night); };
bT.onclick = () => { ditherMat.uniforms.uTones.value = ditherMat.uniforms.uTones.value > 2.5 ? 2 : 3; bT.classList.toggle('on', ditherMat.uniforms.uTones.value > 2.5); };
bD.onclick = () => { ditherMat.uniforms.uOn.value = 1 - ditherMat.uniforms.uOn.value; bD.classList.toggle('on', ditherMat.uniforms.uOn.value > 0.5); };
bW.onclick = () => { save = { seed: 1 + Math.floor(Math.random() * 9999), zone: 1, room: 0, numbers: [1, 2], coins: 0 }; persist(); location.reload(); };

// ---------- slučka ----------
const clock = new THREE.Clock();
const vel = new THREE.Vector3();
await loadModels();
buildRoom(save.room || 0);
const camPos = hero.position.clone().add(new THREE.Vector3(0, 13, 17)), camLook = hero.position.clone();
let dayK = 1;
function tick() {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  U.time.value = t;

  // pohyb (v súboji stojí)
  const dir = new THREE.Vector3((keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), 0, (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0));
  if (dir.lengthSq()) target = null;
  else if (target) { dir.subVectors(target, hero.position).setY(0); if (dir.length() < 0.15) { target = null; dir.set(0, 0, 0); } }
  if (dir.lengthSq()) dir.normalize();
  if (fight.on || changing) { dir.set(0, 0, 0); target = null; }
  vel.lerp(dir.multiplyScalar(3.4), 1 - Math.exp(-dt * 8));
  const nx = hero.position.x + vel.x * dt, nz = hero.position.z + vel.z * dt;
  const ok = (x, z) => R.inside(x, z) && (camp.done || x < R.gate[0] - 1.2) && R.props.every(p => !p.col || (p.x - x) ** 2 + (p.z - z) ** 2 > (p.col * p.s) ** 2); // kým je horda, bránou sa nedá prejsť
  if (ok(nx, nz)) { hero.position.x = nx; hero.position.z = nz; }
  else if (ok(nx, hero.position.z)) hero.position.x = nx;
  else if (ok(hero.position.x, nz)) hero.position.z = nz;
  else { vel.multiplyScalar(0.3); target = null; }
  hero.position.y = R.height(hero.position.x, hero.position.z);
  const speed = vel.length();
  if (speed > 0.2 && !fight.on) hero.rotation.y = Math.atan2(vel.x, vel.z) + (hero.rotation.y - Math.atan2(vel.x, vel.z)) * Math.exp(-dt * 10);
  if (mixer) {
    if (casting > 0) casting -= dt;
    else play(speed > 2.4 ? 'Running_A' : speed > 0.3 ? 'Walking_A' : 'Idle');
    if (current) current.timeScale = current === actions.Walking_A ? Math.max(0.6, speed / 1.8) : 1;
    mixer.update(dt);
  }
  U.hero.value.copy(hero.position);
  U.vel.value.copy(vel).applyAxisAngle(new THREE.Vector3(0, 1, 0), -hero.rotation.y).multiplyScalar(0.35);

  crystal.rotation.y += dt * 1.5;
  if (!spell) crystalLight.intensity = (night ? 3.2 : 1.6) * (1 + Math.sin(t * 4) * 0.15);
  if (Math.random() < 0.3) { const w = crystal.getWorldPosition(new THREE.Vector3()); spark(w.x, w.y, w.z, (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4, 0.8); }

  updateSpell(dt, t);
  updateSlimes(dt, t);
  updateFinds(dt, t);
  updateRoom(dt);

  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -99; continue; }
    pLife[i] -= dt; pVel[i * 3 + 1] -= dt * 1.5;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
  }
  pGeo.attributes.position.needsUpdate = true;

  dayK += ((night ? 0 : 1) - dayK) * (1 - Math.exp(-dt * 2));
  sun.intensity = 0.25 + dayK * 2.25; hemi.intensity = 0.12 + dayK * 0.83;
  const fogC = new THREE.Color(PAPER).multiplyScalar(0.25 + dayK * 0.75);
  scene.background.copy(fogC); scene.fog.color.copy(fogC);

  // kamera: v miestnosti zhora (drží sa v jej hraniciach), v súboji bočný pohľad
  let wantLook, wantPos, wantView;
  if (fight.on) {
    const side = sideVec(), center = fight.base.clone().addScaledVector(fight.dir, 2.8);
    wantView = camp.boss ? 4.4 : 3.8;
    wantLook = center.add(new THREE.Vector3(0, 0.3, 0));
    if (docked()) wantLook.y -= wantView * 0.42;
    wantPos = wantLook.clone().addScaledVector(side, 20).add(new THREE.Vector3(0, 5.5, 0));
  } else {
    const hw = VIEW * innerWidth / innerHeight;
    wantLook = new THREE.Vector3(Math.min(Math.max(hero.position.x, hw - 2), R.W - hw + 2), hero.position.y + 0.9, Math.min(Math.max(hero.position.z, 3), R.H - 3));
    wantPos = wantLook.clone().add(new THREE.Vector3(0, 12.1, 17));
    wantView = VIEW;
  }
  const kc = 1 - Math.exp(-dt * 2.6);
  camPos.lerp(wantPos, kc); camLook.lerp(wantLook, kc);
  if (Math.abs(viewZoom - wantView) > 0.001) { viewZoom += (wantView - viewZoom) * kc; setView(viewZoom); }
  camera.position.copy(camPos); camera.lookAt(camLook);
  sun.position.set(hero.position.x - 15, hero.position.y + 3 + dayK * 7, hero.position.z + 8);   // nízke slnko = dlhé tiene a výrazné hrbole sun.target.position.copy(hero.position);
  placeCard();
  document.getElementById('help').style.opacity = fight.on ? 0 : 1;

  // prechod medzi miestnosťami (rozpad do bodiek a späť)
  if (fadeT > 0) {
    fadeT += dt * 2;
    if (fadeT >= 1 && fadeCb) { const cb = fadeCb; fadeCb = null; cb(); camPos.copy(hero.position).add(new THREE.Vector3(0, 13, 17)); camLook.copy(hero.position); }
    if (fadeT >= 2) fadeT = 0;
  }
  ditherMat.uniforms.uFade.value = fadeT > 0 ? (fadeT < 1 ? fadeT : 2 - fadeT) : 0;

  // ostrosť: pásmo okolo postáv (výška čarodejníka na obrazovke)
  const hv = hero.position.clone().add(new THREE.Vector3(0, 1, 0)).project(camera);
  blurMat.uniforms.uFocus.value += ((hv.y + 1) / 2 - blurMat.uniforms.uFocus.value) * kc;
  blurMat.uniforms.uMax.value = ditherMat.uniforms.uOn.value > 0.5 ? 3.2 : 0;

  renderer.setRenderTarget(low); renderer.render(scene, camera);
  quad.material = ditherMat; renderer.setRenderTarget(dith); renderer.render(quadScene, quadCam);
  quad.material = blurMat; renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
  requestAnimationFrame(tick);
}
resize();
requestAnimationFrame(tick);
window.__s = { get R() { return R; }, hero, camera, scene, THREE, fight, press, save, get camp() { return camp; }, nextProblem };
