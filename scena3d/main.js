// Mathemagic – skúšobná 3D scéna: skutočné svetlo a tiene, potom dithering (štýl Obra Dinn) s farebnými akcentmi.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mulberry32, generateProblem, recordAnswer, createMathState } from '../js/math.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const PAPER = 0xd9d6ce;
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAPER);
scene.fog = new THREE.Fog(PAPER, 26, 60);
// ortografická kamera: žiadna 3D perspektíva, vyzerá ako 2D pixelová hra, ale svetlo a tiene sú skutočné
const VIEW = 4.2;
let viewZoom = VIEW;
const camera = new THREE.OrthographicCamera(-VIEW * 16 / 9, VIEW * 16 / 9, VIEW, -VIEW, 0.1, 200);

// spoločné uniformy pre vietor a pohyb
const U = { time: { value: 0 }, hero: { value: new THREE.Vector3() }, vel: { value: new THREE.Vector3() } };
const rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

// Vloží do materiálu pohyb vrcholov (vietor, vlajúci plášť…) a zachová svetlo aj tiene.
function animate(mat, code, header = '') {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time; sh.uniforms.uHero = U.hero; sh.uniforms.uVel = U.vel;
    sh.vertexShader = 'uniform float uTime; uniform vec3 uHero; uniform vec3 uVel;\n' + header + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + code);
  };
  mat.customProgramCacheKey = () => code;
  return mat;
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...o });

// ---------- svetlo ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(-14, 16, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------- zem ----------
const groundGeo = new THREE.PlaneGeometry(80, 80, 80, 80);
groundGeo.rotateX(-Math.PI / 2);
{
  const p = groundGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x - 5, z - 3);
    let y = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.35 + Math.sin(x * 0.07 + z * 0.05) * 0.6;
    if (d < 4.6) y = Math.min(y, -0.45 * (1 - d / 4.6) + y * (d / 4.6)) - 0.12; // jazierko
    p.setY(i, y);
  }
  groundGeo.computeVertexNormals();
}
const groundH = (x, z) => {
  const d = Math.hypot(x - 5, z - 3);
  let y = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.35 + Math.sin(x * 0.07 + z * 0.05) * 0.6;
  if (d < 4.6) y = Math.min(y, -0.45 * (1 - d / 4.6) + y * (d / 4.6)) - 0.12;
  return y;
};
const ground = new THREE.Mesh(groundGeo, std(0xd6d2c8, { flatShading: false }));   // svetlá zem = menej bodiek, pokojnejšia
ground.receiveShadow = true;
scene.add(ground);

