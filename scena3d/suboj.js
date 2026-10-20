// Súboj na mieste: banda sa zdvihne od ohňa a ide naraz, každý bojovník má nad hlavou vlastný príklad.
// Napíšeš výsledok → kúzlo vyletí z kryštálu palice do toho, komu patrí. Karty z Knihy kúziel pridávajú efekty.
import { THREE, scene, spark, burst, pix } from './svet.js';
import { hero, crystal, crystalLight, heroPlay, makeFighter } from './postavy.js';
import { makeProblem, lvl } from './karty.js';

let G = null;
export function initFight(g) { G = g; }
export const fight = { on: false, enemies: [], bolts: [], streak: 0, input: '', shield: 0, aim: null, boss: null, slow: 1 };
const spells = [], chains = [];
const targets = () => [...fight.enemies.filter(e => e.state !== 'dead'), ...fight.bolts];
export { targets };

// výsledky na scéne sa nesmú biť (ani 1 a 10 naraz), aby kúzlo vždy vedelo, kam letieť
const clash = (a, b) => { const x = String(a), y = String(b); return x.startsWith(y) || y.startsWith(x); };
function fresh(kind, self) {
  let p;
  for (let k = 0; k < 80; k++) { p = makeProblem(G.run, kind); if (!targets().some(t => t !== self && t.p && clash(t.p.answer, p.answer))) break; }
  p.born = G.now; return p;
}

