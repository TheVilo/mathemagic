import * as R from './render.js';
import { createGL } from './gl.js';
import { HERO_BIG, HERO_SMALL } from './hero.js';
import { SCREENS, SLIME, NPC, CHEST, CHEST_OPEN, BOOK, BOSS, STRINGS } from './data.js';
import { mulberry32, generateProblem, recordAnswer, createMathState } from './math.js';

const T = 16, OY = 2, W = R.W, H = R.H, A = R.A, Z = R.Z;
const SH2Z = [Z.DOT, Z.PLUS, Z.MINUS, Z.TIMES, Z.DIV];
const $ = id => document.getElementById(id);
const stage = $('stage'), cv = $('px');
const rng = mulberry32((Date.now() % 1e9) | 0);
const SAVE = 'mathemagic-zona1';
const SOLID = new Set(['T', 'b', '2', 'o', 'W', 'S', 'F', 'P', 'L', 'C']);
const EL = { '+': { acc: A.GREEN, shape: 1 }, '-': { acc: A.ICE, shape: 2 }, '*': { acc: A.ORANGE, shape: 3 }, '/': { acc: A.YELLOW, shape: 4 } };

// Vykresľovanie: WebGL (raster + hĺbka ostrosti + žiara), inak 2D záloha.
const packed = new Uint8Array(R.N * 4);
const glr = createGL(cv);
let ctx2d = null, img2d = null;
if (!glr) { cv.width = R.OW; cv.height = R.OH; ctx2d = cv.getContext('2d'); img2d = ctx2d.createImageData(R.OW, R.OH); }

let S = null, mode = 'title', scale = 3, gTime = 0;
let world = null, combat = null, cut = null, trans = null, tapFx = null, bridgeGrow = 1;
const hero = { x: 160, y: 150, face: 1, dir: 0, walk: 0, path: [], out: null, idle: 0 };
const keys = {};
const timers = [];
const later = (t, fn) => timers.push({ t, fn });

// ---------- stav a ukladanie ----------
function newState() {
  return {
    v: 1, screen: 'A', x: 6 * T + 8, y: OY + 5 * T + 12, numbers: [1], ops: [], coins: 0, hearts: 3, maxHearts: 3, hat: 0,
    found: {}, opened: {}, bushes: {}, bridge: false, boss: false, defeated: {}, time: 0, math: createMathState(),
    cp: { screen: 'A', x: 12 * T + 8, y: OY + 4 * T + 12 }, intro: false, fights: 0,
  };
}
function save() {
  if (!S || !world) return;
  S.screen = world.key; S.x = hero.x; S.y = hero.y;
  try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) { /* bez ukladania */ }
}
function load() {
  try { const d = JSON.parse(localStorage.getItem(SAVE)); return d && d.v === 1 ? d : null; } catch (e) { return null; }
}

// ---------- zvuk (WebAudio, žiadne súbory) ----------
let AC = null;
function tone(f, d, type = 'sine', v = 0.07, slide = 1, delay = 0) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(f * slide, t0 + d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(AC.destination); o.start(t0); o.stop(t0 + d + 0.02);
  } catch (e) { /* bez zvuku */ }
}
// Hudba a efekty z Envato (audio/*.mp3) cez WebAudio; hudba sa pri zmene režimu prelína.
const AUD = {}, MUSIC_VOL = 0.32;
let musicOn = true, curTrack = null;
try { musicOn = localStorage.getItem('mathemagic-zvuk') !== 'off'; } catch (e) { /* nič */ }
function audioCtx() { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); return AC; }
function loadAudio() {
  const ac = audioCtx();
  ['svet', 'uvod', 'suboj', 'boss', 'kuzlo', 'zasah', 'gula', 'minca', 'truhla', 'objav'].forEach(n => {
    if (AUD[n]) return;
    AUD[n] = 'loading';
    fetch('audio/' + n + '.mp3').then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(buf => { AUD[n] = buf; if (curTrack && curTrack.name === n && !curTrack.src) startTrack(n); }).catch(() => { AUD[n] = null; });
  });
}
function play(n, vol = 0.8, rate = 1) {
  const buf = AUD[n]; if (!musicOn || !buf || typeof buf === 'string') return false;
  const ac = audioCtx(), src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = buf; src.playbackRate.value = rate; g.gain.value = vol;
  src.connect(g).connect(ac.destination); src.start();
  return true;
}
function startTrack(n) {
  const buf = AUD[n];
  if (!buf || typeof buf === 'string' || !musicOn) return;
  const ac = audioCtx(), src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = buf; src.loop = true;
  g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.exponentialRampToValueAtTime(MUSIC_VOL, ac.currentTime + 1.2);
  src.connect(g).connect(ac.destination); src.start();
  curTrack.src = src; curTrack.g = g;
}
function music(n) {
  if (curTrack && curTrack.name === n) return;
  if (curTrack && curTrack.src) {
    const { src, g } = curTrack, ac = audioCtx();
    g.gain.cancelScheduledValues(ac.currentTime); g.gain.setValueAtTime(g.gain.value, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.8); src.stop(ac.currentTime + 0.85);
  }
  curTrack = { name: n };
  startTrack(n);
}
function toggleSound() {
  musicOn = !musicOn;
  try { localStorage.setItem('mathemagic-zvuk', musicOn ? 'on' : 'off'); } catch (e) { /* nič */ }
  const n = curTrack && curTrack.name; if (curTrack && curTrack.src) { curTrack.src.stop(); } curTrack = null;
  if (musicOn && n) music(n);
  $('mute').classList.toggle('off', !musicOn);
}
const sfx = {
  ok: () => { tone(784, 0.18, 'triangle', 0.05); tone(1175, 0.25, 'triangle', 0.04, 1, 0.07); },
  cast: () => play('kuzlo', 0.7),
  pop: i => play('gula', 0.35, 1 + i * 0.12) || sfx.orb(i),
  bad: () => tone(196, 0.35, 'sine', 0.07, 0.75),
  orb: i => tone(523 * Math.pow(1.26, i), 0.22, 'triangle', 0.045),
  merge: () => { if (!play('kuzlo', 0.75)) { tone(1046, 0.3, 'sine', 0.05); tone(1568, 0.4, 'sine', 0.03, 1, 0.05); } },
  whoosh: () => {},
  hit: () => { if (!play('zasah', 0.9)) { tone(110, 0.3, 'sine', 0.12, 0.5); tone(2093, 0.25, 'triangle', 0.03, 0.7, 0.02); } },
  coin: () => { if (!play('minca', 0.7)) { tone(1319, 0.08, 'square', 0.02); tone(1760, 0.14, 'square', 0.02, 1, 0.06); } },
  chest: () => play('truhla', 0.8) || sfx.coin(),
  unlock: () => play('objav', 0.8) || [523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, 0.5, 'triangle', 0.05, 1, i * 0.1)),
  rustle: () => tone(2600, 0.08, 'sawtooth', 0.01, 0.4),
  step: () => tone(90 + rng() * 30, 0.04, 'sine', 0.025),
};

// ---------- častice (pool, bez alokácií v slučke) ----------
const PM = 600;
const P = {
  x: new Float32Array(PM), y: new Float32Array(PM), vx: new Float32Array(PM), vy: new Float32Array(PM),
  life: new Float32Array(PM), max: new Float32Array(PM), tx: new Float32Array(PM), ty: new Float32Array(PM),
  g: new Float32Array(PM), z: new Float32Array(PM), seek: new Uint8Array(PM), acc: new Uint8Array(PM), shape: new Uint8Array(PM),
};
let pIdx = 0;
function spawn(x, y, vx, vy, life, acc, shape, g = 60, z = 0) {
  const i = pIdx; pIdx = (pIdx + 1) % PM;
  P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.life[i] = life; P.max[i] = life;
  P.acc[i] = acc; P.shape[i] = shape; P.g[i] = g; P.seek[i] = 0; P.z[i] = z;
  return i;
}
// Výbuch častíc; časť z nich letí „ku kamere“ a je rozmazaná (bokeh).
function burst(x, y, el, n, speed = 90, life = 0.9, g = 60) {
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2, s = speed * (0.3 + rng() * 0.9);
    spawn(x + (rng() - 0.5) * 6, y + (rng() - 0.5) * 6, Math.cos(a) * s, Math.sin(a) * s - 20, life * (0.6 + rng() * 0.6), el.acc, el.shape, g, rng() < 0.25 ? 0.4 + rng() * 0.5 : 0);
  }
}
function updParticles(dt) {
  const fr = Math.pow(0.95, dt * 60);
  for (let i = 0; i < PM; i++) {
    if (P.life[i] <= 0) continue;
    if (P.seek[i]) {
      if (P.life[i] > P.max[i] - P.g[i]) { P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.vx[i] *= fr; P.vy[i] *= fr; P.life[i] -= dt; continue; }
      const k = Math.min(1, dt * 5);
      P.x[i] += (P.tx[i] - P.x[i]) * k; P.y[i] += (P.ty[i] - P.y[i]) * k;
      continue;
    }
    P.life[i] -= dt;
    P.vx[i] *= fr; P.vy[i] = P.vy[i] * fr + P.g[i] * dt;
    P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
  }
}
function drawParticles() {
  for (let i = 0; i < PM; i++) {
    if (P.life[i] <= 0) continue;
    const x = P.x[i] | 0, y = P.y[i] | 0, a = P.acc[i];
    if (x < 1 || y < 1 || x >= W - 2 || y >= H - 2) continue;
    R.depth(P.z[i]); R.sym(SH2Z[P.shape[i]]);
    if (P.seek[i]) { R.pa(x, y, a, 0.95); R.pa(x + 1, y, a, 0.8); R.pa(x, y + 1, a, 0.8); R.pa(x + 1, y + 1, a, 0.55); continue; }
    const r = P.life[i] / P.max[i];
    if (r < 0.5 && R.TH[y * W + x] > r * 2) continue; // rozpad do rastra
    const s = 0.5 + r * 0.5;
    if (P.z[i] > 0.3) { R.orb(x, y, 1.4 + P.z[i] * 2, a, 0.9); continue; }
    switch (P.shape[i]) {
      case 1: R.pa(x, y, a, s + 0.2); if (r > 0.35) { R.pa(x + 1, y - 1, a, s); R.pa(x + 1, y, a, s - 0.15); } break; // lístok
      case 2: R.pa(x, y, a, s + 0.2); R.pa(x + 1, y, a, s); R.pa(x, y + 1, a, s); if (r > 0.5) R.pa(x + 1, y + 1, a, s - 0.2); break; // úlomok
      case 3: R.pa(x, y, a, s + 0.25); if (r > 0.3) R.pa(x, y - 1, a, s); break; // plamienok
      case 4: R.pa(x, y, a, 1); R.pa(x + 1, y + 1, a, 0.8); R.pa(x, y + 2, a, 0.8); break; // blesk
      default: R.pa(x, y, a, s + 0.2);
    }
  }
  R.depth(0);
}
function clearSeek() { for (let i = 0; i < PM; i++) if (P.seek[i]) P.life[i] = 0; }

