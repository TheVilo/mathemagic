// Spoločný základ scény: renderer, svetlo, materiály, modely prírody a stavieb, častice, dithering a pixelové písmo.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export { THREE };

export const canvas = document.getElementById('c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const PAPER = 0xd9d6ce;
export const scene = new THREE.Scene();
scene.background = new THREE.Color(PAPER);
scene.fog = new THREE.Fog(PAPER, 26, 60);
export const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
export const U = { time: { value: 0 }, hero: { value: new THREE.Vector3() }, gray: { value: 1 }, desat: { value: 0.35 }, tex: { value: 1 } };   // tex = sila procedurálnej textúry // gray: 1 = modely v šedej (hra), 0 = vo farbe (stlmenej)
export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...o });

// ---------- svetlo ----------
export const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.15);
export const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);

// ---------- materiály (tráva a kvety sa hýbu vo vetre, tráva uhne čarodejníkovi) ----------
const IP = `
  #ifdef USE_INSTANCING
    vec3 ip = instanceMatrix[3].xyz;
  #else
    vec3 ip = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
`;
function animate(mat, code) {
  mat.onBeforeCompile = sh => { sh.uniforms.uTime = U.time; sh.uniforms.uHero = U.hero; sh.vertexShader = 'uniform float uTime; uniform vec3 uHero;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + code); };
  mat.customProgramCacheKey = () => code;
  return mat;
}
const SWAY = IP + `
  float hh = max(0.0, position.y);
  float sw = sin(uTime * 1.3 + ip.x * 0.2 + ip.z * 0.13) * 0.5 + sin(uTime * 2.7 + ip.z * 0.4) * 0.15;
  transformed.x += sw * 0.03 * hh * hh; transformed.z += sw * 0.02 * hh * hh;
`;
export const MAT = {
  ground: (() => { const m = std(0xffffff, { flatShading: false, vertexColors: true }); m.onBeforeCompile = sh => addTex(sh, 5); m.customProgramCacheKey = () => 'groundTex'; return m; })(),
  grass: animate(std(0x5e5b55, { flatShading: false }), IP + `
    float h = position.y / 0.4;
    transformed.x += (sin(uTime * 1.8 + ip.x * 0.35 + ip.z * 0.25) * 0.5 + sin(uTime * 3.1 + ip.x * 1.3) * 0.18) * 0.12 * h * h;
    vec2 d = ip.xz - uHero.xz; float k = smoothstep(1.1, 0.0, length(d));
    transformed.xz += normalize(d + 0.0001) * k * 0.3 * h; transformed.y -= k * 0.2 * h;
  `),
  flower: animate(std(0xd43a3a, { emissive: 0x3a0505 }), IP + `
    transformed.x += sin(uTime * 1.8 + ip.x * 0.35 + ip.z * 0.25) * 0.025;
  `),
  stone: std(0xb1ada5),
};
export const GRASS = new THREE.BufferGeometry();
GRASS.setAttribute('position', new THREE.Float32BufferAttribute([-0.025, 0, 0, 0.025, 0, 0, 0.04, 0.4, 0], 3));
GRASS.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
export const FLOWER = new THREE.IcosahedronGeometry(0.11, 0);

// ---------- procedurálna textúra (vo svete, nie na UV): listy, kôra, kameň, tehly, zem ----------
// typ: 0 nič, 1 listy (zhluky), 2 kôra (zvislé pruhy), 3 kameň (škvrny), 4 tehly, 5 zem (hrudy), 6 jemný šum
const TEX_GLSL = `
  varying vec3 vWP; uniform float uTex;
  float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
  float texPat(int t, vec3 p){
    if (t == 1) return smoothstep(0.3, 0.7, vn3(p * 2.4) * 0.6 + vn3(p * 6.0) * 0.4);
    if (t == 2) return 0.5 + 0.5 * sin(p.x * 11.0 + p.z * 9.0 + vn3(p * vec3(3.0, 0.5, 3.0)) * 7.0);
    if (t == 3) return smoothstep(0.3, 0.7, vn3(p * 2.5)) * 0.7 + vn3(p * 9.0) * 0.3;
    if (t == 4) { vec2 b = vec2(p.x + p.z, p.y) * vec2(2.0, 4.0); b.x += step(1.0, mod(floor(b.y), 2.0)) * 0.5; vec2 f = fract(b);
      return clamp(1.0 - step(0.88, max(f.x, f.y)) * 0.9 + vn3(p * 6.0) * 0.25 - 0.12, 0.0, 1.0); }
    if (t == 5) return vn3(p * 0.9) * 0.5 + vn3(p * 4.5) * 0.5;
    return vn3(p * 6.0);
  }`;
const TEX_AMP = [0, 0.55, 0.5, 0.45, 0.5, 0.35, 0.2];
function addTex(sh, t) {
  if (!t) return;
  sh.uniforms.uTex = U.tex;
  sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
    vec4 tpW = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      tpW = instanceMatrix * tpW;
    #endif
    vWP = (modelMatrix * tpW).xyz;`);
  sh.fragmentShader = TEX_GLSL + '\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    diffuseColor.rgb *= mix(1.0, ${(1 - TEX_AMP[t]).toFixed(2)} + ${(TEX_AMP[t] * 2).toFixed(2)} * texPat(${t}, vWP), uTex);`);
}
// typ textúry podľa mena materiálu (Kenney/KayKit)
export const texType = name => /leaf/i.test(name) ? 1 : /bark|wood/i.test(name) ? 2 : /stone/i.test(name) ? 3 : /hexagon|medieval/i.test(name) ? 4 : /grass|dirt/i.test(name) ? 5 : 6;

