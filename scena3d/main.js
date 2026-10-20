// Mathemagic – skúšobná 3D scéna: skutočné svetlo a tiene, potom dithering (štýl Obra Dinn) s farebnými akcentmi.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

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
const VIEW = 5.2;
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
  g.position.set(x, groundH(x, z) - 0.05, z); g.scale.setScalar(s); g.rotation.y = rng() * 6; scene.add(g);
}
function pine(x, z, s) {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.12, 0.2, 1.4, 6).translate(0, 0.7, 0), trunkMat, 0, 0, 0);
  for (let k = 0; k < 4; k++) addMesh(g, new THREE.ConeGeometry(1.5 - k * 0.3, 1.5, 8).translate(0, 1.6 + k * 0.85, 0), leafDark, 0, 0, 0);
  g.position.set(x, groundH(x, z) - 0.05, z); g.scale.setScalar(s); g.rotation.y = rng() * 6; scene.add(g);
}
function birch(x, z, s) {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.08, 0.12, 3.6, 6).translate(0, 1.8, 0), birchMat, 0, 0, 0);
  for (let k = 0; k < 4; k++) addMesh(g, new THREE.IcosahedronGeometry(0.55, 0).scale(0.8, 1.4, 0.8).translate((rng() - 0.5) * 0.7, 3.0 + k * 0.45, (rng() - 0.5) * 0.7), leafLight, 0, 0, 0);
  g.position.set(x, groundH(x, z) - 0.05, z); g.scale.setScalar(s); g.rotation.y = rng() * 6; scene.add(g);
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
  st.castShadow = st.receiveShadow = true; scene.add(st);
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

// ---------- čarodejník ----------
const hero = new THREE.Group();
const heroBody = new THREE.Group(); hero.add(heroBody);
// plášť: kužeľ, ktorého spodok vlaje vo vetre a za pohybom
const cloakMat = animate(std(0x6c667c, { flatShading: false, side: THREE.DoubleSide }), `
  float f = clamp((0.62 - position.y) / 1.1, 0.0, 1.0);
  float ang = atan(position.z, position.x);
  float speed = length(uVel.xz);
  float flap = sin(uTime * (4.0 + speed * 3.0) + ang * 3.0) * (0.035 + speed * 0.05) + sin(uTime * 7.3 + ang * 5.0) * 0.015;
  transformed.xz += normalize(position.xz + 0.0001) * flap * f;
  transformed.xz -= uVel.xz * f * f * 0.28;
  transformed.y += f * f * speed * 0.08;`);
const cloakGeo = new THREE.ConeGeometry(0.5, 1.25, 28, 10, true).translate(0, 0.0, 0);
const cloak = new THREE.Mesh(cloakGeo, cloakMat); cloak.position.y = 0.78; cloak.castShadow = cloak.receiveShadow = true; heroBody.add(cloak);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), std(0xb8ada2, { flatShading: false })); head.position.y = 1.5; head.castShadow = true; heroBody.add(head);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
for (const sx of [-0.075, 0.075]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), eyeMat); e.position.set(sx, 1.5, 0.19); heroBody.add(e); }
const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.6, 0.05, 28), std(0x2f2c35, { flatShading: false })); brim.position.y = 1.66; brim.castShadow = true; heroBody.add(brim);
// špicatý klobúk so zahnutou špičkou, ktorá sa pri chôdzi pohupuje
const hatMat = animate(std(0x2f2c35, { flatShading: false }), `
  float t = clamp((position.y + 0.5) / 1.0, 0.0, 1.0);
  transformed.x -= t * t * (0.32 + uVel.x * 0.15) + sin(uTime * 3.0) * 0.03 * t * t;
  transformed.z -= t * t * uVel.z * 0.15;`);