// ---------- jazierko s odrazom ----------
const RShader = {
  name: 'PondShader',
  uniforms: { color: { value: new THREE.Color(0x8d9399) }, tDiffuse: { value: null }, textureMatrix: { value: null }, uTime: { value: 0 } },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec2 vPos;
    void main(){ vUv = textureMatrix * vec4(position, 1.0); vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime; varying vec4 vUv; varying vec2 vPos;
    void main(){
      vec4 uv = vUv;
      float r = length(vPos);
      vec2 w = vec2(sin(vPos.y * 3.1 + uTime * 1.7) + sin(r * 5.0 - uTime * 2.4), cos(vPos.x * 2.7 - uTime * 1.3)) * 0.035 * uv.w;
      uv.xy += w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      float edge = smoothstep(4.2, 3.4, r);
      vec3 water = color * 0.42 + refl * 0.22;                       // tmavá voda, obloha sa odráža len slabo
      water += max(refl - 0.8, 0.0) * 3.5;                          // svetlá (kryštál, kúzlo, oheň) sa odrážajú výrazne
      float rip = smoothstep(0.92, 1.0, sin(r * 6.0 - uTime * 1.6 + sin(vPos.x * 1.7) * 0.6));
      water += rip * 0.12;
      gl_FragColor = vec4(mix(color * 0.5, water, edge), 1.0);
    }`,
};
const pond = new Reflector(new THREE.CircleGeometry(4.2, 48), { textureWidth: 512, textureHeight: 512, clipBias: 0.003, shader: RShader });
pond.rotation.x = -Math.PI / 2;
pond.position.set(5, -0.26, 3);
scene.add(pond);
// kamene okolo a lekná
for (let k = 0; k < 22; k++) {
  const a = k / 22 * Math.PI * 2 + rng() * 0.2, rr = 4.25 + rng() * 0.4;
  const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + rng() * 0.25, 0), std(0x8f8b84));
  st.position.set(5 + Math.cos(a) * rr, groundH(5 + Math.cos(a) * rr, 3 + Math.sin(a) * rr) + 0.05, 3 + Math.sin(a) * rr);
  st.scale.y = 0.6; st.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  st.castShadow = st.receiveShadow = true; scene.add(st);
}
const pads = [];
for (let k = 0; k < 6; k++) {
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.02, 14, 1, false, 0.3, Math.PI * 1.8), std(0x3f9a4a, { flatShading: false }));
  pad.position.set(5 + (rng() - 0.5) * 5, -0.22, 3 + (rng() - 0.5) * 5);
  pads.push(pad); scene.add(pad);
}

// ---------- tráva (vlní sa vo vetre a uhýba čarodejníkovi) ----------
{
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.05, 0, 0, 0.05, 0, 0, 0, 0.55, 0], 3));
  blade.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  const mat = animate(std(0xc9c5bb, { flatShading: false, side: THREE.FrontSide }), `
    #ifdef USE_INSTANCING
      vec3 ip = instanceMatrix[3].xyz;
    #else
      vec3 ip = vec3(0.0);
    #endif
    float h = position.y / 0.55;
    float wind = sin(uTime * 1.8 + ip.x * 0.35 + ip.z * 0.25) * 0.5 + sin(uTime * 3.1 + ip.x * 1.3) * 0.18;
    transformed.x += wind * 0.22 * h * h;
    vec2 d = ip.xz - uHero.xz; float k = smoothstep(1.3, 0.0, length(d));
    transformed.xz += normalize(d + 0.0001) * k * 0.45 * h;
    transformed.y -= k * 0.25 * h;`);
  const N = 9000, grass = new THREE.InstancedMesh(blade, mat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0;
  while (n < N) {
    const x = (rng() - 0.5) * 46, z = (rng() - 0.5) * 34;
    if (Math.hypot(x - 5, z - 3) < 4.6) continue;
    if (Math.hypot(x + 1, z + 1) < 1.6) continue; // ohnisko
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
    const sc = 0.6 + rng() * 0.9;
    s.set(sc, sc * (0.7 + rng() * 0.6), sc);
    p.set(x, groundH(x, z), z);
    m.compose(p, q, s); grass.setMatrixAt(n++, m);
  }
  grass.receiveShadow = true;
  scene.add(grass);
}
// vlčie maky – červené akcenty v trse
{
  const geo = new THREE.SphereGeometry(0.09, 6, 4);
  const mat = animate(std(0xd43a3a, { flatShading: false, emissive: 0x3a0505 }), `
    #ifdef USE_INSTANCING
      vec3 ip = instanceMatrix[3].xyz;
    #else
      vec3 ip = vec3(0.0);
    #endif
    transformed.x += sin(uTime * 1.8 + ip.x * 0.35 + ip.z * 0.25) * 0.03;`);
  const N = 260, pop = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const c = [[-6, 5], [12, -4], [-10, -6], [2, 8]][i % 4];
    const x = c[0] + (rng() - 0.5) * 4, z = c[1] + (rng() - 0.5) * 3;
    m.makeTranslation(x, groundH(x, z) + 0.45 + rng() * 0.2, z);
    pop.setMatrixAt(i, m);
  }
  pop.castShadow = true;
  scene.add(pop);
}

// ---------- stromy: 3 druhy, kývu sa vo vetre ----------
const SWAY = `
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float hh = max(0.0, position.y);
  float sw = sin(uTime * 1.3 + wp.x * 0.2 + wp.z * 0.13) * 0.5 + sin(uTime * 2.7 + wp.z * 0.4) * 0.15;
  transformed.x += sw * 0.045 * hh * hh;
  transformed.z += sw * 0.02 * hh * hh;`;
const obstacles = [];
const trunkMat = animate(std(0x5d5751), SWAY), leafDark = animate(std(0x6f6c66), SWAY), leafLight = animate(std(0x8b8780), SWAY), birchMat = animate(std(0xcfcac0), SWAY);
function addMesh(g, geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
function oak(x, z, s) {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.16, 0.26, 2.2, 7).translate(0, 1.1, 0), trunkMat, 0, 0, 0);
  for (let k = 0; k < 5; k++) {
    const r = 0.9 + rng() * 0.5, a = k / 5 * Math.PI * 2;
    addMesh(g, new THREE.IcosahedronGeometry(r, 1).translate(Math.cos(a) * 0.6, 2.7 + rng() * 0.6, Math.sin(a) * 0.6), k % 2 ? leafDark : leafLight, 0, 0, 0);
  }
  addMesh(g, new THREE.IcosahedronGeometry(1.1, 1).translate(0, 3.3, 0), leafLight, 0, 0, 0);
  g.position.set(x, groundH(x, z) - 0.05, z); g.scale.setScalar(s); g.rotation.y = rng() * 6; scene.add(g); obstacles.push(g);
}
function pine(x, z, s) {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.12, 0.2, 1.4, 6).translate(0, 0.7, 0), trunkMat, 0, 0, 0);
  for (let k = 0; k < 4; k++) addMesh(g, new THREE.ConeGeometry(1.5 - k * 0.3, 1.5, 8).translate(0, 1.6 + k * 0.85, 0), leafDark, 0, 0, 0);
  g.position.set(x, groundH(x, z) - 0.05, z); g.scale.setScalar(s); g.rotation.y = rng() * 6; scene.add(g); obstacles.push(g);
}
function birch(x, z, s) {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.08, 0.12, 3.6, 6).translate(0, 1.8, 0), birchMat, 0, 0, 0);
  for (let k = 0; k < 4; k++) addMesh(g, new THREE.IcosahedronGeometry(0.55, 0).scale(0.8, 1.4, 0.8).translate((rng() - 0.5) * 0.7, 3.0 + k * 0.45, (rng() - 0.5) * 0.7), leafLight, 0, 0, 0);
  g.position.set(x, groundH(x, z) - 0.05, z); g.scale.setScalar(s); g.rotation.y = rng() * 6; scene.add(g); obstacles.push(g);
}
[[-9, -3, oak, 1.1], [-13, 3, pine, 1.2], [-6, -9, birch, 1], [13, 7, oak, 1.3], [16, -2, pine, 1], [9, -8, birch, 1.1],
 [-16, -8, oak, 1], [0, -12, pine, 1.3], [-3, 10, birch, 0.9], [18, 10, pine, 1.4], [-18, 9, oak, 1.2], [6, 12, oak, 1], [11, -12, pine, 1.1], [-11, 12, birch, 1.2]]
  .forEach(([x, z, f, s]) => f(x, z, s));
// kamene
for (let k = 0; k < 9; k++) {
  const x = (rng() - 0.5) * 36, z = (rng() - 0.5) * 26;
  if (Math.hypot(x - 5, z - 3) < 6 || Math.hypot(x, z) < 3) continue;
  const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + rng() * 0.6, 0), std(0x9a968f));
  st.position.set(x, groundH(x, z) + 0.2, z); st.scale.y = 0.7; st.rotation.set(rng(), rng() * 6, rng());
  st.castShadow = st.receiveShadow = true; scene.add(st); obstacles.push(st);
}

// ---------- oheň ----------
const fireLight = new THREE.PointLight(0xff8a3a, 6, 9, 1.6);
const fire = new THREE.Group();
{
  for (let k = 0; k < 4; k++) { const l = addMesh(fire, new THREE.CylinderGeometry(0.07, 0.07, 0.9, 5), std(0x4a443e), 0, 0.1, 0); l.rotation.set(Math.PI / 2, 0, k * Math.PI / 4); }
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; addMesh(fire, new THREE.DodecahedronGeometry(0.13, 0), std(0x8c8780), Math.cos(a) * 0.55, 0.05, Math.sin(a) * 0.55); }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
  for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.22 - k * 0.05, 0.6 - k * 0.1, 6), k === 2 ? new THREE.MeshBasicMaterial({ color: 0xffd25a }) : flameMat); f.position.y = 0.35 + k * 0.06; fire.add(f); }
  fireLight.position.y = 0.8; fire.add(fireLight);
  fire.position.set(-1, groundH(-1, -1), -1);
  scene.add(fire);
}

// ---------- čarodejník (KayKit Mage, CC0) ----------
// Farby modelu prevedieme do šedej (akcent zostáva len kryštál); plášť navyše vlaje.
const hero = new THREE.Group();
hero.position.set(0, 0, 2);
scene.add(hero);
const crystalMat = new THREE.MeshBasicMaterial({ color: 0x6fd27a });
const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), crystalMat); crystal.scale.y = 1.6;
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

// ---------- Slizko ----------
// Roztomilá kvapka: veľké oči, malé ústa, trasie sa.
const slime = new THREE.Group();
const slimeMat = std(0xb4b1a9, { flatShading: false, roughness: 0.35, emissive: 0x000000 });
const slimeBody = new THREE.Mesh(new THREE.SphereGeometry(0.6, 22, 16), slimeMat);
slimeBody.position.y = 0.42; slimeBody.castShadow = true; slime.add(slimeBody);
const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x15161a });
for (const sx of [-0.2, 0.2]) {
  const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), white); e.position.set(sx, 0.08, 0.5); slimeBody.add(e);
  const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), black); p.position.set(sx * 1.05, 0.08, 0.61); slimeBody.add(p);
}
const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 5, 10, Math.PI), black); mouth.position.set(0, -0.08, 0.57); mouth.rotation.z = Math.PI; slimeBody.add(mouth);
slime.position.set(-4, 0, 6);
slime.position.y = groundH(-4, 6);
scene.add(slime);

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
const stepStones = [1, 2, 3, 4].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.visible = false; scene.add(m); return m; });

// ---------- kúzlo: guľa so svetlom, stopa a rázová vlna ----------
const PMAX = 600, pPos = new Float32Array(PMAX * 3), pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX);
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x8dff98, size: 0.11, sizeAttenuation: true }));
points.frustumCulled = false; scene.add(points);
let pi = 0;
function spark(x, y, z, vx, vy, vz, life) { const i = pi; pi = (pi + 1) % PMAX; pPos.set([x, y, z], i * 3); pVel.set([vx, vy, vz], i * 3); pLife[i] = life; }
const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xb6ffbe }));
const orbLight = new THREE.PointLight(0x7dff8a, 0, 9, 1.4); orb.add(orbLight); orb.visible = false; scene.add(orb);
const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: 0x8dff98 })); ring.rotation.x = Math.PI / 2; ring.visible = false; scene.add(ring);
// Kúzlo: nad čarodejníkom sa objaví guľa za každé číslo príkladu, zlejú sa do kryštálu a letí.
const opOrbs = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9dffa8 })); m.visible = false; scene.add(m); return m; });
let spell = null;
function cast(operands = [1, 1], onHit = () => {}) {
  if (spell) return;
  if (actions.Spellcast_Shoot) { play('Spellcast_Shoot', 0.1); casting = 1.5; }
  hero.rotation.y = Math.atan2(slime.position.x - hero.position.x, slime.position.z - hero.position.z);
  spell = { t: 0, from: new THREE.Vector3(), to: slime.position.clone().add(new THREE.Vector3(0, 0.5, 0)), operands, onHit, power: operands.reduce((a, b) => a + b, 0) };
}

// ---------- dithering (post-process) ----------
const LOW_H = 270;
let low = new THREE.WebGLRenderTarget(16, 16, { samples: 0 });
const post = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: null }, uLow: { value: new THREE.Vector2() }, uTones: { value: 3 }, uOn: { value: 1 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `uniform sampler2D tScene; uniform vec2 uLow; uniform float uTones; uniform float uOn; varying vec2 vUv;
    float bayer(vec2 p){ vec2 q = mod(p, 4.0); int i = int(q.x) + int(q.y) * 4;
      float b = 0.0;
      if (i==0) b=0.; else if (i==1) b=8.; else if (i==2) b=2.; else if (i==3) b=10.; else if (i==4) b=12.; else if (i==5) b=4.; else if (i==6) b=14.; else if (i==7) b=6.;
      else if (i==8) b=3.; else if (i==9) b=11.; else if (i==10) b=1.; else if (i==11) b=9.; else if (i==12) b=15.; else if (i==13) b=7.; else if (i==14) b=13.; else b=5.;
      return (b + 0.5) / 16.0; }
    float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main(){
      vec2 px = floor(vUv * uLow);
      vec3 c = texture2D(tScene, (px + 0.5) / uLow).rgb;
      c = pow(max(c, 0.0), vec3(1.0 / 2.2));
      if (uOn < 0.5) { gl_FragColor = vec4(c, 1.0); return; }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      l = smoothstep(0.08, 0.92, l);
      float th = mix(bayer(px), ign(px), 0.15);
      vec3 ink = vec3(0.105, 0.11, 0.13), paper = vec3(0.87, 0.855, 0.82);
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
      float sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
      vec3 col;
      if (sat > 0.32 && mx > 0.22) {
        vec3 hue = c / mx;
        float lit = clamp(mx * 1.15, 0.0, 1.0);
        col = lit > th * 0.9 ? mix(hue * 0.92, vec3(1.0, 0.98, 0.94), smoothstep(0.82, 1.0, mx) * 0.55) : mix(ink, hue * 0.4, 0.5);
      } else if (uTones > 2.5) {
        float v = l * 2.0; float b = floor(v); float f = v - b;
        float lv = b + (f > th ? 1.0 : 0.0);
        col = lv < 0.5 ? ink : lv < 1.5 ? mix(ink, paper, 0.5) : paper;
      } else {
        col = l > th ? paper : ink;
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

function setView(v) { const a = innerWidth / innerHeight; camera.left = -v * a; camera.right = v * a; camera.top = v; camera.bottom = -v; camera.updateProjectionMatrix(); }
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  setView(viewZoom);
  const lh = LOW_H, lw = Math.round(lh * w / h);
  low.setSize(lw, lh);
  post.uniforms.uLow.value.set(lw, lh);
}
addEventListener('resize', resize);

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
  const hit = ray.intersectObject(ground)[0];
  if (hit) target = hit.point.clone();
});
let night = false;
const bN = document.getElementById('bNight'), bT = document.getElementById('bTones'), bD = document.getElementById('bDither');
bN.onclick = () => { night = !night; bN.classList.toggle('on', night); };
bT.onclick = () => { post.uniforms.uTones.value = post.uniforms.uTones.value > 2.5 ? 2 : 3; bT.classList.toggle('on', post.uniforms.uTones.value > 2.5); };
bD.onclick = () => { post.uniforms.uOn.value = 1 - post.uniforms.uOn.value; bD.classList.toggle('on', post.uniforms.uOn.value > 0.5); };

// ---------- čísla vo svete: runové kamene a truhlica, kompas ----------
// Na začiatku vieš len číslo 1. Ďalšie čísla nájdeš (kompas ukáže kam); nové znamienko dá boss.
const S3 = { numbers: [1] };
const PIXD = {
  '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111', '3': '11111000100010000010000011000101110',
};
function digitTexture(ch) {
  const c = document.createElement('canvas'); c.width = 48; c.height = 72; const g = c.getContext('2d');
  g.fillStyle = '#e8e4da'; g.fillRect(0, 0, 48, 72);
  g.fillStyle = '#1c1d21'; const bits = PIXD[ch];
  for (let i = 0; i < 35; i++) if (bits[i] === '1') g.fillRect(9 + (i % 5) * 6, 14 + ((i / 5) | 0) * 6, 6, 6);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const goldMat = new THREE.MeshBasicMaterial({ color: 0xffd25a });
function runeStone(n) {
  const g = new THREE.Group(), side = std(0xc8c4ba);
  const stone = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.05, 0.22), [side, side, side, side, new THREE.MeshStandardMaterial({ map: digitTexture(String(n)), roughness: 0.9 }), side]);
  stone.position.y = 0.95; stone.castShadow = true; g.add(stone);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 6, 32).rotateX(Math.PI / 2), goldMat); halo.position.y = 0.05; g.add(halo);
  const light = new THREE.PointLight(0xffd25a, 3, 5, 1.6); light.position.y = 1.2; g.add(light);
  g.userData = { stone, halo, light, n };
  return g;
}
const finds = [];
{ const r = runeStone(2); r.position.set(13, groundH(13, -5), -5); scene.add(r); finds.push({ kind: 'rune', n: 2, obj: r, label: 'číslo 2' }); }
const chest = new THREE.Group();
{
  const wood = std(0x6a625a), body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.62), wood);
  body.position.y = 0.3; body.castShadow = true; chest.add(body);
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.57, -0.31); chest.add(lidPivot);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.22, 0.64), std(0x7a7168)); lid.position.set(0, 0.1, 0.31); lid.castShadow = true; lidPivot.add(lid);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.05), goldMat); lock.position.set(0, 0.5, 0.33); chest.add(lock);
  chest.userData = { lidPivot, lock };
  chest.position.set(-12, groundH(-12, -6), -6); chest.rotation.y = 0.4; scene.add(chest);
  finds.push({ kind: 'chest', n: 3, obj: chest, label: 'truhlica' });
}
const compassEl = document.getElementById('compass'), cmpArrow = document.getElementById('cmpArrow'), cmpTxt = document.getElementById('cmpTxt');
function nextFind() { return finds.filter(f => !f.done).sort((a, b) => a.obj.position.distanceTo(hero.position) - b.obj.position.distanceTo(hero.position))[0]; }
function updateCompass() {
  const f = nextFind();
  compassEl.classList.toggle('hidden', !f || fight.on);
  if (!f) return;
  const dx = f.obj.position.x - hero.position.x, dz = f.obj.position.z - hero.position.z;
  cmpArrow.style.transform = `rotate(${Math.atan2(dx, -dz)}rad)`;
  cmpTxt.textContent = (f.kind === 'chest' ? 'Truhlica' : 'Nové číslo') + ' · ' + Math.round(Math.hypot(dx, dz)) + ' krokov';
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
      const r = f.rune; if (r) {
        r.position.y = f.obj.position.y + 0.6 + Math.min(1.6, f.anim * 1.6); r.rotation.y += dt * 4;
        if (f.anim > 1.6 && r.visible) { r.visible = false; for (let s = 0; s < 80; s++) spark(r.position.x, r.position.y + 0.9, r.position.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 1); }
      }
    }
  }
}
function collect(f) {
  f.done = true; f.anim = 0;
  if (f.kind === 'rune') { f.rune = f.obj.userData.stone; f.rune.position.copy(f.obj.position); scene.add(f.rune); f.obj.userData.halo.visible = false; f.obj.userData.light.intensity = 0; }
  else { const r = runeStone(f.n); r.position.copy(f.obj.position); r.userData.halo.visible = false; scene.add(r); f.rune = r; f.obj.userData.lock.visible = false; }
  S3.numbers = [...new Set([...S3.numbers, f.n])].sort((a, b) => a - b);
  setTimeout(() => { say(`Nové číslo: ${f.n}! Teraz ho vieš v kúzlach.`); if (actions.Cheer) { play('Cheer', 0.2); casting = 2; } }, 600);
}