// Svetlušky – pomaly plávajúce kúzelné bodky, niektoré blízko kamery (rozmazané).
const MOTES = Array.from({ length: 34 }, (_, k) => ({ x: rng() * W, y: rng() * H, z: rng() < 0.4 ? 0.5 + rng() * 0.5 : rng() * 0.2, ph: rng() * 6, acc: k % 3 ? A.YELLOW : A.GREEN }));
function drawMotes(dt, accOverride) {
  for (const m of MOTES) {
    m.ph += dt;
    m.x += Math.sin(m.ph * 0.7) * 4 * dt + 3 * dt; m.y += Math.cos(m.ph * 0.5) * 3 * dt - 2 * dt;
    if (m.x > W + 4) m.x = -4; if (m.y < -4) m.y = H + 4;
    const tw = 0.55 + 0.45 * Math.sin(m.ph * 2.3);
    R.depth(m.z); R.sym(Z.DOT);
    if (m.z > 0.45) R.orb(m.x, m.y, 1.5 + m.z * 2.5, accOverride || m.acc, 0.7 * tw + 0.3);
    else if (tw > 0.35) { R.pa(m.x, m.y, accOverride || m.acc, 0.6 + tw * 0.4); }
  }
  R.depth(0);
}

// ---------- svet ----------
const VIG = new Float32Array(R.N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (x - 160) / 160, dy = (y - 90) / 90;
  VIG[y * W + x] = 1.05 - 0.3 * (dx * dx + dy * dy);
}

function enterScreen(key) {
  const sc = SCREENS[key];
  world = { key, grid: sc.map.map(r => [...r]), objs: [], spots: [], enemies: [], grace: 0.8, bgB: new Float32Array(R.N), bgC: new Uint8Array(R.N), pads: [] };
  sc.map.forEach((row, ty) => [...row].forEach((ch, tx) => {
    const o = { tx, ty, x: tx * T + 8, y: OY + ty * T + 8, id: `${key}:${tx},${ty}`, shake: 0, inside: false };
    if (ch === 'P') world.objs.push({ ...o, type: 'book' });
    if (ch === 'S' && row[tx - 1] !== 'S') world.objs.push({ ...o, x: o.x + 8, type: 'shop', r: 25 });
    if (ch === 'F') world.objs.push({ ...o, type: 'fire' });
    if (ch === 'C') world.objs.push({ ...o, type: 'chest' });
    if (ch === 'b') world.objs.push({ ...o, type: 'bush' });
    if (ch === '2') world.objs.push({ ...o, type: 'bush', rune: 2 });
    if (ch === '3') world.objs.push({ ...o, type: 'rune', n: 3, r: 11 });
    if (ch === 'L') world.objs.push({ ...o, type: 'lock', n: 3 });
    if (ch === 'E') world.spots.push({ ...o, type: 'slime' });
    if (ch === 'X') world.spots.push({ ...o, type: 'boss' });
    if (ch === 'W' && R.hash(tx, ty, 21) > 0.72) world.pads.push({ x: o.x + (R.hash(tx, ty, 22) - 0.5) * 8, y: o.y + (R.hash(tx, ty, 23) - 0.5) * 6 });
  }));
  buildBg();
  spawnEnemies();
  hud();
}

function spawnEnemies() {
  world.enemies = [];
  for (const s of world.spots) {
    const d = S.defeated[s.id], boss = s.type === 'boss';
    if (d !== undefined && (boss || S.time - d < 120)) continue;
    world.enemies.push({ id: s.id, type: s.type, hx: s.x, hy: s.y + 4, x: s.x, y: s.y + 4, tx: s.x, ty: s.y + 4, wt: rng() * 2, anim: rng() * 3, cool: 0 });
  }
}

function walkable(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= 20 || ty >= 11) return false;
  const ch = world.grid[ty][tx];
  if (ch === '=') return S.bridge;
  return !SOLID.has(ch);
}
function solidPx(x, y) {
  const tx = Math.floor(x / T), ty = Math.floor((y - OY) / T);
  if (tx < 0 || tx >= 20 || ty < 0 || ty >= 11) {
    const ex = SCREENS[world.key].exits;
    if (tx < 0) return !ex.w; if (tx >= 20) return !ex.e; if (ty < 0) return !ex.n; return !ex.s;
  }
  return !walkable(tx, ty);
}
const blocked = (x, y) => solidPx(x - 4, y - 4) || solidPx(x + 4, y - 4) || solidPx(x - 4, y) || solidPx(x + 4, y);
function moveHero(dx, dy) {
  let moved = false;
  if (dx && !blocked(hero.x + dx, hero.y)) { hero.x += dx; moved = true; }
  if (dy && !blocked(hero.x, hero.y + dy)) { hero.y += dy; moved = true; }
  return moved;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const heroTile = () => ({ x: clamp(Math.floor(hero.x / T), 0, 19), y: clamp(Math.floor((hero.y - 2 - OY) / T), 0, 10) });

function findPath(sx, sy, gx, gy) {
  const prev = new Int16Array(220).fill(-1), start = sy * 20 + sx, goal = gy * 20 + gx, q = [start];
  prev[start] = start;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]; if (c === goal) break;
    const cx = c % 20, cy = (c / 20) | 0;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (!walkable(nx, ny)) continue;
      if (dx && dy && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
      const n = ny * 20 + nx;
      if (prev[n] >= 0) continue;
      prev[n] = c; q.push(n);
    }
  }
  if (prev[goal] < 0) return null;
  const path = [];
  for (let c = goal; c !== start; c = prev[c]) path.push(c);
  return path.reverse().map(c => ({ x: (c % 20) * T + 8, y: OY + ((c / 20) | 0) * T + 12 }));
}

function tapWorld(lx, ly) {
  let tx = clamp(Math.floor(lx / T), 0, 19), ty = clamp(Math.floor((ly - OY) / T), 0, 10);
  const st = heroTile();
  if (!walkable(tx, ty)) {
    let best = null, bd = 1e9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = tx + dx, ny = ty + dy;
      if (!walkable(nx, ny)) continue;
      const d = Math.abs(nx - st.x) + Math.abs(ny - st.y) + (dx && dy ? 3 : 0);
      if (d < bd) { bd = d; best = [nx, ny]; }
    }
    if (!best) return;
    [tx, ty] = best;
  }
  const p = findPath(st.x, st.y, tx, ty);
  if (!p) return;
  hero.path = p;
  hero.out = null;
  const ex = SCREENS[world.key].exits;
  if (tx === 0 && ex.w) hero.out = [-1, 0];
  else if (tx === 19 && ex.e) hero.out = [1, 0];
  else if (ty === 0 && ex.n) hero.out = [0, -1];
  else if (ty === 10 && ex.s) hero.out = [0, 1];
  tapFx = { x: lx, y: ly, t: 0 };
}

function go(key, x, y) {
  hero.path = []; hero.out = null;
  transition(() => { enterScreen(key); hero.x = x; hero.y = y; });
}
function checkEdge() {
  const ex = SCREENS[world.key].exits;
  if (hero.x < 0 && ex.w) go(ex.w, W - 4, hero.y);
  else if (hero.x > W && ex.e) go(ex.e, 4, hero.y);
  else if (hero.y < OY && ex.n) go(ex.n, hero.x, OY + 11 * T - 3);
  else if (hero.y > OY + 11 * T && ex.s) go(ex.s, hero.x, OY + 6);
}