// farby modelov sa prevedú do šedej (k = jas); keepColor nechá farbu (červené huby); t = typ textúry
export function tone(mat, k = 1.05, sway = false, t = 0) {
  mat.onBeforeCompile = sh => {
    addTex(sh, t);
    sh.uniforms.uTime = U.time; sh.uniforms.uGray = U.gray; sh.uniforms.uDesat = U.desat;
    sh.fragmentShader = 'uniform float uGray; uniform float uDesat;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n  float lumG = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\n  diffuseColor.rgb = mix(mix(diffuseColor.rgb, vec3(lumG), uDesat), vec3(lumG), uGray) * ${k.toFixed(2)};`);
    if (sway) sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY);
  };
  mat.customProgramCacheKey = () => 'tone' + k + (sway ? 's' : '') + 't' + t;
  return mat;
}
function prepMat(mat, sway, keepColor, k, t = 0) {
  const m = mat.clone();
  m.flatShading = true; m.metalness = 0; m.roughness = 0.9;               // fazety na stromoch a skalách = textúra (každá plôška iný tón)
  if (keepColor) return m;
  return tone(m, k, sway, t);
}

// ---------- modely: Kenney Nature Kit, KayKit Medieval (stavby) a KayKit Dungeon (interiér), všetko CC0 ----------
export const loader = new GLTFLoader();
export const loadGlb = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
const KENNEY = ['log', 'log_large', 'log_stack', 'stump_old', 'stump_oldTall', 'stump_round', 'rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'rock_smallA', 'rock_smallB', 'rock_smallC', 'rock_smallFlatA', 'rock_tallA', 'rock_tallB',
  'statue_columnDamaged', 'statue_column', 'statue_obelisk', 'statue_block', 'campfire_stones', 'tent_smallClosed', 'plant_bush', 'plant_bushLarge', 'plant_bushSmall', 'mushroom_redGroup', 'mushroom_tanGroup', 'sign',
  'tree_oak', 'tree_detailed', 'tree_fat', 'tree_default', 'tree_cone', 'tree_pineDefaultA', 'tree_pineRoundB', 'tree_pineTallA', 'tree_thin', 'tree_tall', 'tree_simple'];