// ---------- súboj krok za krokom ----------
// Slizko stojí 4 kroky od čarodejníka. Každé kolo jeden príklad:
// správne a rýchlo = zásah a odhodí ho o krok späť; správne pomaly = zásah, ale príde o krok bližšie;
// zle = príde o krok bližšie a ukáže sa správny výsledok. Keď dôjde k tebe, ubudne srdiečko.
const rngM = mulberry32(Date.now() % 1e9 | 0);
const mathS = createMathState();
const STEPS = 4, GAP = 1.05;
const fight = { on: false, pos: STEPS, hp: 8, max: 8, hearts: 3, p: null, input: '', t0: 0, phase: 'idle', hop: null, dir: new THREE.Vector3(), base: new THREE.Vector3(), cool: 0, last: '' };
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
function say(text) { msgEl.textContent = text; msgEl.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => msgEl.classList.remove('show'), 1800); }
const slimeSpot = n => fight.base.clone().addScaledVector(fight.dir, 0.9 + n * GAP);

function startFight() {
  fight.on = true; fight.pos = STEPS; fight.hp = fight.max = 8;
  fight.base.copy(hero.position);
  fight.dir.subVectors(slime.position, hero.position).setY(0).normalize();
  const to = slimeSpot(STEPS); hopTo(to, 0.5);
  runes.position.copy(hero.position.clone().lerp(to, 0.5)); runes.position.y = groundH(runes.position.x, runes.position.z) + 0.05; runes.visible = true; runes.scale.setScalar(0.01);
  hero.rotation.y = Math.atan2(fight.dir.x, fight.dir.z);
  padEl.classList.remove('hidden');
  say('Súboj! Počítaj a kúzli.');
  setTimeout(nextProblem, 700);
}
function nextProblem() {
  if (!fight.on) return;
  fight.p = generateProblem({ unlockedNumbers: S3.numbers, unlockedOperations: ['+'], retry: mathS.retry }, mathS.difficulty, rngM, { cap: 20, last: fight.last });
  fight.last = fight.p.text; fight.input = ''; fight.t0 = performance.now(); fight.phase = 'ask';
  cardEl.classList.remove('hidden', 'help');
  renderCard();
}
const dots = n => (n <= 5 ? `<span class="dots">${'<i></i>'.repeat(n)}</span>` : '');
function renderCard(state = '') {
  const p = fight.p; let h = '';
  p.operands.forEach((n, i) => { if (i) h += `<span class="sym">${pix('+')}</span>`; h += `<span class="op">${pix(n)}${dots(n)}</span>`; });
  const ans = state === 'bad' || state === 'good' ? p.answer : fight.input || '?';
  h += `<span class="sym">${pix('=')}</span><span id="answer" class="${state || (fight.input ? 'typed' : '')}">${pix(ans)}</span>`;
  ptextEl.innerHTML = h;
  stepsEl.innerHTML = 'Slizko je ' + [1, 2, 3, 4].map(i => `<i class="${i <= fight.pos ? 'on' : ''}"></i>`).join('') + ` ${fight.pos} ${fight.pos === 1 ? 'krok' : fight.pos < 5 ? 'kroky' : 'krokov'} od teba`;
  cardEl.querySelector('#ehp i').style.width = Math.max(0, fight.hp / fight.max * 100) + '%';
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
  const p = fight.p, ms = performance.now() - fight.t0, ok = +fight.input === p.answer;
  recordAnswer(mathS, p, ok, ms);
  fight.phase = 'wait';
  if (ok) {
    renderCard('good');
    const fast = ms < 3500 + (p.operands.length - 2) * 2500;
    cast(p.operands, () => {
      fight.hp -= p.answer; floatNum(p.answer);
      if (fight.hp <= 0) return win();
      if (fast) { say('Rýchlo! Slizko odletel späť.'); stepTo(Math.min(STEPS, fight.pos + 1)); }
      else stepTo(fight.pos - 1);
      renderCard('good');
      setTimeout(nextProblem, 900);
    });
  } else {
    renderCard('bad');
    say(`Správne je ${p.answer}. Nevadí!`);
    setTimeout(() => { stepTo(fight.pos - 1); setTimeout(nextProblem, 900); }, 900);
  }
}
function stepTo(n) {
  if (n <= 0) { // dôjde k čarodejníkovi a udrie
    hopTo(slimeSpot(0), 0.35);
    setTimeout(() => {
      fight.hearts--; hearts(true);
      if (actions.Hit_A) { play('Hit_A', 0.05); casting = 0.8; }
      for (let s = 0; s < 40; s++) spark(hero.position.x, hero.position.y + 1, hero.position.z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0.6);
      if (fight.hearts <= 0) { say('Oddýchni si a skús znova!'); fight.hearts = 3; fight.hp = fight.max; setTimeout(() => hearts(), 1200); }
      fight.pos = STEPS; hopTo(slimeSpot(STEPS), 0.6); renderCard();
    }, 380);
    return;
  }
  fight.pos = n; hopTo(slimeSpot(n), 0.45); renderCard();
}
function hopTo(to, dur) { fight.hop = { from: slime.position.clone(), to: to.clone(), t: 0, dur }; }
function win() {
  fight.phase = 'win'; cardEl.classList.add('hidden'); padEl.classList.add('hidden');
  say('Výhra! Slizko je porazený.');
  if (actions.Cheer) { play('Cheer', 0.2); casting = 2.2; }
  fight.dying = 1;
}
function floatNum(n) {
  const v = slime.position.clone().add(new THREE.Vector3(0, 1.4, 0)).project(camera), d = document.createElement('div');
  d.className = 'float'; d.innerHTML = pix(n);
  d.style.left = (v.x + 1) / 2 * innerWidth + 'px'; d.style.top = (1 - v.y) / 2 * innerHeight + 'px';
  document.body.appendChild(d); setTimeout(() => d.remove(), 1100);
}
function placeCard() {
  if (cardEl.classList.contains('hidden')) return;
  const v = slime.position.clone().add(new THREE.Vector3(0, 1.9, 0)).project(camera);
  const half = cardEl.offsetWidth / 2 + 12, right = innerWidth - half;
  cardEl.style.left = Math.max(half, Math.min(right, (v.x + 1) / 2 * innerWidth)) + 'px';
  cardEl.style.top = Math.max(150, (1 - v.y) / 2 * innerHeight) + 'px';
}
function updateFight(dt, t) {
  // bodky na spočítanie až po 3 sekundách – najprv skús z hlavy
  if (fight.on && fight.phase === 'ask' && performance.now() - fight.t0 > 3000) cardEl.classList.add('help');
  // kruh z run sa roztvorí a točí
  if (runes.visible) { runes.rotation.y += dt * 0.25; runes.scale.setScalar(Math.min(1, runes.scale.x + dt * 3) * (fight.on && fight.phase !== 'win' ? 1 : 1)); }
  stepStones.forEach((m, i) => {
    m.visible = fight.on && fight.phase !== 'win';
    if (!m.visible) return;
    const p = slimeSpot(i + 1); m.position.set(p.x, groundH(p.x, p.z) + 0.04, p.z);
    m.material.color.setHex(i + 1 <= fight.pos ? 0xffffff : 0x8dff98);
  });
  // skok Slizka
  if (fight.hop) {
    const h = fight.hop; h.t += dt; const k = Math.min(1, h.t / h.dur);
    slime.position.lerpVectors(h.from, h.to, k);
    slime.position.y = groundH(slime.position.x, slime.position.z) + Math.sin(k * Math.PI) * 0.7;
    slimeBody.scale.set(1 - Math.sin(k * Math.PI) * 0.12, 0.75 + Math.sin(k * Math.PI) * 0.25, 1 - Math.sin(k * Math.PI) * 0.12);
    slime.rotation.y = Math.atan2(hero.position.x - slime.position.x, hero.position.z - slime.position.z);
    if (k >= 1) fight.hop = null;
  }
  // porazený Slizko sa rozplynie do iskier, o chvíľu príde nový
  if (fight.dying) {
    fight.dying -= dt * 1.2;
    slimeBody.scale.setScalar(Math.max(0.001, fight.dying));
    if (Math.random() < 0.8) spark(slime.position.x, slime.position.y + 0.4, slime.position.z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0.8);
    if (fight.dying <= 0) {
      fight.dying = 0; fight.on = false; runes.visible = false; slime.visible = false; fight.cool = 4;
    }
  }
  if (!fight.on && fight.cool > 0) {
    fight.cool -= dt;
    if (fight.cool <= 0) {
      const a = Math.random() * Math.PI * 2, x = hero.position.x + Math.cos(a) * 9, z = hero.position.z + Math.sin(a) * 9;
      slime.position.set(x, groundH(x, z), z); slime.visible = true; slimeBody.scale.set(1, 0.75, 1); fight.hp = fight.max;
    }
  }
  updateFinds(dt, t);
  // Slizko si ťa všimne
  if (!fight.on && slime.visible && fight.cool <= 0 && hero.position.distanceTo(slime.position) < 4.5) startFight();
}