function updateWorld(dt) {
  S.time += dt;
  world.grace -= dt;
  let mx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0);
  let my = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0);
  if (mx || my) { hero.path = []; hero.out = null; const l = Math.hypot(mx, my); mx /= l; my /= l; }
  else if (hero.path.length) {
    const wp = hero.path[0], dx = wp.x - hero.x, dy = wp.y - hero.y, d = Math.hypot(dx, dy);
    if (d < 1.5) hero.path.shift(); else { mx = dx / d; my = dy / d; }
  } else if (hero.out) [mx, my] = hero.out;

  if (mx || my) {
    const sp = 64 * dt;
    if (!moveHero(mx * sp, my * sp)) { if (hero.path.length) hero.path.shift(); else hero.out = null; }
    const before = (hero.walk * 8) | 0;
    hero.walk += dt;
    if (((hero.walk * 8) | 0) !== before && ((hero.walk * 8) | 0) % 2 === 0) {
      sfx.step();
      R.depth(0); spawn(hero.x + (rng() - 0.5) * 6, hero.y, (rng() - 0.5) * 10, -6, 0.35, A.PAPER, 0, 10);
    }
    if (mx) hero.face = mx > 0 ? 1 : -1;
    hero.dir = Math.abs(mx) > Math.abs(my) * 0.9 ? (mx > 0 ? 2 : 3) : (my > 0 ? 0 : 1);
    hero.idle = 0;
    checkEdge();
  } else { hero.walk = 0; hero.idle += dt; }
  if (trans) return;

  for (const o of world.objs) {
    o.shake = Math.max(0, o.shake - dt);
    const d = Math.hypot(hero.x - o.x, hero.y - 4 - o.y);
    if (d < (o.r || 18)) { if (!o.inside) { o.inside = true; interact(o); } }
    else if (d > (o.r || 18) + 6) o.inside = false;
  }
  for (const e of world.enemies) {
    e.anim += dt; e.cool -= dt; e.wt -= dt;
    if (e.type === 'slime') {
      if (e.wt <= 0) { e.wt = 1.5 + rng() * 2; e.tx = e.hx + (rng() - 0.5) * 28; e.ty = e.hy + (rng() - 0.5) * 16; }
      const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
      if (d > 1) { e.x += dx / d * 12 * dt; e.y += dy / d * 12 * dt; }
    }
    const d = Math.hypot(hero.x - e.x, hero.y - e.y);
    if (world.grace <= 0 && e.cool <= 0 && d < (e.type === 'boss' ? 24 : 13)) { touchEnemy(e); break; }
  }
  if (tapFx && (tapFx.t += dt) > 0.5) tapFx = null;
}

function interact(o) {
  hero.path = []; hero.out = null;
  if (o.type === 'book' && !S.ops.length) {
    S.ops = ['+'];
    sfx.unlock();
    startCut('spell', '+', o.x, o.y - 16);
  } else if (o.type === 'fire') {
    S.hearts = S.maxHearts;
    S.cp = { screen: world.key, x: o.x, y: o.y + 20 };
    hud(); save();
    burst(o.x, o.y - 6, EL['*'], 30, 50, 1, -30);
    toast('Srdiečka sú plné. Hra je uložená.');
  } else if (o.type === 'chest' && !S.opened[o.id]) {
    S.opened[o.id] = 1; S.coins += 5;
    burst(o.x, o.y - 4, EL['/'], 50, 80, 1, 40);
    sfx.chest(); hud(); save();
    toast('+5 mincí');
  } else if (o.type === 'bush') {
    o.shake = 0.4; sfx.rustle();
    burst(o.x, o.y - 2, EL['+'], 10, 40, 0.7);
    if (o.rune && !S.numbers.includes(o.rune)) {
      burst(o.x, o.y - 6, { acc: A.YELLOW, shape: 0 }, 40, 70);
      later(0.45, () => gainNumber(o.rune, o.x, o.y - 6));
    } else if (!S.bushes[o.id] && R.hash(o.tx, o.ty, 9) < 0.4) {
      S.bushes[o.id] = 1; S.coins += 1; sfx.coin(); hud(); toast('+1 minca');
    }
  } else if (o.type === 'rune' && !S.numbers.includes(o.n)) {
    gainNumber(o.n, o.x, o.y - 6);
  } else if (o.type === 'shop') openShop();
  else if (o.type === 'lock' && !S.bridge) openLock();
}

function gainNumber(n, x, y) {
  S.numbers = [...new Set([...S.numbers, n])].sort((a, b) => a - b);
  sfx.unlock();
  startCut('number', String(n), x, y);
  save();
}

function touchEnemy(e) {
  hero.path = []; hero.out = null;
  if (!S.ops.length) {
    e.cool = 2.5;
    const d = Math.hypot(hero.x - e.x, hero.y - e.y) || 1;
    for (let k = 0; k < 10; k++) moveHero((hero.x - e.x) / d * 2, (hero.y - e.y) / d * 2);
    toast('Bez kúzla to nepôjde. Nájdi knihu!');
    return;
  }
  transition(() => { mode = 'combat'; setupCombat(e); });
}

// ---------- statické pozadie obrazovky ----------
function poppy(x, y) { // vlčí mak: drobná tienená kvapka ako na referencii
  R.sym(Z.TIMES);
  R.px(x, y + 2, 0.3);
  R.pa(x, y, A.RED, 0.85); R.pa(x + 1, y, A.RED, 0.7); R.pa(x, y + 1, A.RED, 0.6); R.pa(x + 1, y + 1, A.RED, 0.4);
}
function tree(cx, by, s, seed) {
  const rx = 10 * s, ry = 9 * s;
  R.mulEllipse(cx + 6, by + 1, rx, 4.5, 0.5);
  R.rect(cx - 2, by - 8, 5, 8, 0.1); R.px(cx - 3, by - 1, 0.1); R.px(cx + 3, by - 1, 0.1); R.rect(cx - 1, by - 8, 1, 7, 0.25);
  const top = by - 8 - ry * 0.7;
  R.shadeEllipse(cx, top, rx, ry, 0.06, 0.5, 0.03, 0.16);
  for (let k = 0; k < 4; k++) { // listnaté chumáče
    const a = k / 4 * Math.PI * 2 + seed * 6, d = rx * 0.45;
    R.shadeEllipse(cx + Math.cos(a) * d, top + Math.sin(a) * d * 0.6 - 1, rx * 0.55, ry * 0.5, 0.1, 0.62, 0.03, 0.14);
  }
  R.shadeEllipse(cx - rx * 0.2, top - ry * 0.3, rx * 0.5, ry * 0.42, 0.22, 0.68, -1, 0.12);
}
function buildBg() {
  R.depth(0); R.sym(Z.GRASS);
  R.clear(0.05);
  const g = world.grid;
  const isCh = (tx, ty, s) => tx >= 0 && ty >= 0 && tx < 20 && ty < 11 && s.includes(g[ty][tx]);
  for (let ty = 0; ty < 11; ty++) for (let tx = 0; tx < 20; tx++) {
    const ch = g[ty][tx], x0 = tx * T, y0 = OY + ty * T;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const x = x0 + i, y = y0 + j;
      let b;
      if (ch === 'W' || ch === '=') b = 0.22;
      else if (ch === ':') {
        b = 0.96 + (R.hash(x, y) - 0.5) * 0.06;
        const edge = (i < 2 && !isCh(tx - 1, ty, ':')) || (i > 13 && !isCh(tx + 1, ty, ':')) || (j < 2 && !isCh(tx, ty - 1, ':')) || (j > 13 && !isCh(tx, ty + 1, ':'));
        if (edge && R.hash(x, y, 4) > 0.45) b = 0.8;
        if (R.hash(x, y, 5) > 0.988) { b = 0.62; }
      } else {
        b = 0.66 + (R.fbm(x * 0.05, y * 0.05) - 0.5) * 0.3 + (R.hash(x, y, 1) - 0.5) * 0.05;
      }
      R.B[y * W + x] = b;
      R.SY[y * W + x] = ch === ':' ? Z.DOT : (ch === 'W' || ch === '=') ? Z.MINUS : Z.GRASS;
    }
    if (ch !== 'W' && ch !== '=' && ch !== ':') { // trsy trávy
      for (let k = 0; k < 3; k++) {
        const fx = x0 + (R.hash(tx, ty, 30 + k) * 14 | 0), fy = y0 + 3 + (R.hash(tx, ty, 40 + k) * 12 | 0);
        if (R.hash(tx, ty, 50 + k) < 0.3) { R.px(fx, fy, 0.38); R.px(fx - 1, fy - 1, 0.45); R.px(fx + 1, fy - 1, 0.45); R.px(fx, fy - 2, 0.5); }
      }
      // rozsypané maky v zhlukoch podľa šumu
      for (let k = 0; k < 8; k++) {
        const fx = x0 + (R.hash(tx, ty, 60 + k) * 14 | 0), fy = y0 + (R.hash(tx, ty, 70 + k) * 13 | 0);
        if (R.fbm(fx * 0.045, fy * 0.045, 9) > 0.71) poppy(fx, fy);
      }
    }
    if (ch === 'f') for (let k = 0; k < 9; k++) {
      const a = R.hash(tx, ty, k) * 6.28, d = R.hash(ty, tx, k + 5) * 6;
      poppy(x0 + 7 + Math.cos(a) * d, y0 + 7 + Math.sin(a) * d * 0.8);
    }
  }
  for (let ty = 0; ty < 11; ty++) for (let tx = 0; tx < 20; tx++) {
    const ch = g[ty][tx], cx = tx * T + 8, cy = OY + ty * T + 8, by = OY + ty * T + 14;
    R.sym(ch === 'o' || ch === 'P' || ch === 'F' ? Z.DIV : ch === 'S' || ch === 'L' || ch === 'C' ? Z.EQ : Z.PLUS);
    if (ch === 'T') tree(cx + (R.hash(tx, ty, 8) - 0.5) * 3, by, 0.85 + R.hash(tx, ty, 3) * 0.35, R.hash(tx, ty, 6));
    else if (ch === 'b' || ch === '2') {
      R.mulEllipse(cx + 3, cy + 7, 8, 3, 0.5);
      R.shadeEllipse(cx, cy + 2, 7.5, 6, 0.12, 0.6, 0.04, 0.16);
      R.shadeEllipse(cx - 3, cy, 4, 3.5, 0.2, 0.66, -1, 0.14);
      R.shadeEllipse(cx + 3, cy - 1, 4, 3.5, 0.18, 0.66, -1, 0.14);
    } else if (ch === 'o') {
      R.mulEllipse(cx + 4, cy + 6, 9, 3, 0.5);
      R.shadeEllipse(cx, cy + 2, 8, 5.5, 0.28, 0.68, 0.05, 0.06);
      for (let k = 0; k < 7; k++) R.pa(cx - 4 + k, cy - 2 + (k % 3 === 0 ? 1 : 0), A.GREEN, 0.45 + (k % 2) * 0.2); // mach
    } else if (ch === 'S' && g[ty][tx - 1] !== 'S') drawStall(tx * T, OY + ty * T);
    else if (ch === 'F') {
      R.mulEllipse(cx + 2, cy + 6, 11, 3.5, 0.6);
      for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; R.shadeEllipse(cx + Math.cos(a) * 7, cy + 3 + Math.sin(a) * 3.5, 2.4, 2, 0.3, 0.6, 0.04); }
      R.rect(cx - 6, cy + 2, 12, 2, 0.1); R.rect(cx - 4, cy + 1, 8, 1, 0.22);
    } else if (ch === 'P') {
      R.mulEllipse(cx + 5, by, 9, 3, 0.5);
      for (let y = by - 12; y < by; y++) for (let x = cx - 4; x < cx + 4; x++) R.px(x, y, 0.3 + 0.55 * (1 - (x - cx + 4) / 8) + ((y % 4 === 0) ? -0.12 : 0));
      R.rect(cx - 7, by - 15, 14, 3, 0.9); R.rect(cx - 7, by - 12, 14, 1, 0.08);
      R.rect(cx - 6, by - 1, 12, 2, 0.32);
      R.glyph('+', cx - 1, by - 9, 1, 0.12);
    } else if (ch === 'L') {
      R.mulEllipse(cx + 4, by, 9, 3, 0.5);
      R.shadeEllipse(cx - 2, cy + 3, 6, 5, 0.12, 0.5, 0.03);
      R.shadeEllipse(cx - 2, cy, 5, 2, 0.62, 0.3, 0.03);
      R.rect(cx + 6, cy - 6, 1, 12, 0.12);
      R.rect(cx + 2, cy - 12, 9, 8, 0.03); R.rect(cx + 3, cy - 11, 7, 6, 0.9);
      R.glyph('3', cx + 5, cy - 11, 1, 0.05);
      for (let k = 0; k < 14; k++) R.px(cx - 6 + Math.sin(k * 0.9) * 2, cy + 6 + k, 0.15);
    } else if (ch === 'C') R.mulEllipse(cx + 4, by, 9, 3, 0.5);
  }
  if (S.bridge) drawBridge();
  world.bgB.set(R.B); world.bgC.set(R.C);
  const wi = [], shore = [], br = [];
  for (let ty = 0; ty < 11; ty++) for (let tx = 0; tx < 20; tx++) {
    const ch = g[ty][tx]; if (ch !== 'W' && ch !== '=') continue;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      wi.push((OY + ty * T + j) * W + tx * T + i);
      shore.push(j < 2 && !isCh(tx, ty - 1, 'W=') ? (j === 0 ? 2 : 1) : 0);
      br.push(ch === '=' ? 1 : 0);
    }
  }
  world.water = Int32Array.from(wi); world.shore = Uint8Array.from(shore); world.br = Uint8Array.from(br);
}