const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.0, 18, 8), hatMat); hat.position.y = 2.16; hat.castShadow = true; heroBody.add(hat);
// nohy
const legMat = std(0x25232a);
const legs = [-0.13, 0.13].map(x => { const pv = new THREE.Group(); pv.position.set(x, 0.32, 0); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.34, 6).translate(0, -0.17, 0), legMat); l.castShadow = true; pv.add(l); hero.add(pv); return pv; });
// palica s kryštálom a jeho svetlom
const staff = new THREE.Group(); staff.position.set(0.42, 0.95, 0.12); heroBody.add(staff);
const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.9, 6), std(0x4a3f36)); stick.castShadow = true; staff.add(stick);
const crystalMat = new THREE.MeshBasicMaterial({ color: 0x6fd27a });
const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), crystalMat); crystal.position.y = 1.05; crystal.scale.y = 1.6; staff.add(crystal);
const crystalLight = new THREE.PointLight(0x7dff8a, 1.6, 5, 1.6); crystalLight.position.y = 1.05; staff.add(crystalLight);
hero.position.set(0, 0, 2);
scene.add(hero);

// ---------- Slizko ----------
const slime = new THREE.Group();
const slimeBody = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), std(0x9d9a94, { flatShading: false, roughness: 0.4 }));
slimeBody.position.y = 0.42; slimeBody.castShadow = true; slime.add(slimeBody);
const sEye = new THREE.MeshBasicMaterial({ color: 0xff3a3a });
for (const sx of [-0.2, 0.2]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), sEye); e.position.set(sx, 0.55, 0.52); slime.add(e); }
slime.position.set(-4, 0, 6);
slime.position.y = groundH(-4, 6);
scene.add(slime);

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
let spell = null;
function cast() {
  if (spell) return;
  spell = { t: 0, from: new THREE.Vector3(), to: slime.position.clone().add(new THREE.Vector3(0, 0.5, 0)) };
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

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.left = -VIEW * w / h; camera.right = VIEW * w / h; camera.updateProjectionMatrix();
  const lh = LOW_H, lw = Math.round(lh * w / h);
  low.setSize(lw, lh);
  post.uniforms.uLow.value.set(lw, lh);
}
addEventListener('resize', resize);

// ---------- ovládanie ----------
const keys = {};
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') { e.preventDefault(); cast(); } });
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let target = null;
canvas.addEventListener('pointerdown', e => {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObject(ground)[0];
  if (hit) target = hit.point.clone();
});
document.getElementById('cast').onclick = cast;
let night = false;
const bN = document.getElementById('bNight'), bT = document.getElementById('bTones'), bD = document.getElementById('bDither');
bN.onclick = () => { night = !night; bN.classList.toggle('on', night); };
bT.onclick = () => { post.uniforms.uTones.value = post.uniforms.uTones.value > 2.5 ? 2 : 3; bT.classList.toggle('on', post.uniforms.uTones.value > 2.5); };
bD.onclick = () => { post.uniforms.uOn.value = 1 - post.uniforms.uOn.value; bD.classList.toggle('on', post.uniforms.uOn.value > 0.5); };