// ---------- slučka ----------
const clock = new THREE.Clock();
const vel = new THREE.Vector3(), camPos = new THREE.Vector3(0, 13, 19), camLook = new THREE.Vector3(0, 0.9, 2);
let walk = 0, dayK = 1;
function tick() {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  U.time.value = t; pond.material.uniforms.uTime.value = t;

  // pohyb
  const dir = new THREE.Vector3((keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), 0, (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0));
  if (dir.lengthSq()) target = null;
  else if (target) { dir.subVectors(target, hero.position).setY(0); if (dir.length() < 0.15) { target = null; dir.set(0, 0, 0); } }
  if (dir.lengthSq()) dir.normalize();
  if (fight.on) { dir.set(0, 0, 0); target = null; }
  vel.lerp(dir.multiplyScalar(3.2), 1 - Math.exp(-dt * 8));
  const nx = hero.position.x + vel.x * dt, nz = hero.position.z + vel.z * dt;
  if (Math.hypot(nx - 5, nz - 3) > 4.4) { hero.position.x = nx; hero.position.z = nz; } else vel.multiplyScalar(0.5);
  hero.position.y = groundH(hero.position.x, hero.position.z);
  const speed = vel.length();
  if (speed > 0.2) hero.rotation.y = Math.atan2(vel.x, vel.z) + (hero.rotation.y - Math.atan2(vel.x, vel.z)) * Math.exp(-dt * 10);
  walk += dt * speed * 3.2;
  if (mixer) {
    if (casting > 0) casting -= dt;
    else play(speed > 2.4 ? 'Running_A' : speed > 0.3 ? 'Walking_A' : 'Idle');
    if (current) current.timeScale = current === actions.Walking_A ? Math.max(0.6, speed / 1.8) : 1;
    mixer.update(dt);
  }
  U.hero.value.copy(hero.position);
  // rýchlosť v súradniciach čarodejníka (aby plášť vial dozadu)
  U.vel.value.copy(vel).applyAxisAngle(new THREE.Vector3(0, 1, 0), -hero.rotation.y).multiplyScalar(0.35);

  // kryštál pulzuje
  crystal.rotation.y += dt * 1.5;
  const pulse = 1 + Math.sin(t * 4) * 0.15;
  crystalLight.intensity = (night ? 3.2 : 1.6) * pulse;
  if (Math.random() < 0.3) { const w = crystal.getWorldPosition(new THREE.Vector3()); spark(w.x, w.y, w.z, (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4, 0.8); }

  // kúzlo
  if (spell) {
    spell.t += dt;
    const cw = crystal.getWorldPosition(new THREE.Vector3());
    const n = spell.operands.length, head = hero.position.clone().add(new THREE.Vector3(0, 2.9, 0));
    opOrbs.forEach((o, i) => {
      if (i >= n || spell.t > 0.8) { o.visible = false; return; }
      const born = i * 0.14, g = Math.min(1, Math.max(0, (spell.t - born) / 0.12));
      const side = new THREE.Vector3(Math.cos(hero.rotation.y), 0, -Math.sin(hero.rotation.y));
      const home = head.clone().addScaledVector(side, (i - (n - 1) / 2) * 0.75);
      const m = Math.max(0, (spell.t - 0.5) / 0.3);
      o.position.lerpVectors(home, cw, m * m);
      o.scale.setScalar((0.12 + spell.operands[i] * 0.05) * g * (1 - m * 0.5));
      o.visible = g > 0;
    });
    if (spell.t < 0.8) { // nabíjanie: gule za čísla sa zlejú, kryštál žiari
      const k = spell.t / 0.8;
      crystal.scale.setScalar(1 + k * 0.8); crystal.scale.y *= 1.6;
      crystalLight.intensity = 2 + k * 14;
      for (let s = 0; s < 4; s++) { const a = Math.random() * 6.28, r = 1.2; spark(cw.x + Math.cos(a) * r, cw.y + (Math.random() - 0.5), cw.z + Math.sin(a) * r, -Math.cos(a) * 2.4, 0, -Math.sin(a) * 2.4, 0.45); }
      spell.from.copy(cw);
    } else if (spell.t < 1.5) { // let
      const k = (spell.t - 0.8) / 0.7, e = k * k * (3 - 2 * k);
      orb.visible = true; orbLight.intensity = 14;
      orb.position.lerpVectors(spell.from, spell.to, e); orb.position.y += Math.sin(e * Math.PI) * 2.2;
      orb.scale.setScalar((0.8 + spell.power * 0.08) * (1 + Math.sin(t * 30) * 0.12));
      for (let s = 0; s < 5; s++) spark(orb.position.x, orb.position.y, orb.position.z, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 0.6);
      crystalLight.intensity *= 0.9; crystal.scale.set(1, 1.6, 1);
    } else if (!spell.hit) {
      spell.hit = true; orb.visible = false;
      ring.visible = true; ring.position.copy(spell.to).setY(slime.position.y + 0.12); ring.scale.setScalar(0.2);
      for (let s = 0; s < 160; s++) { const a = Math.random() * 6.28, u = Math.random() * 2 - 1, r = 2 + Math.random() * 4; spark(spell.to.x, spell.to.y, spell.to.z, Math.cos(a) * r * Math.sqrt(1 - u * u), Math.abs(u) * r, Math.sin(a) * r * Math.sqrt(1 - u * u), 0.9 + Math.random() * 0.5); }
      spell.flash = 1; slimeMat.emissive.setScalar(1); spell.onHit();
    } else {
      spell.flash = Math.max(0, spell.flash - dt * 2.2);
      orbLight.intensity = 0;
      ring.scale.setScalar(0.2 + (1 - spell.flash) * 3.2);
      ring.material.color.setScalar(1).lerp(new THREE.Color(0x8dff98), 1);
      slimeBody.scale.set(1 + spell.flash * 0.25, 1 - spell.flash * 0.3, 1 + spell.flash * 0.25);
      slimeMat.emissive.setScalar(spell.flash * spell.flash);
      crystalLight.intensity += spell.flash * 6;
      fireLight.intensity += spell.flash * 0;
      if (spell.flash <= 0) { ring.visible = false; spell = null; slimeMat.emissive.setScalar(0); }
    }
    if (spell && spell.hit) { orb.visible = true; orb.position.copy(spell.to); orb.scale.setScalar(spell.flash * 3 + 0.001); orbLight.intensity = spell.flash * 30; }
  } else orb.visible = false;
  // Slizko sa pruží
  if ((!spell || !spell.hit) && !fight.hop) slimeBody.scale.set(1 + Math.sin(t * 3) * 0.05, 0.75 - Math.sin(t * 3) * 0.05, 1 + Math.sin(t * 3) * 0.05);
  updateFight(dt, t);

  // iskry
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -99; continue; }
    pLife[i] -= dt;
    pVel[i * 3 + 1] -= dt * 1.5;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
  }
  pGeo.attributes.position.needsUpdate = true;

  // oheň bliká
  fireLight.intensity = (night ? 14 : 5) * (0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 29) * 0.07);
  fire.children.forEach((c, i) => { if (i >= 12) c.scale.y = 1 + Math.sin(t * 15 + i) * 0.2; });
  pads.forEach((p, i) => { p.position.y = -0.22 + Math.sin(t * 1.5 + i) * 0.015; p.rotation.y += dt * 0.05; });

  // deň / večer
  dayK += ((night ? 0 : 1) - dayK) * (1 - Math.exp(-dt * 2));
  sun.intensity = 0.25 + dayK * 2.35;
  hemi.intensity = 0.12 + dayK * 0.8;
  sun.position.set(-14, 4 + dayK * 12, 9);
  const fogC = new THREE.Color(PAPER).multiplyScalar(0.25 + dayK * 0.75);
  scene.background.copy(fogC); scene.fog.color.copy(fogC);

  // kamera ide za čarodejníkom
  // vo svete pohľad zhora, v súboji sa kamera otočí do bočného pohľadu (čarodejník vľavo, Slizko vpravo)
  let wantLook, wantPos, wantView;
  if (fight.on) {
    const up = new THREE.Vector3(0, 1, 0);
    let side = new THREE.Vector3(fight.dir.z, 0, -fight.dir.x);
    let right = new THREE.Vector3().crossVectors(side.clone().negate(), up);
    if (right.dot(fight.dir) < 0) { side.negate(); right.negate(); }
    const center = fight.base.clone().addScaledVector(fight.dir, 2.6);
    wantView = 3.6;
    wantLook = center.add(new THREE.Vector3(0, 0.2, 0));   // postavy v strede, pod nimi pás s číslami
    wantPos = wantLook.clone().addScaledVector(side, 20).add(new THREE.Vector3(0, 5.5, 0));
    // stromy a kamene medzi kamerou a súbojom sa skryjú
    for (const o of obstacles) {
      const v = o.position.clone().sub(center).setY(0), front = v.dot(side), along = Math.abs(v.dot(fight.dir.clone().setY(0)));
      o.visible = !(front > -1.2 && front < 22 && along < 9);
    }
  } else {
    if (!obstacles[0].visible || obstacles.some(o => !o.visible)) obstacles.forEach(o => { o.visible = true; });
    wantLook = hero.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    wantPos = wantLook.clone().add(new THREE.Vector3(0, 12.1, 17));
    wantView = VIEW;
  }
  const kc = 1 - Math.exp(-dt * 2.6);
  camPos.lerp(wantPos, kc); camLook.lerp(wantLook, kc);
  if (Math.abs(viewZoom - wantView) > 0.001) { viewZoom += (wantView - viewZoom) * kc; setView(viewZoom); }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  updateCompass();
  document.getElementById('help').style.opacity = fight.on ? 0 : 1;
  placeCard();
  sun.target.position.copy(hero.position); sun.position.add(hero.position);

  renderer.setRenderTarget(low); renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  post.uniforms.tScene.value = low.texture;
  renderer.render(postScene, postCam);
  requestAnimationFrame(tick);
}
resize();
requestAnimationFrame(tick);
window.__s = { cast, hero, slime, fight, press, S3, finds, setNight: v => { night = v; } };