function drawStall(x0, y0) {
  R.mulEllipse(x0 + 19, y0 + 15, 19, 3.5, 0.5);
  R.rect(x0 + 1, y0 - 6, 2, 21, 0.1); R.rect(x0 + 29, y0 - 6, 2, 21, 0.1);
  R.sprite(NPC, x0 + 11, y0 - 2);
  for (let i = 0; i < 32; i++) {
    const red = Math.floor(i / 4) % 2 === 0, len = 7 + (i % 4 === 1 || i % 4 === 2 ? 1 : 0);
    for (let j = 0; j < len; j++) { if (red) R.pa(x0 + i, y0 - 10 + j, A.RED, 0.85 - j * 0.04); else R.px(x0 + i, y0 - 10 + j, 0.95 - j * 0.03); }
  }
  R.rect(x0, y0 - 11, 32, 1, 0.03);
  R.rect(x0, y0 + 6, 32, 1, 0.03); R.rect(x0, y0 + 7, 32, 8, 0.7); R.rect(x0, y0 + 14, 32, 1, 0.1);
  for (let x = 0; x < 32; x += 4) R.px(x0 + x, y0 + 8 + (x % 8 ? 2 : 4), 0.45);
  for (const [bx, a] of [[4, A.GREEN], [8, A.ICE], [21, A.YELLOW], [26, A.RED]]) {
    R.rect(x0 + bx, y0 + 1, 4, 5, 0.03); R.rectA(x0 + bx + 1, y0 + 2, 2, 3, a, 0.8); R.pa(x0 + bx + 1, y0 + 2, a, 1);
  }
}

function drawBridge() {
  R.sym(Z.EQ);
  const x0 = 9 * T, y0 = OY + 4 * T;
  for (let y = y0; y < y0 + 32; y++) for (let x = x0 + 2; x < x0 + 30; x++) R.px(x, y, (y - y0) % 4 === 0 ? 0.12 : 0.68 + (R.hash(x, y) - 0.5) * 0.14 + ((x - x0) % 9 === 0 ? -0.15 : 0));
  for (let y = y0 - 2; y < y0 + 34; y++) {
    R.pa(x0 + 1, y, A.GREEN, 0.5 + (y % 3) * 0.15); R.pa(x0 + 30, y, A.GREEN, 0.5 + ((y + 1) % 3) * 0.15);
    if (y % 5 === 0) { R.pa(x0, y, A.GREEN, 0.8); R.pa(x0 - 1, y + 1, A.GREEN, 0.6); R.pa(x0 + 31, y + 2, A.GREEN, 0.8); R.pa(x0 + 32, y + 3, A.GREEN, 0.6); }
  }
}

// ---------- kreslenie sveta ----------
const HB = HERO_BIG.map(d => d.map(R.codeSprite)), HS = HERO_SMALL.map(d => d.map(R.codeSprite));
// Čarodejník: o.big = plná veľkosť (súboj, úvod), inak menšia do sveta. Ukotvený na stredu nôh (x, y).
function drawHero(x, y, o = {}) {
  const set = o.big ? HB : HS, spr = set[o.dir ?? 0][o.frame || 0];
  const magic = o.magic || (S && S.ops.length);
  const sc = o.scale || 1, sx = Math.round(x - spr.w * sc / 2), sy = Math.round(y - spr.h * sc + 1 + (o.bob || 0));
  const crystal = S && S.hat ? S.hat : magic ? A.GREEN : A.PAPER;
  R.sprite(spr, sx, sy, { hat: crystal, flash: o.flash, scale: sc });
  const pulse = 0.85 + Math.sin(gTime * 4) * 0.15, kx = sx + (spr.cx + 0.5) * sc, ky = sy + (spr.cy + 0.5) * sc;
  R.orb(kx, ky, (o.big ? 2.6 : 1.5) * sc * pulse * (o.orb || 1), crystal, magic ? 0.85 : 0.45);
  if (magic && !o.noLight) R.glow(kx, ky, o.big ? 40 : 20, 0.2);
  return { kx, ky };
}

