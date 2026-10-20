// Ukážka: dithering z matematických znamienok namiesto bodiek.
// Scéna sa vykreslí rovnako ako v hre (svetlo, tiene), potom sa rozdelí na bunky a do každej sa nakreslí znamienko podľa tmy:
// svetlo = nič, − ÷ + ×, tma = ✳ (+ a × naraz). Hrúbka čiary rastie s tieňom. Varianty: atrament, plusy (hrúbka), farebné, mix.
import { THREE, renderer, scene, camera, U, sun, hemi, MAT, GRASS, FLOWER, inst, placeModels, loadProps, burst, spark, updateParticles, resize as resizeBase, render as renderBayer, setView } from './svet.js';
import { hero, crystal, crystalLight, loadHero, heroPlay, updateHero, loadFighters, makeFighter } from './postavy.js';
import { genRoom } from './gen.js';
import { pix, points } from './svet.js';

// ---------- scéna: čistinka, čarodejník a štyria bojovníci ----------
await Promise.all([loadProps(), loadFighters(), loadHero()]);
let room = null, R = null;
const fighters = [];
function build(seed) {
  if (room) scene.remove(room);
  fighters.length = 0;
  R = genRoom(seed, 0, 'boj');
  room = new THREE.Group(); scene.add(room);
  const geo = new THREE.PlaneGeometry(R.W + 16, R.H + 16, (R.W + 16) * 2, (R.H + 16) * 2);
  geo.rotateX(-Math.PI / 2); geo.translate(R.W / 2, 0, R.H / 2);
  const pa = geo.attributes.position, col = new Float32Array(pa.count * 3), c1 = new THREE.Color(0xd8d4ca), c2 = new THREE.Color(0xe4e0d7), cc = new THREE.Color();
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i); pa.setY(i, R.height(x, z)); cc.copy(c1).lerp(c2, R.onPath(x, z) ? 1 : 0); col.set([cc.r, cc.g, cc.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, MAT.ground); ground.receiveShadow = true; room.add(ground); ground.layers.enable(2);
  inst(room, GRASS, MAT.grass, R.grass, R.height, false).layers.enable(2);
  inst(room, FLOWER, MAT.flower, R.flowers.map(f => ({ ...f, y: R.height(f.x, f.z) + 0.12 + f.s * 0.05 })), R.height);
  const c = R.camp;
  // ukážka: veža a stromy vždy pri súboji, aby bolo vidno, ako vyzerá všetko dokopy
  const show = [{ m: 'building_tower_A_blue', x: c.x + 1.5, z: c.z - 5.2, s: 1, r: 0.4 }, { m: 'tree_oak', x: c.x - 7.5, z: c.z - 3.8, s: 1.1, r: 1 }, { m: 'tree_pineRoundB', x: c.x - 5.2, z: c.z - 5.5, s: 1, r: 2 },
    { m: 'tree_default', x: c.x + 5.8, z: c.z - 3.2, s: 1.1, r: 0.5 }, { m: 'tree_detailed', x: c.x - 8.8, z: c.z + 2.5, s: 1, r: 3 }, { m: 'rock_largeA', x: c.x + 4.2, z: c.z + 3.2, s: 1, r: 1 }];
  const clear = (x, z) => show.every(q => Math.hypot(q.x - x, q.z - z) > 3);
  placeModels(room, [...R.props.filter(p => (Math.hypot(p.x - c.x, p.z - c.z) > 3.5 || p.col < 0.3) && clear(p.x, p.z) && !/^(building_|statue_)/.test(p.m)), ...show], R.height);   // náhodné veže by zakrývali súboj
  hero.position.set(c.x - 4.2, R.height(c.x - 4.2, c.z), c.z); hero.rotation.y = Math.PI / 2;
  ['rogue', 'knight', 'barbarian', 'hooded'].forEach((k, i) => {
    const f = makeFighter(k, 0.85, room), a = -0.9 + i * 0.6, x = c.x + Math.cos(a) * 2.6, z = c.z + Math.sin(a) * 2.6;
    f.g.position.set(x, R.height(x, z), z); f.g.rotation.y = Math.atan2(hero.position.x - x, hero.position.z - z);
    f.play(k === 'hooded' ? '2H_Ranged_Aiming' : k === 'barbarian' ? '2H_Melee_Idle' : 'Idle');
    f.g.traverse(o => o.layers.enable(1)); fighters.push(f);
  });
  hero.traverse(o => o.layers.enable(1));
}
build(1 + Math.floor(Math.random() * 9999));
// TÓNY POSTÁV podľa častí modelu: hrdina = čierny klobúk, fialový plášť, svetlá palica s kryštálom; nepriatelia = tmavé telo, svetlé zbrane
const WEAPONS = ['Knife', 'Knife_Offhand', '1H_Sword', '2H_Axe', '2H_Crossbow', 'Badge_Shield'];
function styleChars() {
  hero.traverse(o => {
    if (!o.isMesh || !o.material.color) return;
    const n = o.name, m = o.material;
    if (n === '2H_Staff') m.color.setRGB(1, 0.92, 0.75);              // svetlá palica (v tieni stmavne)
  });
  for (const f of fighters) f.g.traverse(o => {
    if (!o.isMesh || !o.material.color || /_Cape$/.test(o.name)) return;
    const m = o.material;
    if (WEAPONS.includes(o.name)) m.color.setRGB(1, 1, 1);                  // svetlé zbrane, telo ostáva prirodzené
  });
}
styleChars();
// postavy majú v modeli svetlé farby ako zem → v ukážke ich stmavíme v materiáli (ako stromy), aby čierne bolo čierne
function darken(root, k) { root.traverse(o => { if (o.isMesh && o.material && o.material.color && !/_Cape$/.test(o.name)) o.material.color.multiplyScalar(k); }); }