// ---------- slučka ----------
const clock = new THREE.Clock();
const vel = new THREE.Vector3(), camPos = new THREE.Vector3(0, 9, 13);
let walk = 0, dayK = 1;
function tick() {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  U.time.value = t; pond.material.uniforms.uTime.value = t;

  // pohyb
  const dir = new THREE.Vector3((keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), 0, (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0));
  if (dir.lengthSq()) target = null;
  else if (target) { dir.subVectors(target, hero.position).setY(0); if (dir.length() < 0.15) { target = null; dir.set(0, 0, 0); } }
  if (dir.lengthSq()) dir.normalize();
  vel.lerp(dir.multiplyScalar(3.2), 1 - Math.exp(-dt * 8));
  const nx = hero.position.x + vel.x * dt, nz = hero.position.z + vel.z * dt;
  if (Math.hypot(nx - 5, nz - 3) > 4.4) { hero.position.x = nx; hero.position.z = nz; } else vel.multiplyScalar(0.5);
  hero.position.y = groundH(hero.position.x, hero.position.z);
  const speed = vel.length();
  if (speed > 0.2) hero.rotation.y = Math.atan2(vel.x, vel.z) + (hero.rotation.y - Math.atan2(vel.x, vel.z)) * Math.exp(-dt * 10);
  walk += dt * speed * 3.2;
  legs[0].rotation.x = Math.sin(walk) * 0.7 * Math.min(1, speed);
  legs[1].rotation.x = -Math.sin(walk) * 0.7 * Math.min(1, speed);
  heroBody.position.y = Math.abs(Math.sin(walk)) * 0.07 * Math.min(1, speed) + Math.sin(t * 2) * 0.015;
  staff.rotation.z = -0.12 + Math.sin(walk) * 0.12 * Math.min(1, speed);
  staff.rotation.x = Math.cos(walk) * 0.15 * Math.min(1, speed);
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
    if (spell.t < 0.45) { // nabíjanie: kryštál žiari, iskry sa zbiehajú
      const k = spell.t / 0.45;
      staff.rotation.x = -0.6 * k; crystal.scale.setScalar(1 + k * 0.8); crystal.scale.y *= 1.6;
      crystalLight.intensity = 2 + k * 14;
      for (let s = 0; s < 4; s++) { const a = Math.random() * 6.28, r = 1.2; spark(cw.x + Math.cos(a) * r, cw.y + (Math.random() - 0.5), cw.z + Math.sin(a) * r, -Math.cos(a) * 2.4, 0, -Math.sin(a) * 2.4, 0.45); }
      spell.from.copy(cw);
    } else if (spell.t < 1.15) { // let
      const k = (spell.t - 0.45) / 0.7, e = k * k * (3 - 2 * k);
      orb.visible = true; orbLight.intensity = 14;
      orb.position.lerpVectors(spell.from, spell.to, e); orb.position.y += Math.sin(e * Math.PI) * 2.2;
      orb.scale.setScalar(1 + Math.sin(t * 30) * 0.12);
      for (let s = 0; s < 5; s++) spark(orb.position.x, orb.position.y, orb.position.z, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 0.6);
      crystalLight.intensity *= 0.9; crystal.scale.set(1, 1.6, 1); staff.rotation.x *= 0.9;
    } else if (!spell.hit) {
      spell.hit = true; orb.visible = false;
      ring.visible = true; ring.position.copy(spell.to).setY(slime.position.y + 0.12); ring.scale.setScalar(0.2);
      for (let s = 0; s < 160; s++) { const a = Math.random() * 6.28, u = Math.random() * 2 - 1, r = 2 + Math.random() * 4; spark(spell.to.x, spell.to.y, spell.to.z, Math.cos(a) * r * Math.sqrt(1 - u * u), Math.abs(u) * r, Math.sin(a) * r * Math.sqrt(1 - u * u), 0.9 + Math.random() * 0.5); }
      spell.flash = 1;
    } else {
      spell.flash = Math.max(0, spell.flash - dt * 2.2);
      orbLight.intensity = 0;
      ring.scale.setScalar(0.2 + (1 - spell.flash) * 3.2);
      ring.material.color.setScalar(1).lerp(new THREE.Color(0x8dff98), 1);
      slimeBody.scale.set(1 + spell.flash * 0.25, 1 - spell.flash * 0.3, 1 + spell.flash * 0.25);
      crystalLight.intensity += spell.flash * 6;
      fireLight.intensity += spell.flash * 0;
      if (spell.flash <= 0) { ring.visible = false; spell = null; }
    }
    if (spell && spell.hit) { orb.visible = true; orb.position.copy(spell.to); orb.scale.setScalar(spell.flash * 3 + 0.001); orbLight.intensity = spell.flash * 30; }
  } else orb.visible = false;
  // Slizko sa pruží
  if (!spell || !spell.hit) slimeBody.scale.set(1 + Math.sin(t * 3) * 0.05, 0.75 - Math.sin(t * 3) * 0.05, 1 + Math.sin(t * 3) * 0.05);

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
  camPos.lerp(new THREE.Vector3(hero.position.x, hero.position.y + 22, hero.position.z + 16), 1 - Math.exp(-dt * 3));
  camera.position.copy(camPos);
  camera.lookAt(hero.position.x, hero.position.y + 0.9, hero.position.z);
  sun.target.position.copy(hero.position); sun.position.add(hero.position);

  renderer.setRenderTarget(low); renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  post.uniforms.tScene.value = low.texture;
  renderer.render(postScene, postCam);
  requestAnimationFrame(tick);
}
resize();
requestAnimationFrame(tick);
window.__s = { cast, hero, setNight: v => { night = v; } };