const STAVBY = ['building_tower_A_blue', 'building_tower_B_blue', 'building_well_blue', 'building_tavern_blue'];
const DUNGEON = ['floor_wood_large', 'wall', 'wall_corner', 'table_medium', 'barrel_large', 'shelves', 'torch_mounted', 'keg', 'candle_lit', 'crates_stacked', 'coin_stack_medium', 'stool', 'box_small'];
export const MODELS = {};   // názov → časti {geo, mat} (statické, kreslia sa cez inštancie)
export const RAW = {};      // názov → celá scéna (truhlica, kľúč – hýbu sa)
export function loadProps() {
  const one = (name, url, scale, k = 1.05) => new Promise(res => loader.load(url, g => {
    g.scene.updateMatrixWorld(true);
    const parts = [], sway = name.startsWith('tree_'), keep = name.startsWith('mushroom_red');
    g.scene.traverse(o => { if (o.isMesh) parts.push({ geo: o.geometry.clone().applyMatrix4(o.matrixWorld).scale(scale, scale, scale), mat: prepMat(o.material, sway, keep && /red/i.test(o.material.name + o.material.color.getHexString()), k, texType(o.material.name)) }); });
    MODELS[name] = parts; res();
  }, undefined, () => res()));
  const sc = n => n.startsWith('tree_') ? 3.1 : n.startsWith('statue_') ? 2.3 : n.startsWith('tent') || n.startsWith('campfire') ? 2.2 : n === 'sign' ? 2 : 1.7;
  const raw = (name, url) => loadGlb(url).then(g => { g.scene.traverse(o => { if (o.isMesh) { o.material = prepMat(o.material, false, false, 1.0); o.castShadow = true; o.receiveShadow = true; } }); RAW[name] = g.scene; }).catch(() => {});
  return Promise.all([
    // les a kríky sú tmavé (ako v prírode), skaly a stavby svetlé – jedna paleta pre celý svet
    ...KENNEY.map(n => one(n, `modely/priroda/${n}.glb`, sc(n), 0.8)),   // všetky materiály rovnako – tmavosť určuje len svetlo (kresba.js uOne)
    ...STAVBY.map(n => one(n, `modely/stavby/${n}.gltf`, n === 'building_tavern_blue' ? 4.6 : 3.6)),
    ...DUNGEON.map(n => one(n, `modely/dungeon/${n}.glb`, 0.75, 1.0)),
    raw('chest', 'modely/dungeon/chest.glb'), raw('key', 'modely/dungeon/key.glb'),
  ]);
}
// inštancie jedného modelu (veľa stromov = jedno kreslenie)
export function inst(parent, geo, mat, items, height, shadow = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => { q.setFromAxisAngle(Y, it.r || 0); s.setScalar(it.s || 1); p.set(it.x, it.y ?? height(it.x, it.z), it.z); m.compose(p, q, s); mesh.setMatrixAt(i, m); });
  mesh.count = items.length; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.computeBoundingSphere();
  parent.add(mesh); return mesh;
}
export function placeModels(parent, props, height) {
  const by = {};
  for (const p of props) (by[p.m] = by[p.m] || []).push({ ...p, y: p.y ?? height(p.x, p.z) - 0.04 });
  for (const [name, items] of Object.entries(by)) for (const part of MODELS[name] || []) inst(parent, part.geo, part.mat, items, height);
}

// ---------- častice (farebné) ----------
const PMAX = 1600, pPos = new Float32Array(PMAX * 3), pVel = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
export const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.2, vertexColors: true }));
points.frustumCulled = false; scene.add(points);
let pi = 0;
const tmpC = new THREE.Color();
export function spark(p, vx, vy, vz, life, color) {
  const i = pi; pi = (pi + 1) % PMAX; tmpC.set(color);
  pPos.set([p.x, p.y, p.z], i * 3); pVel.set([vx, vy, vz], i * 3); pCol.set([tmpC.r, tmpC.g, tmpC.b], i * 3); pLife[i] = life;
}
export function burst(p, n, speed, color, life = 0.9) {
  for (let s = 0; s < n; s++) { const a = Math.random() * 6.28, u = Math.random() * 2 - 1, r = speed * (0.4 + Math.random() * 0.6), q = Math.sqrt(1 - u * u); spark(p, Math.cos(a) * r * q, Math.abs(u) * r, Math.sin(a) * r * q, life * (0.6 + Math.random() * 0.6), color); }
}
export function updateParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -99; continue; }
    pLife[i] -= dt; pVel[i * 3 + 1] -= dt * 1.5;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