// ---------- druhé slnko (z inej strany): kde tieň vrhajú obe svetlá = dvojitý tieň ----------
const sun2 = new THREE.DirectionalLight(0xffffff, 0.9);
sun2.castShadow = true; sun2.shadow.mapSize.set(2048, 2048);
Object.assign(sun2.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
sun2.shadow.bias = -0.0006; sun2.shadow.normalBias = 0.03;
scene.add(sun2, sun2.target);

// kontrasvetlo: zozadu a zboku nasvieti okraje častí (okraj klobúka, ramená, zbraň)
const rim = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(rim, rim.target);

// ---------- štyri kúzla podľa znamienka + čísla zásahu ----------
// + príroda (zelená guľa s lístím), − ľad (modrý rýchly hrot), × oheň (veľká ohnivá guľa), ÷ blesk (žltý okamžitý zásah)
const SPELLS = [
  { op: '+', name: 'Príroda', col: 0x6fe08a, dur: 0.5, size: 1, arc: 1.2 },
  { op: '-', name: 'Ľad', col: 0x7fc8ff, dur: 0.28, size: 0.8, arc: 0.1 },
  { op: '×', name: 'Oheň', col: 0xff7a3a, dur: 0.6, size: 1.7, arc: 1.8 },
  { op: '÷', name: 'Blesk', col: 0xffe14a, dur: 0.4, size: 0.6, arc: 0 },
];
const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xc8ffd0 }));
const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0x7fc8ff })); shard.scale.set(1.0, 1.0, 3.6);
const orbLight = new THREE.PointLight(0x7dff8a, 0, 4.5, 1.6); scene.add(orbLight); orb.visible = false; shard.visible = false; scene.add(orb, shard);
const boltGroup = new THREE.Group(); scene.add(boltGroup);
[orb, shard, points, crystal].forEach(o => o.layers.enable(4));   // vrstva 4 = všetko, čo patrí kúzlu
let spellT = 0, spellTo = null, spellCol = 0x8dff98, spellI = 0, spell = SPELLS[0], prob = null;
const labelEl = document.getElementById('spellName');
function makeProblem(op) {
  const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  if (op === '+') { const a = r(2, 9), b = r(2, 9); return { text: `${a}+${b}`, v: a + b }; }
  if (op === '-') { const a = r(8, 18), b = r(2, a - 2); return { text: `${a}-${b}`, v: a - b }; }
  if (op === '×') { const a = r(2, 9), b = r(2, 9); return { text: `${a}×${b}`, v: a * b }; }
  const b = r(2, 9), v = r(2, 9); return { text: `${b * v}÷${b}`, v };
}
function castNext() {
  const f = fighters[Math.floor(Math.random() * fighters.length)];
  spell = SPELLS[spellI++ % SPELLS.length]; prob = makeProblem(spell.op);
  spellTo = f; spellT = 0; spellCol = spell.col; glyphMat.uniforms.uSpellG.value = { '+': 3, '-': 2, '×': 4, '÷': 5 }[spell.op];
  orb.material.color.set(spellCol).lerp(new THREE.Color(0xffffff), 0.12); orbLight.color.set(spellCol);
  hero.rotation.y = Math.atan2(f.g.position.x - hero.position.x, f.g.position.z - hero.position.z);
  heroPlay('Spellcast_Shoot', 0.08, 0.9);
  if (labelEl) { labelEl.innerHTML = `<span style="color:#${spellCol.toString(16).padStart(6, '0')}">${pix(spell.op)}</span> ${spell.name} <b>${pix(prob.text + '=' + prob.v)}</b>`; labelEl.classList.remove('show'); void labelEl.offsetWidth; labelEl.classList.add('show'); }
}
// otrasy zeme a záblesk
let shake = 0; const flash = new THREE.Vector4(1, 1, 1, 0);
const effects = [];   // doznievajúce efekty (ohnivý stĺp, mráz, lístie)
// blesk: lomená čiara z kryštálu do cieľa (+ vetvy)
function lightning(from, to, keep) {
  if (!keep) boltGroup.clear();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe14a }), pts = [from.clone()];
  for (let k = 1; k < 8; k++) pts.push(from.clone().lerp(to, k / 8).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8)));
  pts.push(to.clone());
  for (let k = 0; k < pts.length - 1; k++) { const seg = new THREE.Mesh(new THREE.BoxGeometry(keep ? 0.1 : 0.2, keep ? 0.1 : 0.2, pts[k].distanceTo(pts[k + 1])), mat); seg.position.copy(pts[k]).lerp(pts[k + 1], 0.5); seg.lookAt(pts[k + 1]); seg.layers.enable(4); boltGroup.add(seg); }
  if (!keep) for (let b = 0; b < 3; b++) { const i = 2 + Math.floor(Math.random() * 5), a = pts[i]; lightning(a, a.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 3)), true); }
}
// číslo zásahu vyletí z nepriateľa (pixelové písmo vo farbe kúzla)
function damageNumber(f, v, col) {
  const p = f.g.position.clone().add(new THREE.Vector3(0, 2.2, 0)).project(camera), d = document.createElement('div');
  d.className = 'dmg'; d.style.color = '#' + col.toString(16).padStart(6, '0'); d.innerHTML = pix('-' + v);
  d.style.left = (p.x + 1) / 2 * innerWidth + 'px'; d.style.top = (1 - p.y) / 2 * innerHeight + 'px';
  d.style.setProperty('--dx', ((Math.random() - 0.5) * 60).toFixed(0) + 'px');
  document.body.appendChild(d); setTimeout(() => d.remove(), 1300);
}

// ---------- atlas znakov: naše pixelové písmo 5×7, zoradené od najmenej po najviac atramentu ----------
const GLYPH_PIX = {
  '·': '00000000000000000100000000000000000', '-': '00000000000000011111000000000000000', '+': '00000001000010011111001000010000000',
  '1': '00100011000010000100001000010001110', '7': '11111000010001000100010000100001000', '4': '00010001100101010010111110001000010',
  '2': '01110100010000100010001000100011111', '3': '11111000100010000010000011000101110', '5': '11111100001111000001000011000101110',
  '9': '01110100011000101111000010001001100', '6': '00110010001000011110100011000101110', '0': '01110100011001110101110011000101110',
  '8': '01110100011000101110100011000101110', '■': '11111111111111111111111111111111111',
};
const GLYPH_3x5 = { '·': '000000010000000', '-': '000000111000000', '+': '000010111010000', '1': '010110010010111', '7': '111001010010010', '4': '101101111001001',
  '2': '111001111100111', '3': '111001111001111', '5': '111100111001111', '9': '111101111001111', '6': '111100111101111', '0': '111101101101111', '8': '111101111101111', '■': '111111111111111' };