function drawWorld(dt) {
  R.depth(0);
  R.B.set(world.bgB); R.C.set(world.bgC); R.D.fill(0); R.L.set(VIG);
  const wt = world.water, sh = world.shore, br = world.br, t = gTime, bTop = OY + 4 * T;
  for (let k = 0; k < wt.length; k++) {
    const i = wt[k], x = i % W, y = (i / W) | 0;
    if (br[k] && S.bridge && (y - bTop) < bridgeGrow * 32) continue;
    let b;
    if (sh[k] === 2) b = 0.08;
    else if (sh[k]) b = 0.85;
    else {
      b = 0.24 + 0.1 * Math.sin(x * 0.3 + t * 1.4 + Math.sin(y * 0.45 + t) * 1.6) + 0.06 * Math.sin(y * 0.9 - t * 2);
      const streak = Math.sin(x * 0.11 - t * 0.8 + y * 2.3);
      if (streak > 0.96) b = 0.75; // odlesky
      if (R.hash(x >> 1, y, (t * 3) | 0) > 0.994) b = 1;
    }
    R.B[i] = b; R.C[i] = 0; R.SY[i] = Z.MINUS;
  }
  R.sym(Z.PLUS);
  for (const p of world.pads) { // lekná
    const dx = Math.sin(t * 0.6 + p.x) * 1.2;
    R.shadeEllipse(p.x + dx, p.y, 4, 2.4, 0.4, 0.5, 0.04, 0, A.GREEN);
    R.px(p.x + dx + 1, p.y, 0.2);
  }
  const items = [];
  for (const o of world.objs) {
    if (o.type === 'book') items.push([o.y + 6, () => {
      if (S.ops.length) return;
      const bob = Math.sin(t * 2.2) * 2;
      R.ring(o.x, o.y + 5, 11 + Math.sin(t * 3) * 1, 1.6, A.GREEN, 0.9, 0.4);
      R.orb(o.x, o.y - 14 + bob, 11, A.GREEN, 0.38 + Math.sin(t * 3) * 0.06);
      R.sym(Z.EQ); R.sprite(BOOK, o.x - 7, o.y - 18 + bob); R.sym(Z.PLUS);
      for (let k = 0; k < 8; k++) {
        const a = t * 1.6 + k / 8 * Math.PI * 2;
        R.pa(o.x + Math.cos(a) * 12, o.y - 13 + Math.sin(a) * 4 + bob, A.GREEN, 0.6 + 0.4 * Math.sin(a * 2 + t));
      }
      if (rng() < 0.1) spawn(o.x + (rng() - 0.5) * 12, o.y - 12, 0, -14, 1.2, A.GREEN, 1, -6);
      R.glow(o.x, o.y - 12, 34, 0.45);
    }]);
    if (o.type === 'fire') items.push([o.y, () => {
      const fl = Math.sin(t * 11) * 0.5 + Math.sin(t * 23) * 0.3;
      R.sym(Z.TIMES);
      R.orb(o.x, o.y + 1, 5 + fl * 0.6, A.RED, 0.9);
      R.orb(o.x + Math.sin(t * 7) * 0.8, o.y - 3, 3.8 + fl * 0.5, A.ORANGE, 1);
      R.orb(o.x + Math.sin(t * 9) * 1.1, o.y - 7, 2.4 + fl * 0.4, A.YELLOW, 1);
      if (rng() < 0.15) spawn(o.x + (rng() - 0.5) * 6, o.y - 8, (rng() - 0.5) * 10, -22, 1.3, rng() < 0.5 ? A.ORANGE : A.YELLOW, 3, -6);
      R.glow(o.x, o.y - 2, 56, 0.4 + 0.07 * fl);
    }]);
    if (o.type === 'chest') items.push([o.y + 6, () => {
      R.sym(Z.EQ); R.sprite(S.opened[o.id] ? CHEST_OPEN : CHEST, o.x - 7, o.y - 4); R.sym(Z.PLUS);
      if (!S.opened[o.id] && (t % 3) < 0.25) R.orb(o.x + 4, o.y - 3, 1.5, A.YELLOW, 1);
    }]);
    if (o.type === 'bush' && o.shake > 0) items.push([o.y + 6, () => {
      const dx = Math.sin(o.shake * 50) * 1.5;
      R.shadeEllipse(o.x + dx, o.y + 2, 7.5, 6, 0.12, 0.6, 0.04, 0.16);
      R.shadeEllipse(o.x - 3 + dx, o.y, 4, 3.5, 0.2, 0.66, -1, 0.14);
    }]);
    if (o.type === 'bush' && o.rune && !S.numbers.includes(o.rune) && (t % 2.2) < 0.4) items.push([o.y + 7, () => {
      const k = (t % 2.2) / 0.4, s = Math.sin(k * Math.PI) * 3;
      for (let i = -s; i <= s; i++) { R.pa(o.x + 2 + i, o.y - 3, A.YELLOW, 1); R.pa(o.x + 2, o.y - 3 + i, A.YELLOW, 1); }
      R.orb(o.x + 2, o.y - 3, 1.5, A.YELLOW, 1);
    }]);
    if (o.type === 'rune' && !S.numbers.includes(o.n)) items.push([o.y + 4, () => {
      const bob = Math.sin(t * 2) * 2;
      R.mulEllipse(o.x + 2, o.y + 6, 7, 2.5, 0.5);
      R.sym(Z.DIV); R.orb(o.x, o.y - 4 + bob, 8, A.YELLOW, 0.45);
      R.rect(o.x - 5, o.y - 10 + bob, 10, 13, 0.03); R.rect(o.x - 4, o.y - 9 + bob, 8, 11, 0.85);
      R.glyph(String(o.n), o.x - 1, o.y - 7 + bob, 1, 0.05);
      R.ring(o.x, o.y + 5, 7 + (t * 6) % 6, 1.2, A.YELLOW, 1 - ((t * 6) % 6) / 6, 0.4);
      R.glow(o.x, o.y - 4, 30, 0.35);
    }]);
    if (o.type === 'lock' && !S.bridge) items.push([o.y + 8, () => {
      if ((t % 1.6) < 0.8) R.rectA(o.x + 2, o.y - 13, 9, 1, A.GREEN, 0.9);
    }]);
  }
  for (const e of world.enemies) items.push([e.y, () => drawEnemyWorld(e)]);
  items.push([hero.y, () => {
    R.mulEllipse(hero.x + 1, hero.y, 7, 2.2, 0.45);
    const fr = hero.walk > 0 ? ((hero.walk * 7) | 0) % 4 : 0;
    drawHero(hero.x, hero.y, { frame: fr, dir: hero.dir, bob: hero.walk > 0 ? 0 : Math.round(Math.sin(hero.idle * 2.5) * 0.6) });
  }]);
  items.sort((a, b) => a[0] - b[0]).forEach(i => i[1]());
  R.sym(Z.PLUS);
  if (tapFx) R.ring(tapFx.x, tapFx.y, 2 + tapFx.t * 16, 1.2, A.PAPER, 1 - tapFx.t * 2, 0.6);
  drawParticles();
  drawMotes(dt);
}

function drawEnemyWorld(e) {
  R.sym(e.type === 'boss' ? Z.TIMES : Z.EQ);
  if (e.type === 'boss') {
    R.mulEllipse(e.x + 4, e.y, 20, 4.5, 0.45);
    R.sprite(BOSS, e.x - 20, e.y - 40 + Math.sin(e.anim * 1.5));
    for (const ex of [15, 26]) R.orb(e.x - 20 + ex, e.y - 19 + Math.sin(e.anim * 1.5), 2.2, A.RED, 0.7);
    R.glow(e.x, e.y - 20, 44, 0.12);
  } else {
    const sq = 1 + Math.sin(e.anim * 5) * 0.1;
    R.mulEllipse(e.x + 2, e.y, 8, 2.2, 0.45);
    R.sprite(SLIME, e.x - 8, e.y - 12, { squash: sq });
  }
}

// ---------- pixelové písmo 5×7 pre čísla a znamienka (SVG, ostré v každej veľkosti) ----------
const PIX = {
  '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110',
  '2': '01110100010000100010001000100011111', '3': '11111000100010000010000011000101110',
  '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110',
  '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000',
  '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100',
  '+': '00000001000010011111001000010000000', '−': '00000000000000011111000000000000000',
  '×': '00000100010101000100010101000100000', '÷': '00000001000000011111000000010000000',
  '=': '00000000001111100000111110000000000', '←': '00000001000100011111010000010000000', '✔': '00000000010001010100010000000000000', '?': '01110100010000100010001000000000100',
};
function pix(str, cls = '') {
  const ch = [...String(str)];
  let d = '';
  ch.forEach((c, k) => {
    const g = PIX[c]; if (!g) return;
    for (let i = 0; i < 35; i++) if (g[i] === '1') d += `M${k * 7 + (i % 5)} ${(i / 5) | 0}h2v1h-2z`;
  });
  return `<svg class="pix ${cls}" viewBox="0 0 ${ch.length * 7 - 1} 7" shape-rendering="crispEdges" aria-label="${str}"><path d="${d}"/></svg>`;
}

// ---------- súboj ----------
const mstate = () => ({ unlockedNumbers: S.numbers, unlockedOperations: S.ops, retry: S.math.retry });
const diffOf = boss => (boss ? Math.max(S.math.difficulty, 40) : S.math.difficulty);
const EX = 132, EY = 160, HX = 34, HY = 166;