// ---------- dithering + rozmazanie do hĺbky ----------
// scéna v nízkom rozlíšení → 3 tóny Bayer (sýte farby ostanú ako akcent) → rozmazanie mimo pásma postáv
const LOW_H = 270;
const low = new THREE.WebGLRenderTarget(16, 16), dith = new THREE.WebGLRenderTarget(16, 16, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const ditherMat = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: low.texture }, uLow: { value: new THREE.Vector2() }, uHurt: { value: 0 }, uFade: { value: 0 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tScene; uniform vec2 uLow; uniform float uHurt; uniform float uFade; varying vec2 vUv;
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
      if (uFade > 0.0 && th < uFade) col = paper;
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
export const blurMat = new THREE.ShaderMaterial({
  uniforms: { tImg: { value: dith.texture }, uLow: { value: new THREE.Vector2() }, uFocus: { value: 0.5 }, uBand: { value: 0.2 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tImg; uniform vec2 uLow; uniform float uFocus; uniform float uBand; varying vec2 vUv;
    void main(){
      float dy = abs(vUv.y - uFocus); vec2 q = vUv - 0.5;
      float r = smoothstep(uBand, uBand + 0.32, dy) * 3.0 + dot(q, q) * 3.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 20; i++) { float fi = float(i), a = fi * 2.39996; acc += texture2D(tImg, vUv + vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 20.0) * r / uLow).rgb; }
      gl_FragColor = vec4(acc / 20.0 * (1.0 - dot(q, q) * 0.35), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ditherMat);
quadScene.add(quad);
export function setView(v) {
  const a = innerWidth / innerHeight, vv = a < 1 ? v * 1.15 / a : v;   // na výšku (mobil) vidno celú šírku
  camera.left = -vv * a; camera.right = vv * a; camera.top = vv; camera.bottom = -vv; camera.updateProjectionMatrix();
}
export function resize(v) {
  renderer.setSize(innerWidth, innerHeight, false);
  setView(v);
  const lw = Math.round(LOW_H * innerWidth / innerHeight);
  low.setSize(lw, LOW_H); dith.setSize(lw, LOW_H);
  ditherMat.uniforms.uLow.value.set(lw, LOW_H); blurMat.uniforms.uLow.value.set(lw, LOW_H);
}
export function render() {
  renderer.setRenderTarget(low); renderer.render(scene, camera);
  quad.material = ditherMat; renderer.setRenderTarget(dith); renderer.render(quadScene, quadCam);
  quad.material = blurMat; renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
}

// ---------- pixelové písmo a ikonky ----------
export const PIX = {
  '(': '00010001000100001000010000010000010', ')': '01000001000001000010000100010001000', '!': '00100001000010000100001000000000100', '√': '00111001000010000100101000110000100', '²': '01100100100010001000111100000000000', '³': '11100000100110000010111000000000000',   // funkcie kalkulačky
  '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111', '3': '11111000100010000010000011000101110',
  '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110', '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000',
  '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100', '+': '00000001000010011111001000010000000', '-': '00000000000000011111000000000000000',
  '=': '00000000001111100000111110000000000', '?': '01110100010000100010001000000000100', '←': '00000001000100011111010000010000000', '×': '00000100010101000100010101000100000', '÷': '00100000001111100000001000000000000',
};
export function pix(str) {
  const ch = [...String(str)]; let d = '';
  ch.forEach((c, k) => { const g = PIX[c]; if (g) for (let i = 0; i < 35; i++) if (g[i] === '1') d += `M${k * 7 + (i % 5)} ${(i / 5) | 0}h1v1h-1z`; });
  return `<svg class="pix" viewBox="0 0 ${ch.length * 7 - 2} 7" shape-rendering="crispEdges"><path d="${d}"/></svg>`;
}
// ikonky 7×7 (kariet a mapy)
const ICO = {
  snow: ['0001000', '1001001', '0101010', '0011100', '0101010', '1001001', '0001000'],
  bolt: ['0000110', '0001100', '0011000', '0111110', '0001100', '0011000', '0110000'],
  fire: ['0001000', '0011000', '0011100', '0111110', '1110111', '1100011', '0111110'],
  shield: ['1111111', '1111111', '1111111', '1111111', '0111110', '0011100', '0001000'],
  echo: ['0010100', '0101010', '1010101', '1010101', '1010101', '0101010', '0010100'],
  coin: ['0011100', '0111110', '1110111', '1101111', '1110111', '0111110', '0011100'],
  heart: ['0110110', '1111111', '1111111', '1111111', '0111110', '0011100', '0001000'],
  clock: ['0011100', '0100010', '1001001', '1001111', '1000001', '0100010', '0011100'],
  swords: ['1000001', '0100010', '0010100', '0001000', '0010100', '0100010', '1000001'],
  key: ['0111000', '1000100', '1000100', '0111000', '0010000', '0011000', '0011100'],
  lock: ['0011100', '0100010', '0100010', '1111111', '1110111', '1110111', '1111111'],
  crown: ['1001001', '1101011', '1111111', '1111111', '1111111', '0000000', '0000000'],
  mug: ['1111100', '1000110', '1000101', '1000101', '1000110', '1111100', '0000000'],
  skull: ['0111110', '1111111', '1001001', '1111111', '0111110', '0101010', '0000000'],
  play: ['0100000', '0110000', '0111000', '0111100', '0111000', '0110000', '0100000'], book: ['0110110', '1001001', '1001001', '1001001', '1001001', '1111111', '0000000'],
  gear: ['0101010', '1111111', '0110110', '1100011', '0110110', '1111111', '0101010'], map: ['1100011', '1011101', '1010101', '1010101', '1010101', '1011101', '1100011'],
  door: ['0111110', '0100010', '0100010', '0100110', '0100010', '0100010', '0111110'], pause: ['0000000', '0110110', '0110110', '0110110', '0110110', '0110110', '0000000'],
  star: ['0001000', '0001000', '1111111', '0111110', '0011100', '0110110', '0100010'], rock: ['0000000', '0011100', '0111110', '1101111', '1111011', '1111111', '0000000'],
  drop: ['0001000', '0011100', '0011100', '0111110', '0111010', '0111110', '0011100'], wind: ['0001100', '1110010', '0000010', '1111100', '0000000', '1111000', '0000100'],
  hat: ['0001000', '0011000', '0011100', '0111100', '0111110', '1111111', '0000000'],
};
export function icon(name, color = 'currentColor', cls = '') {
  const g = (ICO[name] || []).join(''); let d = '';
  for (let i = 0; i < g.length; i++) if (g[i] === '1') d += `M${i % 7} ${(i / 7) | 0}h1v1h-1z`;
  return `<svg class="ico ${cls}" viewBox="0 0 7 7" shape-rendering="crispEdges"><path fill="${color}" d="${d}"/></svg>`;
}
// textúra s pixelovým číslom (runa na kameni)
export function digitTexture(str) {
  const ch = [...String(str)], c = document.createElement('canvas'); c.width = 24 + ch.length * 42; c.height = 72;
  const g = c.getContext('2d'); g.fillStyle = '#e8e4da'; g.fillRect(0, 0, c.width, 72); g.fillStyle = '#1c1d21';
  ch.forEach((n, k) => { const bits = PIX[n]; if (bits) for (let i = 0; i < 35; i++) if (bits[i] === '1') g.fillRect(12 + k * 42 + (i % 5) * 6, 14 + ((i / 5) | 0) * 6, 6, 6); });
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}