// ---------- štítky nad hlavami ----------
function makeTag(t, name) {
  const el = document.createElement('div'); el.className = 'tag';
  el.innerHTML = `${name ? `<div class="nm">${name}<span class="hp"></span></div>` : ''}<div class="pr"></div>`;
  G.tagsEl.appendChild(el); t.el = el;
}
function renderTag(t) {
  t.w = 0;
  t.el.querySelector('.pr').innerHTML = pix(t.p.text);
  t.el.classList.toggle('minus', t.p.op === '-');
  t.el.classList.toggle('shield', !!t.shield);
  const hp = t.el.querySelector('.hp'); if (hp) hp.innerHTML = (t.shield ? '<b class="sh"></b>' : '') + '<i></i>'.repeat(Math.max(0, t.hp));
}
const targetPos = t => t.bolt ? t.mesh.position.clone() : t.g.position.clone().add(new THREE.Vector3(0, t.h * 0.55, 0));
// štítky sa nesmú prekrývať: ten vyššie na obrazovke sa posunie ešte vyššie
export function drawTags(camera) {
  const placed = [];
  const list = targets().map(t => {
    const v = (t.bolt ? t.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)) : t.g.position.clone().add(new THREE.Vector3(0, t.h + 0.35, 0))).project(camera);
    if (!t.w) { t.w = t.el.offsetWidth; t.hh = t.el.offsetHeight + 14; }
    return { t, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }).sort((a, b) => b.y - a.y);
  for (const a of list) {
    for (let k = 0; k < 6; k++) {
      const hit = placed.find(b => Math.abs(a.x - b.x) < (a.t.w + b.t.w) / 2 + 4 && a.y > b.y - b.t.hh && a.y - a.t.hh < b.y);
      if (!hit) break;
      a.y = hit.y - hit.t.hh;
    }
    placed.push(a);
    a.t.el.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, -100%)`;
  }
}

// ---------- začiatok súboja ----------
// band = bojovníci sediaci pri ohni (z hra.js), opts.boss / opts.elite
export function startFight(band, opts = {}) {
  Object.assign(fight, { on: true, enemies: [], bolts: [], streak: 0, input: '', aim: null, boss: null, opts, summoned: 0 });
  fight.shield = lvl(G.run, 'stit');
  for (const f of band) addEnemy(f, opts.boss && f.size > 1.2, opts.elite && f === band[0]);
  G.renderStreak(); renderInput();
}
function addEnemy(f, isBoss, isElite) {
  const e = Object.assign(f, { state: f.sitting ? 'stand' : 'walk', t: 0, hp: f.d.hp, shield: !!f.d.shield, flash: 0, shoot: 2.5 + Math.random() * 2, knock: 0, frozen: 0, burn: 0 });
  e.name = f.d.name;
  if (isBoss) { e.hp = 6; e.shield = false; e.name = 'Vodca zbojníkov'; e.speed = 0.32; fight.boss = e; }
  if (isElite) { e.hp = 3; e.name = 'Kapitán'; }
  e.speed = e.speed || f.d.speed;
  if (e.state === 'stand') f.play('Sit_Floor_StandUp', 0.1); else f.play(f.d.walk);
  e.p = fresh(e.shield ? 'missing' : isBoss ? 'normal' : f.d.prob, e);
  makeTag(e, e.name); renderTag(e);
  fight.enemies.push(e);
  return e;
}
// vodca si privolá posily
function summon(n) {
  for (let k = 0; k < n; k++) {
    const f = makeFighter('rogue', 1, G.room);
    const b = fight.boss.g.position, a = Math.random() * 6.28;
    f.g.position.set(b.x + Math.cos(a) * 2.5, 0, b.z + Math.sin(a) * 2.5);
    addEnemy(f);
    burst(f.g.position.clone().add(new THREE.Vector3(0, 1, 0)), 60, 3, 0xd43a3a);
  }
  G.say('Vodca volá posily!');
}

// ---------- šípy strelca ----------
function shootBolt(e) {
  const mesh = new THREE.Group();
  mesh.add(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a3a })), new THREE.PointLight(0xff7a3a, 3, 4, 1.6));
  mesh.position.copy(e.g.position).add(new THREE.Vector3(0, 1.3, 0)); scene.add(mesh);
  const b = { bolt: true, mesh, from: mesh.position.clone(), t: 0, dur: 9 };
  b.p = fresh('easy', b); makeTag(b); b.el.classList.add('bolt'); renderTag(b);
  fight.bolts.push(b);
}
function removeBolt(b, hitHero) {
  const i = fight.bolts.indexOf(b); if (i >= 0) fight.bolts.splice(i, 1);
  scene.remove(b.mesh); b.el.remove();
  burst(b.mesh.position, hitHero ? 40 : 70, 3, hitHero ? 0xff7a3a : 0xffd25a, 0.7);
}

// ---------- písanie výsledku ----------
export function fightPress(k) {
  if (!fight.on || G.over) return;
  if (k === '←') { fight.input = fight.input.slice(0, -1); return renderInput(); }
  if (!/^[0-9]$/.test(k)) return;
  fight.input += k;
  const live = targets().filter(t => !t.locked), inp = fight.input;
  const exact = live.find(t => String(t.p.answer) === inp);
  const longer = live.some(t => String(t.p.answer).length > inp.length && String(t.p.answer).startsWith(inp));
  if (exact && !longer) {
    const ms = G.now - exact.p.born, fast = ms < 3.5 + (exact.p.text.length > 4 ? 2 : 0);
    fight.streak++; G.stats.ok++;
    cast(exact, { fast, ms });
    fight.input = ''; renderInput();
    if (fight.streak >= 5) { fight.streak = 0; setTimeout(chainLightning, 450); }
    G.renderStreak();
    return;
  }
  if (!longer) { // taký výsledok tu nikto nemá
    fight.streak = 0; G.renderStreak(); G.stats.bad++;
    G.inpEl.classList.remove('bad'); void G.inpEl.offsetWidth; G.inpEl.classList.add('bad');
    fight.input = ''; renderInput(k); return;
  }
  renderInput();
}
export function renderInput(wrong) {
  G.inpEl.innerHTML = wrong ? pix(wrong) : fight.input ? pix(fight.input) : '<span class="ph">napíš výsledok</span>';
  for (const t of targets()) t.el.classList.toggle('match', !!fight.input && String(t.p.answer).startsWith(fight.input) && !t.locked);
}

// ---------- kúzla (letia z kryštálu palice) ----------
const COL = { '+': 0x8dff98, '-': 0x7fc8ff };
function cast(t, info) {
  t.locked = true; t.el.classList.add('locked');
  const color = info.color || COL[t.p.op] || COL['+'];
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45) }));
  const light = new THREE.PointLight(color, 0, 9, 1.4); orb.add(light); orb.visible = false; scene.add(orb);
  spells.push({ t: info.delay ? -info.delay : 0, target: t, color, info, orb, light, from: new THREE.Vector3() });
  if (!info.extra) { heroPlay('Spellcast_Shoot', 0.08, 0.9); fight.aim = t; }
  // Ozvena: veľký výsledok vystrelí aj druhé kúzlo na iného
  const oz = lvl(G.run, 'ozvena');
  if (oz && !info.extra && t.p.answer >= (oz > 1 ? 4 : 6)) {
    const other = targets().find(x => x !== t && !x.locked);
    if (other) cast(other, { extra: true, delay: 0.25, color: 0xc9a0ff });
  }
  // Zlatá ruka
  const zl = lvl(G.run, 'zlato');
  if (zl && info.fast && !info.extra) G.addCoins(zl, t);
}
function updateSpells(dt) {
  for (let i = spells.length - 1; i >= 0; i--) {
    const s = spells[i]; s.t += dt;
    if (s.t < 0) continue;
    const cw = crystal.getWorldPosition(new THREE.Vector3());
    if (s.t < 0.22) { // nabitie na kryštáli
      const k = s.t / 0.22;
      crystal.scale.set(1 + k, (1 + k) * 1.6, 1 + k); crystalLight.color.set(s.color); crystalLight.intensity = 3 + k * 14;
      for (let n = 0; n < 4; n++) { const a = Math.random() * 6.28, r = 0.9; spark(new THREE.Vector3(cw.x + Math.cos(a) * r, cw.y + (Math.random() - 0.5) * 0.8, cw.z + Math.sin(a) * r), -Math.cos(a) * 3.5, 0, -Math.sin(a) * 3.5, 0.25, s.color); }
      s.from.copy(cw);
    } else if (s.t < 0.56) { // let
      const k = (s.t - 0.22) / 0.34, e = k * k * (3 - 2 * k), to = targetPos(s.target);
      s.orb.visible = true; s.light.intensity = 14;
      s.orb.position.lerpVectors(s.from, to, e); s.orb.position.y += Math.sin(e * Math.PI) * 1.2;
      s.orb.scale.setScalar((s.info.fast ? 1.5 : 1) * (1 + Math.sin(s.t * 40) * 0.15));
      crystal.scale.set(1, 1.6, 1);
      for (let n = 0; n < (s.info.fast ? 8 : 5); n++) spark(s.orb.position, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 0.5, s.color);
    } else if (!s.hit) {
      s.hit = true; s.flash = 1;
      const p = targetPos(s.target);
      burst(p, s.info.fast ? 200 : 110, s.info.fast ? 6 : 4, s.color); burst(p, 30, 2, 0xffffff, 0.5);
      if (s.info.fast) G.shake(0.35);
      hitTarget(s.target, s.info);
    } else {
      s.flash -= dt * 3;
      s.orb.scale.setScalar(Math.max(0.001, s.flash * (s.info.fast ? 4 : 2.6))); s.light.intensity = Math.max(0, s.flash) * 30;
      if (s.flash <= 0) { scene.remove(s.orb); spells.splice(i, 1); }
    }
  }
}
function hitTarget(t, info = {}) {
  if (t.bolt) { if (fight.bolts.includes(t)) removeBolt(t); return; }
  const e = t; e.locked = false; e.el.classList.remove('locked'); e.flash = 1;
  if (e.state === 'dead') return;
  if (info.fast && !info.extra) G.floatText('Rýchlo!', e);
  // Mráz: rýchla odpoveď zmrazí cieľ
  const mr = lvl(G.run, 'mraz');
  if (mr && !info.extra && info.ms !== undefined && info.ms < (mr > 1 ? 3 : 2)) { e.frozen = mr > 1 ? 5 : 3; G.floatText('Zmrznutý!', e); burst(targetPos(e), 60, 3, 0x9fd8ff); }
  // Oheň: zásah podpáli
  if (lvl(G.run, 'ohen')) e.burn = 4;
  if (e.shield) { // štít padol, rytier ostáva
    e.shield = false; e.p = fresh('normal', e); renderTag(e);
    e.state = 'hit'; e.t = 0; e.play('Block_Hit', 0.05, true); e.knock = info.fast ? 1.6 : 0.8;
    G.floatText('Štít rozbitý!', e); afterHit(info); return;
  }
  e.hp--;
  if (e === fight.boss && (e.hp === 4 || e.hp === 2) && fight.summoned < (e.hp === 4 ? 1 : 2)) { fight.summoned++; setTimeout(() => fight.on && summon(2), 600); }
  if (e.hp <= 0) {
    e.state = 'dead'; e.t = 0; e.play('Death_A', 0.05); e.el.remove();
    e.knock = info.fast ? 1.4 : 0.6;
    afterHit(info); checkEnd(); return;
  }
  e.p = fresh(e === fight.boss ? (e.hp % 2 ? 'three' : 'normal') : e.kind === 'barbarian' ? 'three' : 'normal', e); renderTag(e);
  e.state = 'hit'; e.t = 0; e.play('Hit_A', 0.05, true); e.knock = info.fast ? 2 : 1; e.charging = false;
  afterHit(info);
}
// Reťaz: každá 3. (2.) správna v rade preskočí bleskom na ďalšieho
function afterHit(info) {
  const rz = lvl(G.run, 'retaz');
  if (!rz || info.extra || info.chain) return;
  if (fight.streak > 0 && fight.streak % (rz > 1 ? 2 : 3) === 0) {
    const next = targets().find(x => !x.locked);
    if (next) { zap(crystal.getWorldPosition(new THREE.Vector3()), targetPos(next)); hitTarget(next, { extra: true, chain: true }); }
  }
}
function zap(from, to) {
  const group = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0xfff27a }), pts = [from.clone()];
  for (let k = 1; k < 7; k++) pts.push(from.clone().lerp(to, k / 7).add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7)));
  pts.push(to.clone());
  for (let k = 0; k < pts.length - 1; k++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, pts[k].distanceTo(pts[k + 1])), mat);
    seg.position.copy(pts[k]).lerp(pts[k + 1], 0.5); seg.lookAt(pts[k + 1]); group.add(seg);
  }
  const light = new THREE.PointLight(0xfff27a, 20, 8, 1.4); light.position.copy(to); group.add(light);
  scene.add(group); chains.push({ group, life: 0.45 });
  burst(to, 90, 5, 0xfff27a);
}
// Veľké kúzlo: 5 správnych za sebou → blesk na všetkých
function chainLightning() {
  if (!fight.on) return;
  G.say('Reťazový blesk!'); G.shake(0.6);
  heroPlay('Spellcast_Shoot', 0.05, 1.1);
  let prev = crystal.getWorldPosition(new THREE.Vector3());
  for (const t of targets().filter(t => !t.locked)) { const to = targetPos(t); zap(prev, to); hitTarget(t, { fast: true, extra: true }); prev = to; }
  G.renderStreak();
}

// ---------- úder do čarodejníka ----------
function hurtHero() {
  if (G.over) return;
  if (fight.shield > 0) { fight.shield--; G.say('Štít ťa ochránil!'); burst(hero.position.clone().add(new THREE.Vector3(0, 1.1, 0)), 70, 3, 0xcfd2da, 0.6); return; }
  fight.streak = 0; G.renderStreak();
  heroPlay('Hit_A', 0.05, 0.7);
  burst(hero.position.clone().add(new THREE.Vector3(0, 1, 0)), 50, 3, 0xd43a3a, 0.6);
  G.hurt();
}
function checkEnd() {
  if (fight.enemies.some(e => e.state !== 'dead')) return;
  for (const b of [...fight.bolts]) removeBolt(b);
  fight.on = false;
  G.onWin(fight.opts);
}
export function endFight() { // pri prehre / odchode
  for (const t of targets()) t.el && t.el.remove();
  for (const b of [...fight.bolts]) removeBolt(b);
  fight.on = false; fight.enemies = []; fight.aim = null;
}

// ---------- slučka súboja ----------
const toHero = new THREE.Vector3();
export function updateFight(dt) {
  const danger = fight.on && !G.over && (fight.enemies.some(e => (e.state === 'walk' || e.state === 'charge') && !e.frozen && e.g.position.distanceTo(hero.position) < 2.6) || fight.bolts.some(b => b.mesh.position.distanceTo(hero.position) < 2.4));
  fight.slow += ((danger ? 0.4 : 1) - fight.slow) * (1 - Math.exp(-dt * 6));
  G.danger = danger;
  const edt = dt * fight.slow, slowCard = 1 - [0, 0.2, 0.35][lvl(G.run, 'cas')];
  for (const e of fight.enemies) {
    const pos = e.g.position; e.t += edt;
    toHero.subVectors(hero.position, pos).setY(0);
    const dist = toHero.length(); toHero.normalize();
    if (e.state !== 'dead') e.g.rotation.y = Math.atan2(toHero.x, toHero.z);
    if (e.knock > 0) { const k = Math.min(e.knock, edt * 6); pos.addScaledVector(toHero, -k); e.knock -= k; }
    e.frozen = Math.max(0, e.frozen - edt); e.burn = Math.max(0, e.burn - edt);
    const sp = e.speed * slowCard * (e.burn > 0 ? 1 - (lvl(G.run, 'ohen') > 1 ? 0.6 : 0.4) : 1);
    if (e.burn > 0 && Math.random() < 0.4) spark(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * e.h * 0.8, (Math.random() - 0.5) * 0.6)), 0, 1.4, 0, 0.5, 0xff8a3a);
    if (e.frozen > 0 && e.state !== 'dead') { e.mixer.update(0); for (const m of e.mats) if (m.emissive) m.emissive.setRGB(0.15, 0.35, 0.6); if (Math.random() < 0.2) spark(targetPos(e), (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0.6, 0x9fd8ff); continue; }
    if (e.state === 'stand') { if (e.t > 1.0) { e.state = 'walk'; e.play(e.d.walk); } }
    else if (e.state === 'walk' || e.state === 'charge') {
      if (e.d.charge && dist < 3.6 && e.state === 'walk') { e.state = 'charge'; e.play('Running_A'); G.floatText('Útok!', e); }
      if (e.d.ranged && dist < 7.6) { e.state = 'aim'; e.t = 0; e.play('2H_Ranged_Aiming'); }
      else if (dist > 1.15 + (e.size - 1)) {
        pos.addScaledVector(toHero, sp * (e.state === 'charge' ? 2.6 : 1) * edt);
        for (const o of fight.enemies) if (o !== e && o.state !== 'dead') { const dx = pos.x - o.g.position.x, dz = pos.z - o.g.position.z, dd = Math.hypot(dx, dz); if (dd < 1.1 && dd > 0.001) { pos.x += dx / dd * (1.1 - dd) * 0.5; pos.z += dz / dd * (1.1 - dd) * 0.5; } }
      } else if (!G.over) { e.state = 'attack'; e.t = 0; e.play(e.d.attack, 0.08, true); }
    } else if (e.state === 'attack') {
      if (e.t > 0.45 && !e.struck) { e.struck = true; hurtHero(); }
      if (e.t > 1.1) { e.struck = false; e.state = 'back'; e.t = 0; e.play('Walking_Backwards'); }
    } else if (e.state === 'back') { // po údere ustúpi a ide znova
      pos.addScaledVector(toHero, -1.6 * edt);
      if (e.t > 1.6) { e.state = 'walk'; e.play(e.d.walk); }
    } else if (e.state === 'aim') {
      e.shoot -= edt;
      if (e.shoot <= 0 && !G.over) { e.shoot = 6.5; e.play(e.d.attack, 0.05, true); setTimeout(() => { if (e.state === 'aim' && fight.on) shootBolt(e); }, 300); }
      else if (e.cur === e.acts[e.d.attack] && !e.cur.isRunning()) e.play('2H_Ranged_Aiming');
    } else if (e.state === 'hit') {
      if (e.t > 0.6) { e.state = e.d.ranged && dist < 7.8 ? 'aim' : 'walk'; e.play(e.state === 'aim' ? '2H_Ranged_Aiming' : e.d.walk); }
    } else if (e.state === 'dead') {
      if (e.t > 1.4) pos.y -= edt * 0.8;
      if (e.t > 3.2) e.g.visible = false;
    }
    if (e.state !== 'dead' || e.t < 1.4) pos.y = G.height(pos.x, pos.z);
    e.flash = Math.max(0, e.flash - dt * 4);
    for (const m of e.mats) if (m.emissive) m.emissive.setScalar(e.flash * 0.9);
    e.mixer.update(edt);
  }
  for (const b of [...fight.bolts]) {
    b.t += edt;
    const to = hero.position.clone().add(new THREE.Vector3(0, 1.1, 0)), k = Math.min(1, b.t / b.dur);
    b.mesh.position.lerpVectors(b.from, to, k); b.mesh.lookAt(to);
    if (Math.random() < 0.6) spark(b.mesh.position, (Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4, 0.5, 0xff7a3a);
    if (k >= 1 && !b.locked) { removeBolt(b, true); hurtHero(); }
  }
  for (let i = chains.length - 1; i >= 0; i--) { const c = chains[i]; c.life -= dt; c.group.visible = Math.random() < 0.8; if (c.life <= 0) { scene.remove(c.group); chains.splice(i, 1); } }
  updateSpells(dt);
  if (!spells.length) { crystal.scale.set(1, 1.6, 1); crystalLight.color.set(0x7dff8a); crystalLight.intensity = 1.6 + fight.streak * 1.2 + Math.sin(G.now * 4) * 0.3; }
}
// kam sa má čarodejník pozerať (cieľ posledného kúzla)
export function aimPoint() { const a = fight.aim; return a && fight.on && (a.bolt ? fight.bolts.includes(a) : a.state !== 'dead') ? targetPos(a) : null; }