function setupCombat(e) {
  const boss = e.type === 'boss';
  let sum = 0;
  for (let k = 0; k < 20; k++) sum += generateProblem(mstate(), diffOf(boss), rng).answer;
  const avg = sum / 20, hp = Math.max(3, Math.round(avg * (boss ? 7 : 2 + Math.floor(rng() * 3))));
  combat = { e, boss, hp, max: hp, p: null, input: '', t0: 0, phase: 'ask', knock: 0, flash: 0, dis: 0, blink: 0, last: '', el: boss ? A.RED : A.GREEN, fx: null, wave: null, attack: null, cast: 0 };
  S.fights++;
  $('ename').textContent = boss ? 'Pňoko' : 'Slizko';
  $('combat').classList.remove('hidden'); $('goal').classList.add('hidden');
  bar(); nextProblem();
}
function bar() { $('ebar').style.width = Math.max(0, combat.hp / combat.max * 100) + '%'; }
function nextProblem() {
  combat.p = generateProblem(mstate(), diffOf(combat.boss), rng, { cap: 20, last: combat.last });
  combat.last = combat.p.text; combat.input = ''; combat.t0 = performance.now(); combat.phase = 'ask';
  renderProblem();
}
const dots = (n, cls = '') => (n <= 5 ? `<span class="dots ${cls}">${'<i></i>'.repeat(n)}</span>` : '');
const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
function renderProblem(reveal = false) {
  const p = combat.p;
  let h = '';
  p.operands.forEach((n, i) => {
    if (i) h += `<span class="sym">${pix(SYM[p.ops[i - 1]])}</span>`;
    h += `<span class="op">${pix(n)}${dots(n)}</span>`;
  });
  const ans = reveal ? p.answer : (combat.input || '?');
  h += `<span class="sym">${pix('=')}</span><span id="answer" class="${reveal ? 'bad' : combat.input ? 'typed' : ''}">${pix(ans)}</span>`;
  $('ptext').innerHTML = h;
  $('hint').textContent = reveal ? `Správne je ${p.answer}. Nevadí, skúsime ďalší!` : (S.fights <= 2 ? 'Spočítaj bodky a ťukni výsledok.' : '');
}
function press(k) {
  if (mode !== 'combat' || !combat || combat.phase !== 'ask') return;
  if (/^\d$/.test(k)) {
    if (combat.input.length < 3) combat.input += k;
    tone(600 + (+k) * 40, 0.05, 'triangle', 0.03);
    if (combat.input.length >= String(combat.p.answer).length) { renderProblem(); return submit(); } // toľko číslic, koľko má výsledok → kúzlo letí hneď
  }
  else if (k === '←') combat.input = combat.input.slice(0, -1);
  else if (k === '✔') return submit();
  renderProblem();
}
// Kúzlo: každé číslo príkladu je guľa nad čarodejníkom, gule sa zlejú do jednej a tá letí do nepriateľa.
function submit() {
  if (!combat.input) return;
  const p = combat.p, ok = +combat.input === p.answer;
  recordAnswer(S.math, p, ok, performance.now() - combat.t0);
  if (ok) {
    combat.phase = 'cast'; sfx.ok();
    const el = EL[p.operation] || EL['+'];
    const n = p.operands.length, cx = HX + 18, cy = HY - 74;
    combat.fx = {
      t: 0, el, answer: p.answer, x: cx, y: cy, hit: false,
      orbs: p.operands.map((v, i) => ({ v, x: cx + (i - (n - 1) / 2) * 24, y: cy + Math.abs(i - (n - 1) / 2) * 4, born: 0.12 + i * 0.14, sound: false })),
    };
    combat.cast = 1;
    renderProblem();
  } else {
    combat.phase = 'miss'; sfx.bad();
    combat.attack = { t: 0 };
    renderProblem(true);
    later(0.45, () => {
      S.hearts--; hud(true); combat.blink = 0.8;
      burst(HX + 4, HY - 30, { acc: A.PAPER, shape: 0 }, 24, 50, 0.6);
      stage.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-5px,2px)' }, { transform: 'translate(4px,-2px)' }, { transform: 'translate(0,0)' }], { duration: 260 });
    });
    later(1.7, () => (S.hearts <= 0 ? onPlayerDefeated() : nextProblem()));
  }
}
function updateSpell(dt) {
  const f = combat.fx; if (!f) return;
  f.t += dt;
  const T1 = 0.12 + f.orbs.length * 0.14 + 0.15, T2 = T1 + 0.3, T3 = T2 + 0.38;
  f.orbs.forEach((o, i) => { if (!o.sound && f.t >= o.born) { o.sound = true; if (i === 0) sfx.pop(0); else sfx.orb(i); burst(o.x, o.y, f.el, 10, 40, 0.5, 0); } });
  if (f.t >= T1 && !f.merged && f.t < T2) { f.phase = 'merge'; }
  if (f.t >= T2 && !f.merged) {
    f.merged = true; sfx.merge(); sfx.whoosh();
    burst(f.x, f.y, f.el, 26, 70, 0.6, 0);
    combat.wave = { x: f.x, y: f.y, t: 0, acc: f.el.acc, big: 0.5 };
  }
  if (f.merged && f.t < T3) { // let po oblúku
    const k = (f.t - T2) / (T3 - T2), e = k * k * (3 - 2 * k);
    const sx = HX + 18, sy = HY - 74, tx = EX, ty = EY - 26, mx = (sx + tx) / 2, my = sy - 30;
    const nx = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * mx + e * e * tx, ny = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * my + e * e * ty;
    for (let s = 0; s < 3; s++) spawn(nx + (rng() - 0.5) * 6, ny + (rng() - 0.5) * 6, (rng() - 0.5) * 20, (rng() - 0.5) * 20, 0.5, f.el.acc, f.el.shape, 0, rng() < 0.15 ? 0.6 : 0);
    f.x = nx; f.y = ny;
  }
  if (f.t >= T3 && !f.hit) {
    f.hit = true; combat.cast = 0;
    combat.hp -= f.answer; combat.flash = 1; combat.knock = 1; bar(); sfx.hit();
    burst(EX, EY - 26, f.el, 110, 140);
    combat.wave = { x: EX, y: EY - 22, t: 0, acc: f.el.acc, big: 1 };
    floatText(String(f.answer), EX, EY - 64, f.el.acc);
    stage.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(4px,-3px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }], { duration: 220 });
    later(0.1, () => { combat.fx = null; });
    if (combat.hp <= 0) win(); else later(0.6, nextProblem);
  }
}
function drawSpell() {
  const f = combat.fx; if (!f) return;
  R.sym(SH2Z[f.el.shape]);
  const T1 = 0.12 + f.orbs.length * 0.14 + 0.15, T2 = T1 + 0.3;
  if (!f.merged) {
    const mk = f.t > T1 ? Math.min(1, (f.t - T1) / (T2 - T1)) : 0, e = mk * mk;
    f.orbs.forEach(o => {
      if (f.t < o.born) return;
      const grow = Math.min(1, (f.t - o.born) / 0.12);
      const r = (4 + o.v * 0.9) * grow * (1 + Math.sin(gTime * 14 + o.v) * 0.06);
      const x = o.x + (f.x - o.x) * e, y = o.y + (f.y - o.y) * e;
      R.orb(x, y, r, f.el.acc, 1);
      if (e < 0.4 && grow >= 1) R.glyph(String(o.v).slice(-1), x - 1, y - 2, 1, 0.05);
      R.glow(x, y, 26, 0.2);
    });
    R.ring(HX + 18, HY + 1, 20 + Math.sin(gTime * 6), 2.4, f.el.acc, 1, 0.32); R.ring(HX + 18, HY + 1, 13, 1.2, f.el.acc, 0.8, 0.32); // kruh pod čarodejníkom
    for (let k = 0; k < 6; k++) { const a = gTime * 2 + k / 6 * 6.283; R.pa(HX + 18 + Math.cos(a) * 18, HY + 1 + Math.sin(a) * 5.8, f.el.acc, 1); }
  } else if (!f.hit) {
    const r = Math.min(13, 5.5 + f.answer * 0.6);
    R.orb(f.x, f.y, r, f.el.acc, 1);
    R.glow(f.x, f.y, 50, 0.5);
  }
}
function win() {
  combat.phase = 'win';
  const el = { acc: combat.el, shape: combat.boss ? 3 : 1 };
  later(0.25, () => burst(EX, EY - 26, el, 180, 160, 1.4, -20));
  later(1.4, () => {
    const reward = combat.boss ? 10 : 3;
    S.coins += reward; S.defeated[combat.e.id] = S.time; sfx.coin();
    const wasBoss = combat.boss;
    endCombat(() => {
      toast(`+${reward} mincí`);
      if (wasBoss) { S.boss = true; save(); later(0.5, () => startCut('boss', '-', hero.x, hero.y - 10)); }
    });
  });
}
function endCombat(after) {
  transition(() => {
    mode = 'world'; combat = null;
    $('combat').classList.add('hidden');
    spawnEnemies(); world.grace = 1.4; hud();
    after && after();
  });
}
// Čo sa stane po strate všetkých životov – zatiaľ návrat k ohňu bez straty odomknutého.
function onPlayerDefeated() {
  transition(() => {
    mode = 'world'; combat = null;
    $('combat').classList.add('hidden');
    S.hearts = S.maxHearts;
    enterScreen(S.cp.screen); hero.x = S.cp.x; hero.y = S.cp.y; hero.path = [];
    hud(); save();
    panel(`<h2>Nevadí!</h2><p>Pri ohni si oddýchneš a srdiečka sú zase plné. Skús to znova.</p>`, [{ label: 'Ďalej' }]);
  });
}
function updateCombat(dt) {
  combat.knock = Math.max(0, combat.knock - dt * 3);
  combat.flash = Math.max(0, combat.flash - dt * 4);
  combat.blink = Math.max(0, combat.blink - dt);
  if (combat.wave && (combat.wave.t += dt) > 0.6) combat.wave = null;
  if (combat.attack && (combat.attack.t += dt) > 0.7) combat.attack = null;
  if (combat.phase === 'win') combat.dis = Math.min(1.05, combat.dis + dt * 0.9);
  updateSpell(dt);
}
// Scéna súboja: svetlá hmla so zhlukmi v rôznej hĺbke, vzdialený les (rozmazaný), zem a rozmazaná tráva v popredí.
function drawCombat(dt) {
  R.clusterField(gTime, 0.09, 0.14);
  const el = combat.el, horizon = 104;
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
    const f = R.fieldAt(x, y);
    if (y < horizon) {
      R.B[i] = 0.84 + (f - 0.5) * 0.5 - (horizon - y) * 0.0012;
      const c = specks(x, y, f, 0.56, el);
      R.C[i] = c; R.D[i] = c ? 0.15 + R.field2At(x, y) * 0.85 : 0.75; R.SY[i] = c ? Z.PLUS : Z.DOT;
    } else {
      const g = 0.72 + (R.fbm(x * 0.06, y * 0.12) - 0.5) * 0.3 + (R.hash(x, y, 1) - 0.5) * 0.06;
      R.B[i] = g; R.C[i] = 0;
      R.D[i] = Math.min(1, Math.abs(y - (EY - 4)) / 30) * (y > EY ? 0.9 : 0.55);
      if (R.hash(x, y, 2) > 0.985) R.B[i] = 0.35;
      R.SY[i] = Z.GRASS;
    }
  }
  R.L.set(VIG);
  // vzdialený les
  R.depth(0.85); R.sym(Z.MINUS);
  for (let x = 0; x < W; x++) {
    const h1 = 14 + R.fbm(x * 0.035, 3) * 30, h2 = 6 + R.fbm(x * 0.06, 7) * 18;
    for (let y = Math.floor(horizon - h1); y < horizon + 2; y++) R.px(x, y, 0.42 + (y - horizon + h1) * 0.004);
    R.depth(0.6);
    for (let y = Math.floor(horizon + 2 - h2); y < horizon + 4; y++) R.px(x, y, 0.28);
    R.depth(0.85);
  }
  R.depth(0);
  // svetlo na zemi pod nepriateľom
  R.glow(EX, EY - 10, 70, 0.25);
  R.mulEllipse(EX + 2, EY, 34 + combat.knock * 4, 6, 0.4);
  R.mulEllipse(HX + 20, HY, 22, 4, 0.45);
  // nepriateľ
  R.sym(combat.boss ? Z.TIMES : Z.EQ);
  const kx = combat.knock * 10 - (combat.attack ? Math.sin(Math.min(1, combat.attack.t / 0.45) * Math.PI) * 24 : 0);
  if (combat.boss) {
    R.sprite(BOSS, EX - 40 + kx, EY - 78 + Math.sin(gTime * 1.6) * 2, { scale: 2, dissolve: combat.dis, flash: combat.flash });
    if (combat.dis < 0.5) for (const ex of [15, 26]) R.orb(EX - 40 + kx + ex * 2 + 2, EY - 78 + 21 * 2 + Math.sin(gTime * 1.6) * 2, 3.5, A.RED, 0.6);
  } else {
    const sq = 1 + Math.sin(gTime * 5) * 0.08 - combat.knock * 0.2;
    R.sprite(SLIME, EX - 24 + kx, EY - 36, { scale: 3, dissolve: combat.dis, flash: combat.flash, squash: sq });
  }
  // útok nepriateľa: sivá guľa letí k čarodejníkovi
  if (combat.attack && combat.attack.t < 0.45) {
    const k = combat.attack.t / 0.45;
    R.orb(EX - 20 + (HX + 10 - EX + 20) * k, EY - 30 - Math.sin(k * Math.PI) * 20, 4, A.PAPER, 0.9);
  }
  // čarodejník
  if (!(combat.blink > 0 && ((gTime * 14) | 0) % 2)) drawHero(HX + 18, HY, { big: true, dir: 2, frame: 0, orb: combat.cast ? 1.6 : 1, bob: Math.round(Math.sin(gTime * 2.5)) });
  drawSpell();
  if (combat.wave) {
    const w = combat.wave, k = w.t / 0.6;
    R.sym(Z.PLUS);
    R.ring(w.x, w.y, 6 + k * 46 * w.big, 3, w.acc, 1 - k, 0.55);
    R.ring(w.x, w.y, 2 + k * 26 * w.big, 2, w.acc, (1 - k) * 0.7, 0.55);
  }
  drawParticles();
  // tráva v popredí – rozmazaná
  R.depth(1); R.sym(Z.GRASS);
  for (let x = 0; x < W; x += 3) {
    const h = 4 + R.hash(x, 5, 1) * 10 + Math.sin(gTime * 1.5 + x * 0.1) * 1.5;
    for (let y = 0; y < h; y++) R.px(x + (y / h) * Math.sin(gTime + x) * 2, H - 1 - y, 0.3);
  }
  R.depth(0);
}