// atlas: znaky zoradené od najmenej po najviac atramentu, každý w×h na mriežke (w+1)
function buildAtlas(font, w, h) {
  const ramp = Object.keys(font).sort((a, b) => font[a].split('1').length - font[b].split('1').length);
  const cv = document.createElement('canvas'); cv.width = ramp.length * (w + 1); cv.height = h;
  const g = cv.getContext('2d'); g.fillStyle = '#fff';
  ramp.forEach((ch, k) => { const bits = font[ch]; for (let i = 0; i < w * h; i++) if (bits[i] === '1') g.fillRect(k * (w + 1) + (i % w), (i / w) | 0, 1, 1); });
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
  return { tex: t, n: ramp.length, w, h };
}
const FONTS = { big: buildAtlas(GLYPH_PIX, 5, 7), small: buildAtlas(GLYPH_3x5, 3, 5) };
// znaky hrán (smer okraja): − | / \ – pevné poradie
function edgeAtlas(font, w, h, order) {
  const cv = document.createElement('canvas'); cv.width = order.length * (w + 1); cv.height = h;
  const g = cv.getContext('2d'); g.fillStyle = '#fff';
  order.forEach((ch, k) => { const b = font[ch]; for (let i = 0; i < w * h; i++) if (b[i] === '1') g.fillRect(k * (w + 1) + (i % w), (i / w) | 0, 1, 1); });
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; return t;
}
const EDGE_BIG = { '-': '00000000000000011111000000000000000', '|': '00100001000010000100001000010000100', '/': '00001000100001000100010000100010000', '\\': '10000010000100000100000100001000001' };
const EDGE_SMALL = { '-': '000000111000000', '|': '010010010010010', '/': '001001010100100', '\\': '100100010001001' };
const EDGES = { big: edgeAtlas(EDGE_BIG, 5, 7, ['-', '|', '/', '\\']), small: edgeAtlas(EDGE_SMALL, 3, 5, ['-', '|', '/', '\\']) };
const RAMP = { length: FONTS.big.n };
const atlas = FONTS.big.tex;
// jednotná paleta celého sveta (deň): všetko sa prichytí na najbližšiu farbu
const PALETTE = [0x15161a, 0x2c3a2e, 0x4f6e3f, 0x86a85f, 0xc7d69a, 0x8d8a83, 0xe6e2d6, 0xc8423a, 0x4a4a86];
// ---------- shader zo znamienok ----------
// fine = scéna v jemnom rozlíšení (bodky postáv aj vzorka pre bunky), mask = kde sú postavy
// amb = tá istá scéna bez slnka → pomer osvetlená/neosvetlená = kde je tieň (nie tmavá farba, ale skutočný tieň); depth = hĺbka
const fine = new THREE.WebGLRenderTarget(16, 16, { depthTexture: new THREE.DepthTexture(16, 16) }), amb = new THREE.WebGLRenderTarget(16, 16), s1 = new THREE.WebGLRenderTarget(16, 16), s2 = new THREE.WebGLRenderTarget(16, 16), spl = new THREE.WebGLRenderTarget(16, 16), mask = new THREE.WebGLRenderTarget(16, 16), maskS = new THREE.WebGLRenderTarget(16, 16), maskG = new THREE.WebGLRenderTarget(16, 16, { depthTexture: new THREE.DepthTexture(16, 16) }), glyphRT = new THREE.WebGLRenderTarget(16, 16, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const glyphMat = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: fine.texture }, tMask: { value: mask.texture }, uRes: { value: new THREE.Vector2() }, uFine: { value: new THREE.Vector2() }, uCell: { value: 7 }, uMode: { value: 1 }, uCharDots: { value: 1 }, uDot: { value: 3 }, tAmb: { value: amb.texture }, tDepth: { value: fine.depthTexture }, uShadow: { value: new THREE.Color(0x2a2f4e) }, uDepth: { value: new THREE.Vector2(0.05, 0.18) }, uLines: { value: 1 }, uSymCol: { value: 0 }, uInvert: { value: 0 }, tAtlas: { value: atlas }, uGlyphN: { value: RAMP.length }, uGlyph: { value: new THREE.Vector2(5, 7) }, uPal: { value: PALETTE.map(c => new THREE.Vector3(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255)) }, uPalOn: { value: 1 }, uScale: { value: 1 }, tGround: { value: maskG.texture }, tGDepth: { value: maskG.depthTexture }, tS1: { value: s1.texture }, tS2: { value: s2.texture }, tSpell: { value: spl.texture }, tEdge: { value: null }, uEdgeOn: { value: 1 }, uPolar: { value: 0 }, uAO: { value: 1 }, uSpellG: { value: 3 }, tSpellM: { value: maskS.texture }, uFlash: { value: new THREE.Vector4(1, 1, 1, 0) } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tScene; uniform sampler2D tMask; uniform vec2 uRes; uniform vec2 uFine; uniform float uCell; uniform int uMode; uniform float uCharDots; uniform float uDot; uniform sampler2D tAmb; uniform sampler2D tDepth; uniform vec3 uShadow; uniform vec2 uDepth; uniform float uLines; uniform float uSymCol; uniform float uInvert; uniform sampler2D tAtlas; uniform float uGlyphN; uniform vec2 uGlyph; uniform vec3 uPal[9]; uniform float uPalOn; uniform float uScale; uniform sampler2D tGround; uniform sampler2D tGDepth; uniform sampler2D tS1; uniform sampler2D tS2; uniform sampler2D tSpell; uniform sampler2D tEdge; uniform float uEdgeOn; uniform float uPolar; uniform float uAO; uniform int uSpellG; uniform sampler2D tSpellM; uniform vec4 uFlash; varying vec2 vUv;
    float bayer(vec2 p){ vec2 q = mod(p, 4.0); int i = int(q.x) + int(q.y) * 4; float b = 0.0;
      if (i==0) b=0.; else if (i==1) b=8.; else if (i==2) b=2.; else if (i==3) b=10.; else if (i==4) b=12.; else if (i==5) b=4.; else if (i==6) b=14.; else if (i==7) b=6.;
      else if (i==8) b=3.; else if (i==9) b=11.; else if (i==10) b=1.; else if (i==11) b=9.; else if (i==12) b=15.; else if (i==13) b=7.; else if (i==14) b=13.; else b=5.;
      return (b + 0.5) / 16.0; }
    float bar(vec2 p, float w, float len){ vec2 d = abs(p) - vec2(len, w); return max(d.x, d.y); }
    // znamienko g v bunke (p od -0.5 do 0.5), w = polovica hrúbky čiary; vracia vzdialenosť (< 0 = vnútri)
    float glyph(int g, vec2 p, float w, float L){
      if (g == 1) return length(p) - w * 1.25;                                             // ·
      if (g == 2) return bar(p, w, L);                                                      // −
      if (g == 3) return min(bar(p, w, L), bar(p.yx, w, L));                                // +
      if (g == 4) { vec2 r = vec2(p.x + p.y, p.x - p.y) * 0.7071; return min(bar(r, w, L), bar(r.yx, w, L)); } // ×
      if (g == 5) return min(bar(p, w, L), min(length(p - vec2(0.0, 0.27)) - w * 1.15, length(p + vec2(0.0, 0.27)) - w * 1.15)); // ÷
      if (g == 7) return min(bar(p - vec2(0.0, 0.16), w, L), bar(p + vec2(0.0, 0.16), w, L)); // =
      if (g == 8) return bar(p, 0.4, 0.4);                                                   // ■
      if (g == 9) return min(min(bar(p - vec2(0.0, 0.15), w, L), bar(p + vec2(0.0, 0.15), w, L)), min(bar(p.yx - vec2(0.0, 0.15), w, L), bar(p.yx + vec2(0.0, 0.15), w, L))); // #
      if (g == 10) return abs(p.x) + abs(p.y) - 0.34;                                        // ✦ (kosoštvorec)
      if (g == 6) { vec2 r = vec2(p.x + p.y, p.x - p.y) * 0.7071; return min(min(bar(p, w, L), bar(p.yx, w, L)), min(bar(r, w, L), bar(r.yx, w, L))); } // ✳ (+ a × naraz) – najtmavšie
      return 1.0;
    }
    vec3 lin2srgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
    float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    // TIEŇ: svetlo = čistý papier s plochým tónom, tieň = znamienka jednou farbou, ďaleko = svetlejšie a tenšie, obrysy predmetov
    vec3 shadowMode(vec2 frag){
      vec3 paper = vec3(0.87, 0.855, 0.82);
      bool isChar = uCharDots > 0.5 && texture2D(tMask, vUv).r > 0.5;
      float cs = isChar ? max(4.0, floor(uCell * 0.6)) : uCell;   // postavy: tie isté znamienka, len menšie
      vec2 cell = floor(frag / cs), p = (frag - (cell + 0.5) * cs) / cs, uvc = (cell + 0.5) * cs / uRes;
      vec3 c = lin2srgb(texture2D(tScene, uvc).rgb), a = lin2srgb(texture2D(tAmb, uvc).rgb);
      float sh = 1.0 - smoothstep(1.15, 1.6, luma(texture2D(tScene, uvc).rgb) / max(luma(texture2D(tAmb, uvc).rgb), 0.004)); // 1 = v tieni (pomer v lineárnom svetle)
      // PRAVIDLO: typ znamienka = svetlo/tieň (+ na svetle, × v tieni), hrúbka = ako tmavé to je, farba = materiál na svetle, jedna farba tieňa v tieni
      float far = smoothstep(uDepth.x, uDepth.y, texture2D(tDepth, uvc).r);
      float th = bayer(cell);
      float L = luma(c), t = 1.0 - smoothstep(0.25, 0.82, L);                         // 0 = svetlé (zem), 1 = tmavé
      bool inShadow = sh > 0.5;
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
      int g = t * 1.2 > th * 0.85 + 0.17 ? (inShadow ? 4 : 3) : 0;                    // + alebo ×, hustota podľa tmy
      float w = (0.035 + t * 0.15) * (1.0 - far * 0.4);
      float cov = clamp(0.5 - glyph(g, p, w, 0.38) * cs, 0.0, 1.0);
      vec3 matCol = mix(c / max(mx, 0.001) * mix(0.35, 0.75, 1.0 - t), vec3(0.105, 0.11, 0.13), t * 0.35); // farba materiálu, s tmou tmavšia
      if (sat < 0.12) matCol = mix(vec3(0.105, 0.11, 0.13), vec3(0.5), 1.0 - t);           // šedé veci = šedý atrament
      vec3 fg = inShadow ? uShadow : matCol;
      if (uSymCol > 0.5) fg = inShadow ? uShadow : (g == 3 ? vec3(0.3, 0.6, 0.36) : fg);
      if (sat > 0.32 && mx > 0.5) fg = c / mx * 0.92;                                      // kúzla, kvety, plášte žiaria svojou farbou
      fg = mix(fg, paper, far * 0.45);
      vec3 bg = mix(paper, uShadow, inShadow ? 0.06 + t * 0.1 : 0.0);
      vec3 col = mix(bg, fg, cov);
      return col;
    }
    void main(){
      vec3 ink = vec3(0.105, 0.11, 0.13), paper = vec3(0.87, 0.855, 0.82);
      vec2 frag = gl_FragCoord.xy;
      if (uMode == 5) { gl_FragColor = vec4(shadowMode(frag), 1.0); return; }
      if (uMode == 8) { // ASCII ČIERNE NA BIELOM: výplň podľa jasu (svetlé = tenké sivé, tmavé = hrubé čierne), hrany = − | / \ podľa smeru okraja
        vec2 cs = (uGlyph + 1.0) * uScale;
        vec2 cell = floor(frag / cs), px = floor(mod(frag, cs) / uScale);
        vec2 st = cs / uRes, uvc = (cell + 0.5) * st;
        float l = smoothstep(0.06, 0.95, luma(lin2srgb(texture2D(tScene, uvc).rgb)));
        // hrany z hĺbky (silueta predmetu) a z jasu (tieň, záhyby) – Sobel na mriežke buniek
        float d00 = texture2D(tDepth, uvc + vec2(-st.x, -st.y)).r, d10 = texture2D(tDepth, uvc + vec2(0.0, -st.y)).r, d20 = texture2D(tDepth, uvc + vec2(st.x, -st.y)).r;
        float d01 = texture2D(tDepth, uvc + vec2(-st.x, 0.0)).r, d21 = texture2D(tDepth, uvc + vec2(st.x, 0.0)).r;
        float d02 = texture2D(tDepth, uvc + vec2(-st.x, st.y)).r, d12 = texture2D(tDepth, uvc + vec2(0.0, st.y)).r, d22 = texture2D(tDepth, uvc + vec2(st.x, st.y)).r;
        vec2 gD = vec2(d20 + 2.0 * d21 + d22 - d00 - 2.0 * d01 - d02, d02 + 2.0 * d12 + d22 - d00 - 2.0 * d10 - d20) * 200.0;
        float lL = luma(texture2D(tScene, uvc - vec2(st.x, 0.0)).rgb), lR = luma(texture2D(tScene, uvc + vec2(st.x, 0.0)).rgb);
        float lD = luma(texture2D(tScene, uvc - vec2(0.0, st.y)).rgb), lU = luma(texture2D(tScene, uvc + vec2(0.0, st.y)).rgb);
        vec2 gL = vec2(lR - lL, lU - lD) * 2.2;
        float d11 = texture2D(tDepth, uvc).r;
        float jump = max(abs(d01 + d21 - 2.0 * d11), abs(d10 + d12 - 2.0 * d11)) * 3000.0;   // skok hĺbky (okraj predmetu), nie sklon zeme
        vec2 g = jump > 6.0 ? gD : (length(gL) > 1.1 ? gL : vec2(0.0));
        float ink = 0.0; vec3 col = vec3(0.07);
        float hsh = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        if (uEdgeOn > 0.5 && length(g) > 0.001) {
          // smer hrany je kolmý na gradient: gradient vodorovný = hrana zvislá |
          float a = atan(g.y, g.x); float ad = abs(cos(a)), bd = abs(sin(a));
          float ei = ad > 0.92 ? 1.0 : bd > 0.92 ? 0.0 : (g.x * g.y > 0.0 ? 3.0 : 2.0);
          ink = px.x < uGlyph.x && px.y < uGlyph.y ? texture2D(tEdge, vec2((ei * (uGlyph.x + 1.0) + px.x + 0.5) / (4.0 * (uGlyph.x + 1.0)), (uGlyph.y - 1.0 - px.y + 0.5) / uGlyph.y)).r : 0.0;
          col = texture2D(tMask, uvc).r > 0.5 ? vec3(0.03) : jump > 6.0 ? vec3(0.15) : vec3(0.62);   // okraj tieňa na zemi svetlý, obrys postavy čierny
        } else {
          float k = clamp((pow(1.0 - l, 1.3) - 0.14) * 1.25, 0.0, 1.0);    // tmavé = viac atramentu, svetlá zem = prázdny papier
          // JASOVÁ HIERARCHIA: zem (aj v tieni) svetlá, predmety stredné, postavy najtmavšie
          bool isChar8 = texture2D(tMask, uvc).r > 0.5;
          bool isGround8 = !isChar8 && texture2D(tGround, uvc).r > 0.5 && abs(texture2D(tGDepth, uvc).r - texture2D(tDepth, uvc).r) < 0.0004;
          if (isGround8) k = min(k, 0.3);                                    // tieň na zemi: len jemné sivé znaky
          else if (isChar8) k = clamp(0.55 + k * 0.6, 0.0, 1.0);             // postava: vždy tmavá a tučná
          else k = min(k, 0.75);
          float v = k * (uGlyphN - 1.0); float b = floor(v);
          float gi = clamp(b + (v - b > hsh ? 1.0 : 0.0), 0.0, uGlyphN - 1.0);
          ink = k < 0.06 ? 0.0 : (px.x < uGlyph.x && px.y < uGlyph.y ? texture2D(tAtlas, vec2((gi * (uGlyph.x + 1.0) + px.x + 0.5) / (uGlyphN * (uGlyph.x + 1.0)), (uGlyph.y - 1.0 - px.y + 0.5) / uGlyph.y)).r : 0.0);
          col = k > 0.5 ? vec3(0.05) : vec3(mix(0.72, 0.4, k * 2.0));           // dve hrúbky: svetlé sivo, tmavé čierno
          if (isGround8) col = vec3(0.68);                                    // tieň na zemi je vždy svetlejší ako postava
          if (k > 0.72 && px.x + 1.0 < uGlyph.x + 1.0) { float i2 = texture2D(tAtlas, vec2((gi * (uGlyph.x + 1.0) + px.x - 1.0 + 0.5) / (uGlyphN * (uGlyph.x + 1.0)), (uGlyph.y - 1.0 - px.y + 0.5) / uGlyph.y)).r; if (px.x >= 1.0 && px.x - 1.0 < uGlyph.x) ink = max(ink, i2); } // tučné = posun o 1 px
        }
        gl_FragColor = vec4(mix(vec3(0.97, 0.965, 0.95), col, ink), 1.0); return;
      }
      if (uMode == 7) { // SVET Z ČÍSEL – pravidlo: osvetlená zem = papier, predmety svojou farbou, tieň všade rovnako sivý, 2 tiene = tmavšie a hustejšie
        vec2 cs = (uGlyph + 1.0) * uScale;
        vec2 cell = floor(frag / cs), px = floor(mod(frag, cs) / uScale);
        vec2 uvc = (cell + 0.5) * cs / uRes;
        vec3 c = lin2srgb(texture2D(tScene, uvc).rgb);
        float la = luma(texture2D(tAmb, uvc).rgb);
        float n1 = luma(texture2D(tS1, uvc).rgb) / max(la, 0.004) < 1.25 ? 1.0 : 0.0;   // v tieni slnka 1
        float n2 = luma(texture2D(tS2, uvc).rgb) / max(la, 0.004) < 1.25 ? 1.0 : 0.0;   // v tieni slnka 2
        float n = n1 + n2;                                                                // počet tieňov 0, 1, 2
        bool isGround = texture2D(tMask, uvc).r < 0.5 && texture2D(tGround, uvc).r > 0.5 && abs(texture2D(tGDepth, uvc).r - texture2D(tDepth, uvc).r) < 0.0004;
        vec3 matC = lin2srgb(texture2D(tAmb, uvc).rgb) * 1.6;                              // farba materiálu bez slnka
        float mx = max(c.r, max(c.g, c.b));
        bool glow = mx > 0.75 && (mx - min(c.r, min(c.g, c.b))) / mx > 0.35;               // kúzla, kryštál
        float hsh = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        float k; vec3 fg;
        vec3 sh1 = vec3(0.7, 0.7, 0.72), sh2 = vec3(0.55, 0.55, 0.58);                   // tieň: jedna svetlá sivá všade, dvojitý o stupeň tmavší
        bool isChar7 = texture2D(tMask, uvc).r > 0.5;
        if (!isGround || isChar7) {                                                       // POSTAVY, STROMY, BUDOVY – jedno pravidlo
          vec3 pc = matC; float bd = 9.0;
          for (int i = 0; i < 9; i++) { vec3 d = (matC - uPal[i]) * vec3(1.0, 1.4, 0.8); float dd = dot(d, d) + abs(luma(matC) - luma(uPal[i])) * 2.0; if (dd < bd) { bd = dd; pc = uPal[i]; } }
          if (uPalOn < 0.5) pc = clamp(matC, 0.0, 1.0);
          float t = 1.0 - luma(pc);                                                        // tmavá časť = hustá, svetlá (tvár) = riedka
          k = 0.4 + t * 0.5 + hsh * 0.1 + (isChar7 ? 0.1 : 0.0);
          fg = mix(pc, vec3(0.06, 0.06, 0.08), 0.12 + t * 0.25 + n * 0.18 + (isChar7 ? 0.1 : 0.0));
          // vnútorná hrana: kde sa mení farba časti (klobúk/hlava/telo, kmeň/koruna) → tmavá deliaca čiara
          vec3 mR = lin2srgb(texture2D(tAmb, uvc + vec2(cs.x / uRes.x, 0.0)).rgb) * 1.6, mU = lin2srgb(texture2D(tAmb, uvc + vec2(0.0, cs.y / uRes.y)).rgb) * 1.6;
          float dR = abs(texture2D(tDepth, uvc + vec2(cs.x / uRes.x, 0.0)).r - texture2D(tDepth, uvc).r), dU = abs(texture2D(tDepth, uvc + vec2(0.0, cs.y / uRes.y)).r - texture2D(tDepth, uvc).r);
          if ((length(mR - matC) > 0.22 || length(mU - matC) > 0.22) && dR < 0.002 && dU < 0.002) { k = 1.0; fg = mix(fg, vec3(0.05), 0.6); }
        }
        else if (n > 1.5) { k = 0.42 + hsh * 0.15; fg = sh2; }
        else if (n > 0.5) { k = 0.28 + hsh * 0.12; fg = sh1; }
        else { k = hsh > 0.985 ? 0.15 : 0.0; fg = sh1; }                                 // osvetlená zem: papier
        // KÚZLO: čo osvetlí, to má farbu kúzla
        vec3 sp = lin2srgb(texture2D(tSpell, uvc).rgb); float spl = luma(sp);
        if (spl > 0.16) { fg = mix(fg, sp / max(max(sp.r, max(sp.g, sp.b)), 0.01) * 0.85, smoothstep(0.16, 0.4, spl)); k = max(k, spl * 1.4); }
        if (glow) { fg = c / mx; k = 0.9; }
        float v = clamp(k, 0.0, 1.0) * (uGlyphN - 1.0); float b = floor(v);
        float gi = clamp(b + (v - b > hsh ? 1.0 : 0.0), 0.0, uGlyphN - 1.0);
        float ink = k < 0.05 ? 0.0 : (px.x < uGlyph.x && px.y < uGlyph.y ? texture2D(tAtlas, vec2((gi * (uGlyph.x + 1.0) + px.x + 0.5) / (uGlyphN * (uGlyph.x + 1.0)), (uGlyph.y - 1.0 - px.y + 0.5) / uGlyph.y)).r : 0.0);
        vec3 bg = vec3(0.92, 0.905, 0.87);
        if (!isChar7) { if (n > 1.5) bg = mix(bg, sh2, 0.12); else if (n > 0.5) bg = mix(bg, sh1, 0.08); }   // papier v tieni len jemne
        gl_FragColor = vec4(mix(bg, fg, ink), 1.0); return;
      }
      if (uMode == 6) { // ZNAMIENKA A ČÍSLA na papieri: stupnica · − + 1 7 4 2 3 5 9 6 0 8 podľa tmy, čierna len na oddelenie častí
        vec2 cs = (uGlyph + 1.0) * uScale;
        vec2 cell = floor(frag / cs), px = floor(mod(frag, cs) / uScale);
        vec2 uv6 = (cell + 0.5) * cs / uRes;
        vec3 c = lin2srgb(texture2D(tScene, uv6).rgb);
        float l = smoothstep(0.12, 0.95, luma(c));
        float k = clamp(pow(1.0 - l, 1.1) * 1.4, 0.0, 1.0);
        k = smoothstep(0.1, 0.88, k);                                    // silnejší gradient svetlo → tieň
        bool isChar6 = texture2D(tMask, uv6).r > 0.5;
        bool isGround6 = !isChar6 && texture2D(tGround, uv6).r > 0.5 && abs(texture2D(tGDepth, uv6).r - texture2D(tDepth, uv6).r) < 0.0004;
        // JASOVÁ HIERARCHIA: postavy tmavšie ako tieň, tieň na zemi svetlý
        if (isChar6) {                                                     // postava: svetlo + farba časti (klobúk hustý, tvár riedka) → vidno, kde čo končí
          float ad = 1.0 - smoothstep(0.08, 0.55, luma(lin2srgb(texture2D(tAmb, uv6).rgb)));
          k = clamp(0.06 + k * 0.38 + ad * 0.62, 0.0, 1.0);             // väčší rozdiel: svetlá časť riedka, tmavá hustá
        }
        else if (isGround6) k = min(k, 0.42);
        float d0 = texture2D(tDepth, uv6).r;
        float far = smoothstep(uDepth.x, uDepth.y, d0);                    // 0 = vpredu, 1 = vzadu
        k *= mix(1.0, 0.45, far);                                          // OD ZADU DOPREDU: vzadu bledšie a redšie
        float d06 = texture2D(tDepth, uv6).r;
        float far6 = smoothstep(uDepth.x, uDepth.y, d06);
        // AMBIENT OCCLUSION: kúty a záhyby (päta stromu pri zemi, spoj strechy so stenou, okraj klobúka) stmavnú – bez obrysov
        if (uAO > 0.5) {
          float ao = 0.0;
          for (int i = 0; i < 12; i++) {
            float a = float(i) * 2.39996, rr = (1.5 + mod(float(i), 3.0) * 1.6);
            float dn = texture2D(tDepth, uv6 + vec2(cos(a), sin(a)) * rr * cs / uRes).r;
            float df = d06 - dn;                                            // sused je bližšie = zakrýva
            ao += df > 0.0004 && df < 0.01 ? 1.0 : 0.0;                    // len blízke záhyby (nie veľký skok = žiadny obrys)
          }
          k = clamp(k + ao / 12.0 * 0.45, 0.0, 1.0);
        }
        if (!isChar6) k *= mix(1.0, 0.25, far6 * far6);                     // HMLA: čo je ďalej, bledne do papiera
        float hsh = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        float v = k * (uGlyphN - 1.0); float b = floor(v);
        float gi = clamp(b + (v - b > bayer(cell) ? 1.0 : 0.0), 0.0, uGlyphN - 1.0);   // usporiadaný dithering = plynulý gradient
        float ink = px.x < uGlyph.x && px.y < uGlyph.y ? texture2D(tAtlas, vec2((gi * (uGlyph.x + 1.0) + px.x + 0.5) / (uGlyphN * (uGlyph.x + 1.0)), (uGlyph.y - 1.0 - px.y + 0.5) / uGlyph.y)).r : 0.0;
        if (k < 0.04) ink = 0.0;
        vec3 inkC = vec3(0.07, 0.07, 0.08), bg = vec3(0.87, 0.855, 0.82);
        vec3 fg = mix(vec3(0.42), inkC, smoothstep(0.2, 0.6, k));         // svetlé tóny sivým, tmavé čiernym (plný rozsah až po čiernu)
        if (isGround6) fg = mix(fg, vec3(0.55), 0.7);                      // tieň na zemi je sivší
        fg = mix(fg, bg, far * 0.45);
        if (uSymCol > 0.5) { float mx = max(c.r, max(c.g, c.b)); fg = mix(c / max(mx, 0.05) * mix(0.75, 0.3, k), fg, 0.45); }   // jemná farba toho, čo znak kreslí
        { // KÚZLO ZO ZNAMIENOK: čo žiari (kúzlo, plamene, iskry, blesk), sa kreslí znamienkom kúzla (+ − × ÷) vo farbe kúzla, väčším písmom
          vec2 cs2 = cs * 2.0, cell2 = floor(frag / cs2), p2 = (frag - (cell2 + 0.5) * cs2) / cs2;
          vec3 c2 = lin2srgb(texture2D(tSpellM, (cell2 + 0.5) * cs2 / uRes).rgb); float m2 = max(c2.r, max(c2.g, c2.b));
          if (m2 > 0.12) {                                                  // len to, čo patrí kúzlu (vrstva 4)
            float inten = clamp((m2 - 0.12) * 1.6, 0.0, 1.0);
            float dg = glyph(uSpellG, p2, 0.07 + inten * 0.09, 0.36 + inten * 0.08);
            vec3 sc = c2 / max(m2, 0.01);
            bg = mix(bg, sc, 0.04 + inten * 0.12);
            fg = mix(sc * 0.95, vec3(1.0), inten * 0.25); ink = clamp(0.5 - dg * cs2.y, 0.0, 1.0);
          }
        }
        bg = mix(bg, uFlash.rgb, uFlash.a); fg = mix(fg, uFlash.rgb, uFlash.a * 0.5);   // záblesk (blesk, výbuch)
        gl_FragColor = vec4(mix(bg, fg, ink), 1.0); return;
      }
      // postavy: jemné bodky (Bayer) ako doteraz, aby bolo vidno tvár a zbraň
      if (uCharDots > 0.5 && texture2D(tMask, vUv).r > 0.5) {
        vec2 px = floor(frag / uDot);
        vec3 c = lin2srgb(texture2D(tScene, (px + 0.5) * uDot / uRes).rgb);
        float l = smoothstep(0.08, 0.92, dot(c, vec3(0.299, 0.587, 0.114))), th = bayer(px);
        float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
        vec3 col;
        if (sat > 0.32 && mx > 0.22) col = mx * 1.15 > th * 0.9 ? c / mx * 0.92 : mix(ink, c / mx * 0.4, 0.5);
        else { float v = l * 2.0; float b = floor(v); float lv = b + (v - b > th ? 1.0 : 0.0); col = lv < 0.5 ? ink : lv < 1.5 ? mix(ink, paper, 0.5) : paper; }
        gl_FragColor = vec4(col, 1.0); return;
      }
      vec2 cell = floor(frag / uCell), p = (frag - (cell + 0.5) * uCell) / uCell;
      vec3 c = lin2srgb(texture2D(tScene, (cell + 0.5) * uCell / uRes).rgb);
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      float dark = 1.0 - smoothstep(0.12, 0.97, lum);
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
      float th = bayer(cell);
      int g; float w, L = 0.36;
      if (uMode == 2) { // plusy: len +, s tmou hrubne a rastie
        g = dark > 0.06 + th * 0.1 ? 3 : 0; w = 0.025 + dark * 0.12; L = 0.4;
      } else {
        // poradie podľa množstva atramentu: nič, −, ÷, +, ×, ✳
        float v = dark * 5.2; float b = floor(v); float lv = clamp(b + (v - b > th ? 1.0 : 0.0), 0.0, 5.0);
        g = lv < 0.5 ? 0 : lv < 1.5 ? 2 : lv < 2.5 ? 5 : lv < 3.5 ? 3 : lv < 4.5 ? 4 : 6; w = 0.05 + dark * 0.11;
      }
      float d = glyph(g, p, w, L);
      float cov = clamp(0.5 - d * uCell, 0.0, 1.0);
      vec3 fg = ink;
      if (uMode == 3) fg = c * (0.55 + 0.25 * (1.0 - dark));                          // farebné: znamienko má farbu sveta
      if (uMode == 4 && sat > 0.32 && mx > 0.22) fg = c / mx * 0.9;   // akcenty (kúzla, kvety, plášte) vždy farebne
      if (uMode == 3 && sat > 0.32 && mx > 0.22) fg = c / mx * 0.92;
      vec3 bg = paper;
      if (uMode == 4) bg = mix(paper, paper * 0.86, smoothstep(0.55, 0.95, dark));  // mix: v hlbokom tieni papier stmavne
      gl_FragColor = vec4(mix(bg, fg, cov), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const blurMat = new THREE.ShaderMaterial({
  uniforms: { tImg: { value: glyphRT.texture }, uRes: { value: new THREE.Vector2() }, uFocus: { value: 0.5 }, uOn: { value: 0 }, uCell: { value: 7 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tImg; uniform vec2 uRes; uniform float uFocus; uniform float uOn; uniform float uCell; varying vec2 vUv;
    void main(){
      float dy = abs(vUv.y - uFocus); vec2 q = vUv - 0.5;
      float r = (smoothstep(0.22, 0.55, dy) * 1.6 + dot(q, q) * 1.5) * uCell * uOn;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 20; i++) { float fi = float(i), a = fi * 2.39996; acc += texture2D(tImg, vUv + vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 20.0) * r / uRes).rgb; }
      gl_FragColor = vec4(acc / 20.0 * (1.0 - dot(q, q) * 0.3), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), glyphMat);
quadScene.add(quad);
const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

let view = 4.6;
function resize() {
  resizeBase(view);
  // menšie znaky: kreslíme v skutočných pixeloch obrazovky (Retina/mobil = 2×), znak je polovičný a ostrý
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);
  const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr), d = glyphMat.uniforms.uDot.value * dpr;
  renderer.setSize(innerWidth, innerHeight, false);
  fine.setSize(Math.ceil(W / d), Math.ceil(H / d)); amb.setSize(Math.ceil(W / d), Math.ceil(H / d)); s1.setSize(Math.ceil(W / d), Math.ceil(H / d)); s2.setSize(Math.ceil(W / d), Math.ceil(H / d)); spl.setSize(Math.ceil(W / d), Math.ceil(H / d)); mask.setSize(Math.ceil(W / d), Math.ceil(H / d)); maskS.setSize(Math.ceil(W / d), Math.ceil(H / d)); maskG.setSize(Math.ceil(W / d), Math.ceil(H / d)); glyphRT.setSize(W, H);
  glyphMat.uniforms.uRes.value.set(W, H); blurMat.uniforms.uRes.value.set(W, H);
}
addEventListener('resize', resize);
resize();

function renderGlyphs() {
  // 1. scéna, 2. maska postáv (len vrstva 1, všetko biele), 3. znamienka, 4. rozmazanie do hĺbky
  renderer.setRenderTarget(fine); renderer.render(scene, camera);
  if (mode === 7) { // osvetlenie zvlášť: bez slniek, len slnko 1, len slnko 2
    const a = sun.intensity, b = sun2.intensity, gc = hemi.groundColor.getHex();
    hemi.groundColor.set(0xffffff);
    sun.intensity = 0; sun2.intensity = 0; renderer.setRenderTarget(amb); renderer.render(scene, camera);
    sun.intensity = 2.4; renderer.setRenderTarget(s1); renderer.render(scene, camera);
    sun.intensity = 0; sun2.intensity = 2.4; renderer.setRenderTarget(s2); renderer.render(scene, camera);
    const hi = hemi.intensity; sun2.intensity = 0; hemi.intensity = 0; renderer.setRenderTarget(spl); renderer.render(scene, camera); hemi.intensity = hi;   // len svetlo kúziel
    sun.intensity = a; sun2.intensity = b; hemi.groundColor.set(gc);
  }
  if (mode === 6) { const si = sun.intensity, gc = hemi.groundColor.getHex(); sun.intensity = 0; hemi.groundColor.set(0xffffff); renderer.setRenderTarget(amb); renderer.render(scene, camera); sun.intensity = si; hemi.groundColor.set(gc); }
  if (mode === 5) { const si = sun.intensity, gc = hemi.groundColor.getHex(); sun.intensity = 0; hemi.groundColor.set(0xffffff); renderer.setRenderTarget(amb); renderer.render(scene, camera); sun.intensity = si; hemi.groundColor.set(gc); }
  const bg = scene.background.clone(), fog = scene.fog;
  scene.background.set(0x000000); scene.fog = null; scene.overrideMaterial = white; camera.layers.set(1);
  renderer.setRenderTarget(mask); renderer.render(scene, camera);
  camera.layers.set(2); renderer.setRenderTarget(maskG); renderer.render(scene, camera);
  scene.overrideMaterial = null; camera.layers.set(4); renderer.setRenderTarget(maskS); renderer.render(scene, camera);   // len kúzlo vo farbe
  scene.background.copy(bg); scene.fog = fog; scene.overrideMaterial = null; camera.layers.set(0);
  quad.material = glyphMat; renderer.setRenderTarget(glyphRT); renderer.render(quadScene, quadCam);
  quad.material = blurMat; renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
}

// ---------- ovládanie ----------
let mode = 1, polar = false;
const MODES = [['Bodky (teraz)', 0], ['Znamienka', 6], ['Svet z čísel', 7], ['ASCII', 8]];
const bar = document.getElementById('modes');
MODES.forEach(([name, m]) => { const b = document.createElement('button'); b.textContent = name; b.dataset.m = m; b.onclick = () => setMode(m); bar.appendChild(b); });
function setMode(m) { mode = m; hemi.intensity = m === 6 ? (polar ? 0.25 : 1.0) : 1.15; sun.intensity = m === 6 ? (polar ? 4.6 : 3.6) : 2.4; MAT.ground.color.set(0xffffff); U.desat.value = m >= 6 ? 0 : 0.35;  U.gray.value = m === 5 || m === 7 || m === 8 || (m === 6 && glyphMat.uniforms.uSymCol.value > 0.5) ? 0 : 1; if (m === 6) U.desat.value = 0.35; glyphMat.uniforms.uMode.value = m; [...bar.children].forEach(b => b.classList.toggle('on', +b.dataset.m === m)); document.getElementById('opts').style.opacity = m ? 1 : 0.35; const sr = document.getElementById('shadeRow'); if (sr) sr.style.display = m === 5 ? '' : 'none'; const ir = document.getElementById('bInv'); if (ir) ir.style.display = m >= 6 ? '' : 'none'; const sc = document.getElementById('bScale'); if (sc) sc.style.display = m >= 6 ? '' : 'none'; }
glyphMat.uniforms.uSymCol.value = 1; glyphMat.uniforms.uCell.value = 9; setMode(7);
let fontState = 0;
const FONT_STATES = [['Čísla 5×7', 'big', 1], ['Čísla 5×7 ×2', 'big', 2], ['Najmenšie 3×5', 'small', 1]];
function setFont(i) { fontState = i; const [label, f, sc] = FONT_STATES[i], F = FONTS[f]; const u = glyphMat.uniforms; u.tAtlas.value = F.tex; u.tEdge.value = EDGES[f]; u.uGlyphN.value = F.n; u.uGlyph.value.set(F.w, F.h); u.uScale.value = sc; document.getElementById('bScale').textContent = label; }
document.getElementById('bScale').onclick = () => setFont((fontState + 1) % FONT_STATES.length);
setFont(2); glyphMat.uniforms.uSymCol.value = 1; document.getElementById('bSym2').classList.add('on'); glyphMat.uniforms.uCell.value = 5; blurMat.uniforms.uOn.value = 1; document.getElementById('bBlur').classList.add('on'); [...document.querySelectorAll('#sizes button')].forEach(b => b.classList.toggle('on', b.textContent === '5 px')); setMode(6);
document.getElementById('bPal').onclick = e => { const v = 1 - glyphMat.uniforms.uPalOn.value; glyphMat.uniforms.uPalOn.value = v; e.target.classList.toggle('on', v > 0.5); };
// farba tieňa (variant Tieň)
const shades = document.getElementById('shades');
[['Indigo', 0x2a2f4e], ['Atrament', 0x1c1d21], ['Sépia', 0x4a3426], ['Mach', 0x26402f], ['Fialová', 0x3d2a4e]].forEach(([n, c], i) => {
  const b = document.createElement('button'); b.textContent = n; b.style.borderLeft = `10px solid #${c.toString(16).padStart(6, '0')}`;
  b.onclick = () => { glyphMat.uniforms.uShadow.value.set(c); [...shades.children].forEach(x => x.classList.toggle('on', x === b)); };
  b.classList.toggle('on', i === 0); shades.appendChild(b);
});
document.getElementById('bPolar').onclick = e => { polar = !polar; glyphMat.uniforms.uPolar.value = polar ? 1 : 0; e.target.classList.toggle('on', polar); setMode(mode); };
U.tex.value = 0;   // textúra predvolene vypnutá (Lukáš: príliš chaotické)
document.getElementById('bTex').onclick = e => { U.tex.value = 1 - U.tex.value; e.target.classList.toggle('on', U.tex.value > 0.5); };
document.getElementById('bAO').onclick = e => { const v = 1 - glyphMat.uniforms.uAO.value; glyphMat.uniforms.uAO.value = v; e.target.classList.toggle('on', v > 0.5); };
document.getElementById('bSym').onclick = e => { const v = 1 - glyphMat.uniforms.uSymCol.value; glyphMat.uniforms.uSymCol.value = v; e.target.classList.toggle('on', v > 0.5); setMode(mode); };
const sizes = document.getElementById('sizes');
[5, 7, 9, 12].forEach(s => { const b = document.createElement('button'); b.textContent = s + ' px'; b.onclick = () => { glyphMat.uniforms.uCell.value = s; blurMat.uniforms.uCell.value = s; [...sizes.children].forEach(x => x.classList.toggle('on', x === b)); }; b.classList.toggle('on', s === 5); sizes.appendChild(b); });
const bChar = document.getElementById('bChar'), bBlur = document.getElementById('bBlur'), bZoom = document.getElementById('bZoom');
bChar.onclick = () => { const v = 1 - glyphMat.uniforms.uCharDots.value; glyphMat.uniforms.uCharDots.value = v; bChar.classList.toggle('on', v > 0.5); };
bBlur.onclick = () => { const v = 1 - blurMat.uniforms.uOn.value; blurMat.uniforms.uOn.value = v; bBlur.classList.toggle('on', v > 0.5); };
bZoom.onclick = () => { view = view < 4 ? 4.6 : 2.8; bZoom.classList.toggle('on', view < 4); resize(); };
document.getElementById('bNew').onclick = () => { build(1 + Math.floor(Math.random() * 9999)); styleChars(); };
addEventListener('keydown', e => { const m = +e.key - 1; if (m >= 0 && m < MODES.length) setMode(m); });

// ---------- slučka ----------
const clock = new THREE.Clock();
let t = 0, nextCast = 1.5;
function update(dt) {
  t += dt; U.time.value = t; U.hero.value.copy(hero.position);
  updateHero(dt, 0, false);
  for (const f of fighters) f.mixer.update(dt);
  nextCast -= dt; if (nextCast <= 0) { nextCast = 2.6; castNext(); }
  if (spellTo) {
    spellT += dt;
    const from = crystal.getWorldPosition(new THREE.Vector3()), to = spellTo.g.position.clone().add(new THREE.Vector3(0, 1, 0));
    const charge = 0.25, fly = spell.dur;
    if (spellT < charge) {                                                  // nabitie na kryštáli
      crystalLight.color.set(spellCol); crystalLight.intensity = 2 + spellT * 16;
      for (let n = 0; n < 3; n++) spark(from.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)), 0, 0.5, 0, 0.3, spellCol);
      orb.userData.from = from;
    } else if (spellT < charge + fly) {                                     // let – každé kúzlo inak
      const k = (spellT - charge) / fly, e = spell.op === '-' ? k : k * k * (3 - 2 * k);
      const pos = new THREE.Vector3().lerpVectors(orb.userData.from, to, e); pos.y += Math.sin(e * Math.PI) * spell.arc;
      orbLight.position.copy(pos); orbLight.intensity = 6 * spell.size;
      const rnd = () => (Math.random() - 0.5);
      if (spell.op === '-') { shard.visible = true; shard.position.copy(pos); shard.lookAt(to); for (let n = 0; n < 6; n++) spark(pos.clone().add(new THREE.Vector3(rnd() * 0.3, rnd() * 0.3, rnd() * 0.3)), rnd() * 0.4, -0.8, rnd() * 0.4, 0.8, Math.random() < 0.5 ? 0x7fc8ff : 0xd8f0ff); }
      else if (spell.op === '÷') { lightning(orb.userData.from, to); flash.set(1, 0.95, 0.6, 0.12 + Math.random() * 0.1); for (let n = 0; n < 6; n++) spark(to, rnd() * 6, Math.random() * 4, rnd() * 6, 0.4, 0xffe14a); shake = Math.max(shake, 0.2); }
      else if (spell.op === '×') { // OHEŇ: plápolajúca guľa, plamene stúpajú
        orb.visible = true; orb.position.copy(pos); orb.scale.setScalar(1.8 * spell.size * (1 + Math.sin(spellT * 50) * 0.18 + Math.random() * 0.1));
        orb.material.color.setHex([0xff4a1a, 0xff7a3a, 0xffb03a][Math.floor(Math.random() * 3)]);
        for (let n = 0; n < 16; n++) spark(pos.clone().add(new THREE.Vector3(rnd() * 0.6, rnd() * 0.6, rnd() * 0.6)), rnd() * 1.2, 1.5 + Math.random() * 2, rnd() * 1.2, 0.5 + Math.random() * 0.4, [0xff3a1a, 0xff7a3a, 0xffd25a][Math.floor(Math.random() * 3)]);
      } else { // PRÍRODA: guľa a vír lístia okolo
        orb.visible = true; orb.position.copy(pos); orb.scale.setScalar(1.5 * (1 + Math.sin(spellT * 30) * 0.12));
        for (let n = 0; n < 6; n++) { const a = spellT * 14 + n * 1.05; spark(pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.6, Math.sin(a * 0.7) * 0.4, Math.sin(a) * 0.6)), rnd() * 0.3, 0.4, rnd() * 0.3, 0.7, Math.random() < 0.6 ? 0x6fe08a : 0xb6ff8a); }
      }
    } else {                                                                // zásah
      orb.visible = false; shard.visible = false; boltGroup.clear(); orbLight.intensity = 0; crystalLight.intensity = 1.6;
      orb.material.color.set(spellCol);
      const ground = to.clone(); ground.y = spellTo.g.position.y + 0.1;
      if (spell.op === '×') { burst(to, 320, 7, 0xff7a3a); burst(to, 120, 4, 0xffd25a, 1.2); shake = 0.9; flash.set(1, 0.6, 0.3, 0.35);
        effects.push({ t: 0, dur: 1.2, fn: (k) => { for (let n = 0; n < 10; n++) spark(ground.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6)), (Math.random() - 0.5) * 0.6, 2 + Math.random() * 3 * (1 - k), (Math.random() - 0.5) * 0.6, 0.6, [0xff3a1a, 0xff7a3a, 0xffd25a][Math.floor(Math.random() * 3)]); } }); }
      else if (spell.op === '÷') { burst(to, 200, 9, 0xffe14a, 0.5); burst(to, 60, 4, 0xffffff, 0.3); shake = 0.75; flash.set(1, 0.97, 0.7, 0.55); }
      else if (spell.op === '-') { burst(to, 160, 4, 0x7fc8ff, 1.2); burst(to, 80, 2, 0xffffff, 1.4); shake = 0.35; flash.set(0.7, 0.85, 1, 0.2);
        effects.push({ t: 0, dur: 1.0, fn: () => { for (let n = 0; n < 4; n++) spark(ground.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.2, (Math.random() - 0.5) * 2)), 0, 0.3, 0, 0.9, 0xbfe6ff); } }); }
      else { burst(to, 180, 4.5, 0x6fe08a); shake = 0.3; flash.set(0.6, 1, 0.65, 0.15);
        effects.push({ t: 0, dur: 0.9, fn: (k) => { for (let n = 0; n < 6; n++) { const a = Math.random() * 6.28, r = 0.3 + k * 1.6; spark(ground.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.1, Math.sin(a) * r)), 0, 1.5 + Math.random(), 0, 0.7, Math.random() < 0.6 ? 0x6fe08a : 0xb6ff8a); } } }); }
      damageNumber(spellTo, prob.v, spellCol);
      spellTo.play('Hit_A', 0.05, true); const f = spellTo; setTimeout(() => f.play(f.kind === 'hooded' ? '2H_Ranged_Aiming' : f.kind === 'barbarian' ? '2H_Melee_Idle' : 'Idle'), 700); spellTo = null;
    }
  }
  for (let i = effects.length - 1; i >= 0; i--) { const ef = effects[i]; ef.t += dt; ef.fn(ef.t / ef.dur); if (ef.t >= ef.dur) effects.splice(i, 1); }
  shake = Math.max(0, shake - dt * 1.8); flash.w = Math.max(0, flash.w - dt * 2.2); glyphMat.uniforms.uFlash.value.copy(flash);
  updateParticles(dt);
}
function draw() {
  const c = R.camp, look = new THREE.Vector3(c.x - 1.4, hero.position.y + 0.9, c.z);
  const sh = new THREE.Vector3((Math.random() - 0.5) * shake * 0.6, (Math.random() - 0.5) * shake * 0.6, 0);   // otrasy zeme
  camera.position.copy(look).add(new THREE.Vector3(0, 12.1, 17)).add(sh); camera.lookAt(look.clone().add(sh));
  const dc = 20.9; glyphMat.uniforms.uDepth.value.set((dc - 9) / 199.9, (dc + 14) / 199.9);
  setView(view);
  sun.position.set(hero.position.x - 15, hero.position.y + 10, hero.position.z + 8); sun.target.position.copy(hero.position);
  sun2.position.set(hero.position.x + 14, hero.position.y + 12, hero.position.z - 6); sun2.target.position.copy(hero.position);
  rim.position.set(hero.position.x + 8, hero.position.y + 6, hero.position.z - 14); rim.target.position.copy(hero.position); rim.intensity = mode === 6 ? 1.6 : 0;
  const hv = hero.position.clone().add(new THREE.Vector3(0, 1, 0)).project(camera);
  blurMat.uniforms.uFocus.value = (hv.y + 1) / 2;
  if (mode === 0) renderBayer(); else renderGlyphs();
}
function tick() { const dt = Math.min(0.05, clock.getDelta()); if (!window.__pause) update(dt); draw(); requestAnimationFrame(tick); }
document.getElementById('loading').remove();
requestAnimationFrame(tick);
window.__z = { get sp() { return { spellT, on: !!spellTo, op: spell.op, next: nextCast }; }, amb, fine, renderer, set view(v) { view = v; resize(); }, step(s) { for (let k = 0; k < s * 30; k++) update(1 / 30); draw(); }, setMode, glyphMat };
