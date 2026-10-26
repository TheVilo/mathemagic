// PIXELOVÉ POSTAVIČKY NEPRIATEĽOV (Lukáš 26. 10.: rovnaký art ako čarodejník – pár pixelov, tmavá silueta, svietiace oči)
// 3D model ostáva neviditeľný (pohyb, tiene, zrážky), navrch sa kreslí 16 × 16 silueta vo vrstve s hĺbkou (kresba.js addSprite)
// k = tmavá, g = tmavosivá (detail), w = zbraň, c = svetlo (oči, ostrie)
import { THREE, camera } from './svet.js';
import { addSprite, removeSprite } from './kresba.js';
import { FIGHTERS } from './postavy.js';

const BODIES = {
  rogue: ['................', '................', '......kkk.......', '.....kkkkk......', '....kkkkkkk.....', '.....kkkkc......', '.....kkkkk......', '....kkkkkk......', '...kkkkkkk......', '...kkkkkkk......', '....kkkkkk......', '....kkkkkk......', '....kkkkkk......'],
  vrhac: ['................', '................', '......kkk.......', '...gkkkkkk......', '..g.kkkkkkk.....', '.....kkkkc......', '.....kkkkk......', '....kkkkkk......', '...kkkkkkk......', '...kgkkkkk......', '....kkkkkk......', '....kkkkkk......', '....kkkkkk......'],
  knight: ['................', '.....g..........', '....gkkk........', '....kkkkk.......', '....kkkkk.......', '....kkkcc.......', '....kkkkk.......', '...kkkkkkkk.....', '...kkkkkgggg....', '...kkkkkgwwg....', '...kkkkkgwwg....', '...kkkkkgggg....', '....kkkkk.gg....'],
  barbarian: ['...g.....g......', '...gg...gg......', '....gkkkg.......', '....kkkkk.......', '....kkkcc.......', '....kkkkk.......', '..kkkkkkkkk.....', '.kkkkkkkkkkk....', '.kkkkkkkkkkk....', '.kkkkkkkkkk.....', '..kkkkkkkk......', '..kkkkkkkk......', '...kkkkkk.......'],
  hooded: ['................', '.......k........', '......kk........', '.....kkkk.......', '....kkkkkk......', '.....kkkc.......', '.....kkkk.......', '....kkkkkk......', '...kkkkkkk......', '...kkkkkkkk.....', '..kkkkkkkkk.....', '..kkkkkkkkk.....', '...kkkkkkkk.....'],
  innkeeper: ['................', '.....kkkk.......', '.....kkkk.......', '...kkkkkkkk.....', '.....kkkkk......', '.....kkkcg......', '.....kkkkk......', '...kkkkkkkk.....', '..kkkkkkkkkk....', '..kkkggggkkk....', '..kkkggggkkk....', '..kkkggggkkk....', '...kkggggkk.....'],
};
// zbraň: dĺžka, hlavica; ranged = kuša vodorovne
const WEAPON = { rogue: { L: 3 }, vrhac: { L: 2 }, knight: { L: 6 }, barbarian: { L: 7, axe: 1 }, hooded: { cross: 1 }, innkeeper: { mug: 1 } };
const LEGS = [['....kk..kk......', '....k....k......'], ['.....kk.kk......', '.....k...k......'], ['....kk..kk......', '...k.....k......'], ['....kkkk........', '....k..k........']];
// riadky: 0 chôdza, 1 státie, 2 útok (rozmach → úder), 3 zásah / pád
const POSES = [
  ...[0, 1, 2, 3].map(i => ({ row: 0, i, a: 55, dy: i % 2 ? -1 : 0, legs: i })),
  ...[0, 1, 2, 3].map(i => ({ row: 1, i, a: 45, dy: i === 1 || i === 2 ? -1 : 0, legs: 0 })),
  ...[[-50, -1], [10, -1], [80, 0], [110, 0]].map(([a, dy], i) => ({ row: 2, i, a, dy, legs: 0, fl: i >= 2 })),
  { row: 3, i: 0, a: -20, dy: 0, legs: 2, hit: 1 }, { row: 3, i: 1, die: 1 }, { row: 3, i: 2, die: 1 }, { row: 3, i: 3, die: 1 },
];
function frame(kind, P) {
  const B = BODIES[kind] || BODIES.rogue, W = WEAPON[kind] || {};
  const g = Array.from({ length: 16 }, (_, y) => ((B[y] || '') + '................').slice(0, 16).split(''));
  const L = LEGS[P.legs || 0]; g[13] = L[0].split(''); g[14] = L[1].split('');
  if (P.dy) g.push(g.shift());   // poskok o pixel
  if (P.hit) g.forEach(r => { r.unshift('.'); r.length = 16; });   // zásah: odhodí ho dozadu
  const put = (x, y, ch) => { x = Math.round(x); y = Math.round(y); if (y >= 0 && y < 16 && x >= 0 && x < 16 && (ch !== 'k' || g[y][x] === '.')) g[y][x] = ch; };
  const hx = 9.5, hy = 9 + (P.dy || 0);
  if (W.cross) { const rec = P.row === 2 && P.i >= 2 ? -1 : 0; for (let x = 0; x < 5; x++) put(hx + x + rec, hy - 1, 'w'); put(hx + 4 + rec, hy - 2, 'w'); put(hx + 4 + rec, hy, 'w'); if (P.fl) put(hx + 6, hy - 1, 'c'); }
  else if (W.mug) { put(hx + 1, hy - 1, 'w'); put(hx + 2, hy - 1, 'w'); put(hx + 1, hy, 'w'); put(hx + 2, hy, 'w'); }
  else {
    const r = (P.a ?? 45) * Math.PI / 180, Lw = W.L || 3;
    for (let t = 0.5; t <= Lw; t += 0.5) put(hx + Math.sin(r) * t, hy - Math.cos(r) * t, t > Lw - 1 && !W.axe ? 'c' : 'w');
    if (W.axe) { const tx = hx + Math.sin(r) * Lw, ty = hy - Math.cos(r) * Lw, nx = Math.cos(r), ny = Math.sin(r); for (let s = -1; s <= 1; s++) { put(tx + nx * s, ty + ny * s, 'w'); put(tx + nx * s - Math.sin(r), ty + ny * s + Math.cos(r), 'w'); } }
  }
  return g.map(r => r.join(''));
}
const PC = { k: '#211c21', g: '#4b434a', w: '#8c8089', c: '#fff6dc' };
const ATLAS = {};
function atlas(kind) {
  if (ATLAS[kind]) return ATLAS[kind];
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  const stand = frame(kind, POSES[4]);
  POSES.forEach((P, n) => {
    const ox = P.i * 16, oy = P.row * 16;
    if (P.die) {   // pád: postava ležiaca (otočená o 90° okolo nôh), posledné dve snímky rovnaké – zmizne priehľadnosťou
      stand.forEach((l, y) => [...l].forEach((ch, xx) => { if (PC[ch] && ch !== 'c') { x.fillStyle = PC[ch]; const lx = P.i === 1 ? xx + Math.round((15 - y) * 0.5) : 15 - y, ly = P.i === 1 ? 6 + Math.round(y * 0.6) : 15 - Math.round((15 - xx) * 0.3); if (lx >= 0 && lx < 16 && ly >= 0 && ly < 16) x.fillRect(ox + lx, oy + ly, 1, 1); } }));
      return;
    }
    frame(kind, P).forEach((l, y) => [...l].forEach((ch, xx) => { if (PC[ch]) { x.fillStyle = PC[ch]; x.fillRect(ox + xx, oy + y, 1, 1); } }));
  });
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  return (ATLAS[kind] = { tex, url: cv.toDataURL() });
}
export const spriteAtlasUrl = k => atlas(k).url;