// Farebné zhluky ako na referencii: drobné kvapky, hustejšie kde je šum vyšší; plus tmavé sivé čiarky.
function specks(x, y, f, from, acc) {
  const dens = Math.min(1, Math.max(0, (f - from) / 0.2));
  const sx = x + gTime * 5, cx = Math.floor(sx / 3), cy = Math.floor(y / 3), lx = sx - cx * 3, ly = y - cy * 3;
  if (dens > 0 && R.hash(cx, cy, 11) < dens * 0.85 && !(lx >= 2 && ly >= 2) && R.hash(cx, cy, 12) > 0.15) {
    R.B[y * W + x] = lx < 1 && ly < 1 ? 0.9 : (lx >= 1 && ly >= 1 ? 0.42 : 0.68);
    return acc;
  }
  const gx = Math.floor((x - gTime * 3) / 2), gy = Math.floor(y / 5);
  if (R.hash(gx, gy, 13) > 0.985 && (gx + gy) % 2) R.B[y * W + x] = 0.28;
  return 0;
}

// ---------- cutscény (kúzlo, číslo, boss) ----------
function startCut(kind, ch, ox, oy) {
  mode = 'cut'; hero.path = []; hero.out = null; $('goal').classList.add('hidden');
  const acc = kind === 'spell' ? A.GREEN : kind === 'boss' ? A.ICE : A.YELLOW;
  const shape = kind === 'spell' ? 1 : kind === 'boss' ? 2 : 0;
  cut = { kind, ch, acc, shape, t: 0, solid: false };
  const pts = R.glyphPoints(ch, 160, 62, 11, 3);
  pts.forEach(([x, y], k) => {
    const i = spawn(ox, oy, (rng() - 0.5) * 180, (rng() - 0.5) * 180 - 40, 99, acc, shape, 0);
    P.seek[i] = 1; P.tx[i] = x; P.ty[i] = y; P.g[i] = 0.25 + (k % 7) * 0.05;
  });
  later(1.5, () => { if (!cut) return; cut.solid = true; cut.st = 0; clearSeek(); burst(160, 62, { acc, shape }, 80, 130); sfx.merge(); showCutPanel(); });
}
function showCutPanel() {
  const c = cut;
  const close = () => { cut = null; clearSeek(); mode = 'world'; hud(); save(); world.grace = 0.8; };
  if (c.kind === 'spell') panel(`<div class="kicker">Nové kúzlo</div><h2 class="spellname">${pix('+', 'g')} PLUS</h2><p>Spája čísla dokopy. Koľko spolu, toľko zásahov.</p>
    <div class="demo">${dots(1, 'g')}${pix('+')}${dots(1, 'g')}${pix('=')}${dots(2, 'g')}</div>`, [{ label: 'Super!', fn: close }], 'bottom');
  else if (c.kind === 'number') panel(`<div class="kicker">Nové číslo</div><h2>${pix(c.ch, 'big')}</h2><p>Odteraz ho môžeš používať v kúzlach.</p>
    <div class="demo">${pix(c.ch)}${pix('=')}${dots(+c.ch)}</div>`, [{ label: 'Super!', fn: close }], 'bottom');
  else panel(`<div class="kicker">Zóna 1 hotová</div><h2>Pňoko je porazený!</h2><p>Dal ti stránku ľadového kúzla MÍNUS (1 z 3).<br>Ďalšie stránky čakajú v Zóne 2.</p>`, [{ label: 'Hrať ďalej', fn: close }], 'bottom');
}
function drawCut(dt) {
  R.clusterField(gTime, 0.1, 0.12);
  cut.t += dt;
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
    const f = R.fieldAt(x, y);
    R.B[i] = 0.1 + f * 0.18;
    const c = cut.solid ? 0 : specks(x, y, f, 0.8, cut.acc);
    R.C[i] = c; R.D[i] = c ? 0.3 + R.field2At(x, y) * 0.7 : 0.6; R.SY[i] = c ? Z.PLUS : Z.DOT;
  }
  R.L.set(VIG);
  R.sym(Z.PLUS);
  if (cut.solid) {
    const k = Math.min(1, cut.t * 0.6);
    R.orb(160, 62, 38, cut.acc, 0.32);
    R.ring(160, 62, 30 + (gTime * 20) % 30, 2, cut.acc, 1 - ((gTime * 20) % 30) / 30);
    R.glow(160, 62, 90, 0.6 * k);
    R.glyph(cut.ch, 160 - 16.5, 62 - 27.5, 11, 0, cut.acc, 0.66);
  }
  drawParticles();
  drawMotes(dt, cut.acc);
}

// ---------- panely: obchod, liana, správy ----------
function panel(html, buttons = [], pos = 'center') {
  const p = $('panel');
  p.dataset.pos = pos;
  p.innerHTML = `<div class="card">${html}<div class="row btns"></div></div>`;
  const row = p.querySelector('.btns');
  buttons.forEach((b, i) => {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.cls || '');
    el.textContent = b.label;
    if (i === 0) el.dataset.primary = '1';
    el.onclick = () => { tone(880, 0.06, 'triangle', 0.03); if (!b.keep) closePanel(); b.fn && b.fn(); };
    row.appendChild(el);
  });
  p.classList.remove('hidden');
  if (mode === 'world') mode = 'panel';
  return p;
}
function closePanel() { $('panel').classList.add('hidden'); if (mode === 'panel') mode = 'world'; }

const SHOP = [
  { name: 'Srdiečko navyše', icon: 'heart', price: 8, can: () => S.maxHearts < 5, buy: () => { S.maxHearts++; S.hearts = S.maxHearts; } },
  { name: 'Červený kryštál', icon: 'hat-r', price: 5, can: () => S.hat !== A.RED, buy: () => { S.hat = A.RED; } },
  { name: 'Modrý kryštál', icon: 'hat-b', price: 5, can: () => S.hat !== A.ICE, buy: () => { S.hat = A.ICE; } },
];
function openShop() {
  const items = SHOP.map((it, i) => `<div class="shopitem"><span class="ico ${it.icon}"></span><span class="nm">${it.name}</span><button class="btn small" data-i="${i}" ${S.coins < it.price || !it.can() ? 'disabled' : ''}><span class="coin"></span>${pix(it.price)}</button></div>`).join('');
  const p = panel(`<div class="kicker">Stánok čarodejníka</div><h2>Čo si vezmeš?</h2><p>Máš <b>${S.coins}</b> mincí. Mince sú z bojov a truhlíc.</p><div class="shop">${items}</div>`, [{ label: 'Odísť', cls: 'ghost' }]);
  p.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    const it = SHOP[+b.dataset.i];
    S.coins -= it.price; it.buy(); sfx.coin(); hud(); save();
    openShop();
  });
}

function openLock() {
  if (!S.ops.includes('+')) { panel(`<div class="kicker">Suchá liana</div><h2>Ešte nie</h2><p>Liana čaká na kúzlo PLUS.</p>`, [{ label: 'Dobre' }]); return; }
  const sel = [];
  const render = msg => {
    const slot = i => `<span class="slot ${sel[i] !== undefined ? 'on' : ''}">${sel[i] !== undefined ? pix(sel[i]) : ''}</span>`;
    const p = panel(`<div class="kicker">Suchá liana</div><h2>Liana potrebuje 3</h2><p>${msg || 'Vyber dve čísla, ktoré dajú spolu 3.'}</p>
      <div class="demo">${slot(0)}${pix('+')}${slot(1)}${pix('=')}<span class="slot goal">${pix(3)}</span></div>
      <div class="row">${S.numbers.map(n => `<button class="btn num" data-n="${n}">${pix(n)}</button>`).join('')}</div>`, [{ label: 'Neskôr', cls: 'ghost' }]);
    p.querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
      if (sel.length >= 2) return;
      sel.push(+b.dataset.n); sfx.orb(sel.length);
      if (sel.length < 2) return render(msg);
      const sum = sel[0] + sel[1];
      if (sum === 3) {
        render('Áno! ' + sel[0] + ' + ' + sel[1] + ' = 3');
        later(0.6, () => { closePanel(); growBridge(); });
      } else {
        sfx.bad();
        const hint = Math.max(...S.numbers) < 2 ? ' Asi ti chýba nejaké číslo. Hľadaj v kríkoch na lúke.' : '';
        render(`${sel[0]} + ${sel[1]} = ${sum}. Treba 3.${hint}`);
        later(1.6, () => { if (mode === 'panel') { sel.length = 0; render(); } });
      }
    });
  };
  render();
}
function growBridge() {
  S.bridge = true; bridgeGrow = 0; buildBg(); sfx.unlock(); save();
  for (let k = 0; k < 80; k++) spawn(9 * T + rng() * 32, OY + 4 * T + rng() * 32, (rng() - 0.5) * 60, -rng() * 50, 1.4, A.GREEN, 1, 40, rng() < 0.2 ? 0.6 : 0);
  hud(); toast('Most z liany je hotový!');
}

// ---------- HUD ----------
function goalText() {
  if (!S.ops.length) return STRINGS.goalBook;
  if (!S.numbers.includes(2)) return STRINGS.goalTwo;
  if (!S.bridge) return STRINGS.goalBridge;
  if (!S.numbers.includes(3)) return STRINGS.goalThree;
  if (!S.boss) return STRINGS.goalBoss;
  return STRINGS.goalDone;
}
function hud(lost = false) {
  $('hearts').innerHTML = Array.from({ length: S.maxHearts }, (_, i) => `<i class="heart ${i < S.hearts ? '' : 'off'} ${lost && i === S.hearts ? 'pop' : ''}"></i>`).join('');
  $('coins').innerHTML = pix(S.coins);
  $('runes').innerHTML = [1, 2, 3].map(n => `<b class="${S.numbers.includes(n) ? 'on' : ''}">${S.numbers.includes(n) ? pix(n) : ''}</b>`).join('');
  $('spells').innerHTML = [['+', 'g'], ['−', 'i'], ['×', 'o'], ['÷', 'y']].map(([s, c], i) => `<b class="sp ${c} ${i === 0 && S.ops.length ? 'on' : ''}">${pix(s)}</b>`).join('');
  const g = $('goal');
  g.textContent = goalText();
  g.classList.toggle('hidden', mode === 'combat' || mode === 'title' || mode === 'cut');
}
let toastT = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1900);
}
const ACC_CSS = { [A.GREEN]: 'var(--green)', [A.RED]: 'var(--red)', [A.ICE]: 'var(--ice)', [A.YELLOW]: 'var(--gold)' };
function floatText(txt, lx, ly, acc) {
  const d = document.createElement('div');
  d.className = 'float'; d.innerHTML = pix(txt);
  d.style.left = (lx * scale) + 'px'; d.style.top = (ly * scale) + 'px';
  d.style.color = ACC_CSS[acc] || 'var(--paper)';
  stage.appendChild(d); setTimeout(() => d.remove(), 1100);
}

// ---------- prechody (rozpad do plusov od stredu) ----------
let transC = [0.5, 0.5];
function transition(cb) {
  if (trans) return;
  transC = mode === 'world' || mode === 'panel' ? [hero.x / W, (hero.y - 8) / H] : [0.5, 0.55];
  trans = { t: 0, dur: 0.32, phase: 'out', cb };
}
function fadeVal() { if (!trans) return 0; const k = Math.min(1, trans.t / trans.dur); return trans.phase === 'out' ? k : 1 - k; }

// ---------- úvodná obrazovka: referenčný efekt (sivá + červené zhluky v hĺbke) ----------
function drawTitle(dt) {
  R.clusterField(gTime, 0.08, 0.1);
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
    const f = R.fieldAt(x, y);
    R.B[i] = 0.8 + (f - 0.5) * 0.8;
    const c = specks(x, y, f, 0.5, A.RED);
    R.C[i] = c; R.D[i] = c ? R.field2At(x, y) * 0.95 : 0.35 + R.field2At(x, y) * 0.5; R.SY[i] = Z.PLUS;
  }
  R.L.set(VIG);
  R.depth(0);
  R.mulEllipse(162, 176, 34, 5, 0.5);
  const k = drawHero(160, 176, { big: true, scale: 2, dir: 0, frame: 0, bob: Math.round(Math.sin(gTime * 2)) * 2, noLight: true, magic: true });
  R.glow(k.kx, k.ky, 46, 0.35);
  drawParticles();
  drawMotes(dt, A.RED);
  if (rng() < 0.2) spawn(k.kx, k.ky, (rng() - 0.5) * 30, -10 - rng() * 20, 1.4, A.GREEN, 1, -4);
}

// ---------- slučka ----------
let frameDt = 0;
function update(dt) {
  gTime += dt; frameDt += dt;
  for (let i = timers.length - 1; i >= 0; i--) if ((timers[i].t -= dt) <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  if (trans) { trans.t += dt; if (trans.t >= trans.dur) { if (trans.phase === 'out') { trans.cb(); trans.phase = 'in'; trans.t = 0; } else trans = null; } }
  updParticles(dt);
  if (bridgeGrow < 1) bridgeGrow = Math.min(1, bridgeGrow + dt * 0.9);
  if (mode === 'world' && !trans) updateWorld(dt);
  if (mode === 'combat' && combat) updateCombat(dt);
}
function render() {
  const dt = Math.min(0.1, frameDt); frameDt = 0;
  if (AC) music(mode === 'title' ? 'uvod' : mode === 'combat' && combat ? (combat.boss ? 'boss' : 'suboj') : 'svet');
  let focus = -1, blur = 10, bloom = 1;
  R.depth(0); R.sym(Z.PLUS);
  if (mode === 'title') { drawTitle(dt); blur = 13; bloom = 1.1; }
  else if (mode === 'combat' && combat) { drawCombat(dt); blur = 11; bloom = 1.2; }
  else if (mode === 'cut' && cut) { drawCut(dt); blur = 9; bloom = 1.4; }
  else if (world) { drawWorld(dt); focus = hero.y - 8; blur = 8; }
  R.pack(packed, focus);
  if (glr) glr.draw(packed, { fade: fadeVal(), fx: transC[0], fy: transC[1], time: gTime, blur, bloom });
  else { R.compose2d(img2d, packed, fadeVal()); ctx2d.putImageData(img2d, 0, 0); }
}
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= 1 / 60) { update(1 / 60); acc -= 1 / 60; }
  render();
  requestAnimationFrame(frame);
}

// ---------- vstup a rozloženie ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  let s = Math.min(w / W, h / H);
  if (s >= 2 && !glr) s = Math.floor(s);
  scale = s;
  Object.assign(stage.style, { width: W * s + 'px', height: H * s + 'px', left: (w - W * s) / 2 + 'px', top: (h - H * s) / 2 + 'px' });
  document.documentElement.style.setProperty('--u', s + 'px');
  if (glr) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.min(2560, Math.round(W * s * dpr)); cv.height = Math.round(cv.width * H / W);
    glr.resize(cv.width);
  }
  $('rotate').classList.toggle('hidden', !(h > w * 1.1 && w < 900));
}
addEventListener('resize', resize);
cv.addEventListener('pointerdown', e => {
  if (mode !== 'world') return;
  const r = cv.getBoundingClientRect();
  tapWorld((e.clientX - r.left) / scale, (e.clientY - r.top) / scale);
});
addEventListener('keydown', e => {
  keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true;
  if (mode === 'combat') {
    const k = /^\d$/.test(e.key) ? e.key : e.key === 'Backspace' ? '←' : e.key === 'Enter' ? '✔' : null;
    if (k) { press(k); const b = [...$('pad').children].find(x => x.dataset.k === k); if (b) { b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 120); } }
  } else if ((e.key === 'Enter' || e.key === ' ') && !$('panel').classList.contains('hidden')) {
    const b = $('panel').querySelector('[data-primary]'); if (b) { e.preventDefault(); b.click(); }
  }
});
addEventListener('keyup', e => { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });

['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '✔'].forEach(k => {
  const b = document.createElement('button');
  b.dataset.k = k;
  b.innerHTML = pix(k);
  if (k === '✔') b.className = 'ok';
  if (k === '←') b.className = 'del';
  b.addEventListener('pointerdown', e => { e.preventDefault(); press(k); });
  $('pad').appendChild(b);
});

function startGame(fresh) {
  const saved = load();
  S = !fresh && saved ? saved : newState();
  $('title').classList.add('hidden');
  transition(() => {
    mode = 'world';
    $('hud').classList.remove('hidden');
    enterScreen(S.screen); hero.x = S.x; hero.y = S.y; hero.path = [];
    if (!S.intro) {
      S.intro = true;
      panel(`<div class="kicker">Mathemagic</div><h2>Ahoj, malý čarodejník!</h2><p>Ťukni kamkoľvek a postavička tam dôjde.<br>V dedinke na podstavci svieti kúzelná kniha.</p>`, [{ label: 'Poďme!' }]);
    }
    hud();
  });
}
$('play').onclick = () => { tone(440, 0.01, 'sine', 0.001); loadAudio(); startGame(false); };
$('mute').onclick = e => { e.stopPropagation(); audioCtx(); loadAudio(); toggleSound(); };
$('mute').classList.toggle('off', !musicOn);
addEventListener('pointerdown', () => { if (!AC) { audioCtx(); loadAudio(); } }, { once: true });
$('restart').onclick = () => {
  const b = $('restart');
  if (b.dataset.sure) { try { localStorage.removeItem(SAVE); } catch (e) { /* nič */ } startGame(true); return; }
  b.dataset.sure = '1'; b.textContent = 'Naozaj? Zmaže sa postup';
  setTimeout(() => { delete b.dataset.sure; b.textContent = 'Nová hra'; }, 3000);
};
if (load()) { $('play').textContent = 'Pokračovať'; $('restart').classList.remove('hidden'); }

// testovací háčik (konzola): __mm.step(sekundy), __mm.tap(x, y), __mm.press('5')
window.__mm = { get S() { return S; }, get mode() { return mode; }, get combat() { return combat; }, hero, tap: tapWorld, press, step: s => { for (let k = 0; k < s * 60; k++) update(1 / 60); render(); }, gl: !!glr };

resize();
requestAnimationFrame(frame);