// 3D model neviditeľný: nekreslí farbu ani hĺbku, ostáva tieň (svetlo palice za ním robí tieň)
function hideModel(f) { f.g.traverse(o => { if (o.isMesh) { o.material.colorWrite = false; o.material.depthWrite = false; o.layers.disable(1); } }); }
const shown = o => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p.isScene) return true; } return false; };
const A = new THREE.Vector3(), B = new THREE.Vector3();
const ROW = { walk: 0, charge: 0, rush: 0, back: 0, stand: 1, idle: 1, aim: 2, windup: 2, chargeup: 2, attack: 2, hit: 3, dead: 3 };
export function drawFighterSprites(dt) {
  const hide = document.body.classList.contains('ovon');
  for (const f of FIGHTERS) {
    if (!f.spr) { if (!BODIES[f.kind]) continue; f.spr = addSprite(atlas(f.kind).tex, 64, 64); hideModel(f); f.sprT = Math.random() * 3; f.sprLast = f.g.position.clone(); f.sprFlip = false; }
    const M = f.spr, U = M.material.uniforms;
    if (!shown(f.g)) { M.visible = false; if (!f.g.parent || !f.g.parent.parent) { removeSprite(M); FIGHTERS.delete(f); } continue; }
    f.sprT += dt;
    const p = f.g.position, moved = p.distanceTo(f.sprLast) / Math.max(dt, 1e-3); f.sprLast.copy(p);
    A.copy(p).project(camera); const fx = (A.x + 1) / 2 * innerWidth, fy = (1 - A.y) / 2 * innerHeight;
    if (A.z > 1 || fx < -80 || fx > innerWidth + 80 || fy < -80 || fy > innerHeight + 120) { M.visible = false; continue; }
    // smer: kam sa model pozerá (rotation.y), premietnuté na obrazovku
    B.set(p.x + Math.sin(f.g.rotation.y), p.y, p.z + Math.cos(f.g.rotation.y)).project(camera); const dx = B.x - A.x; if (Math.abs(dx) > 0.002) f.sprFlip = dx < 0;
    const st = f.state || (f.sitting ? 'stand' : moved > 0.3 ? 'walk' : 'idle');
    let row = ROW[st] ?? (moved > 0.3 ? 0 : 1), col;
    if (row === 0) col = Math.floor(f.sprT * 8) % 4;
    else if (row === 1) col = Math.floor(f.sprT * 3) % 4;
    else if (st === 'windup' || st === 'chargeup') col = 0;
    else if (st === 'aim') col = f.d.ranged ? 1 : 0;
    else if (st === 'attack') col = Math.min(3, 1 + Math.floor((f.t || 0) * 8));
    else if (st === 'hit') col = 0;
    else if (st === 'dead') col = (f.t || 0) < 0.12 ? 0 : (f.t || 0) < 0.25 ? 1 : 2;
    else col = 0;
    if (f.d.ranged && st === 'walk' && f.shoot != null && f.shoot > 2.4 && fight_recent(f)) { row = 2; col = 3; }
    B.copy(p).add(THREE.Object3D.DEFAULT_UP.clone().multiplyScalar(1.6)).project(camera); const hpx = Math.abs((1 - B.y) / 2 * innerHeight - fy);
    const k = Math.max(1, Math.round(hpx * (f.size || 1) / 16)), w = 16 * k, h = 16 * k, ax = 6.5, flip = f.sprFlip;
    const x0 = fx - (flip ? 16 - ax : ax) * k, y0 = fy - h * 0.94;
    M.visible = !hide; M.position.set(x0 + w / 2, y0 + h / 2, 0); M.scale.set(w, -h, 1);
    U.uFrame.value.set(col / 4, 1 - (row + 1) / 4, 1 / 4, 1 / 4); U.uFlip.value = flip ? 1 : 0;
    B.copy(p); B.y += 0.6; B.project(camera); U.uDepth.value = B.z * 0.5 + 0.5; M.renderOrder = Math.round((1 - U.uDepth.value) * 1e6);
    U.uWhite.value = Math.min(1, f.flash || 0);
    U.uAlpha.value = st === 'dead' ? Math.max(0, 1 - Math.max(0, (f.t || 0) - 0.9) / 0.6) : 1;
  }
}
const fight_recent = f => f.d.ranged && f.cur && f.cur === f.acts?.[f.d.attack] && f.cur.isRunning();
