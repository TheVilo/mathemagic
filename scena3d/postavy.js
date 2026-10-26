// Postavy: čarodejník (KayKit Mage) a bojovníci (KayKit Adventurers), všetko CC0.
// Bojovníci sú šedí ako čarodejník, len plášť majú červený – v ditheringu ostane ako farebný akcent.
import { THREE, scene, std, tone, loadGlb, U } from './svet.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

// ---------- čarodejník ----------
export const hero = new THREE.Group(); scene.add(hero);
export const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: 0x6fd27a })); crystal.scale.y = 1.6;
export const crystalLight = new THREE.PointLight(0x7dff8a, 1.6, 5, 1.6);
export const lamp = { base: 1.6, color: 0xc8923a };   // farba = živel kúzla (zem, voda, oheň, vzduch)   // sila svetla palice (v noci väčšia)
const crystalAnchor = new THREE.Object3D(); crystalAnchor.add(crystal); scene.add(crystalLight);   // svetlo nie je na palici – pri chôdzi by lietalo
const H = { mixer: null, acts: {}, cur: null, lock: 0 };
export async function loadHero() {
  const g = await loadGlb('modely/Mage.glb'), m = g.scene, box = new THREE.Box3().setFromObject(m);
  m.scale.setScalar(2.1 / (box.max.y - box.min.y));
  m.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (['Spellbook', 'Spellbook_open', '1H_Wand'].includes(o.name)) { o.visible = false; return; }
    o.material = tone(o.material.clone(), o.name === 'Mage_Cape' ? 0.45 : 1.08);
    if (o.name === 'Mage_Cape') { o.geometry.computeBoundingBox(); capeWind(o.material, o.geometry.boundingBox); }
    if (o.name === '2H_Staff') { // kryštál na špičke palice – odtiaľ letia kúzla
      o.scale.multiplyScalar(0.72);   // kratšia palica – inak pri chôdzi a zosielaní prechádza cez okraj klobúka
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox, tip = new THREE.Vector3();
      const ax = ['x', 'y', 'z'].reduce((a, k) => (b.max[k] - b.min[k] > b.max[a] - b.min[a] ? k : a), 'y');
      tip.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2); tip[ax] = b.max[ax];
      crystalAnchor.position.copy(tip); o.add(crystalAnchor);
      crystalAnchor.scale.setScalar(1 / o.getWorldScale(new THREE.Vector3()).x);
    }
  });
  hero.add(m); hero.traverse(o => o.layers.enable(1)); crystal.layers.enable(4);   // vrstva 1 = postava, 4 = kúzlo (kryštál)
  H.mixer = new THREE.AnimationMixer(m);
  g.animations.forEach(a => { H.acts[a.name] = H.mixer.clipAction(a); });
  for (const n of ['Spellcast_Shoot', 'Hit_A', 'Cheer', 'Death_A', 'PickUp', 'Interact']) { H.acts[n].setLoop(THREE.LoopOnce); H.acts[n].clampWhenFinished = true; }
  heroPlay('Idle');
}
// plášť: tmavý, veje vo vetre ako stromy a pri chôdzi viac (spodok sa hýbe, hore pri krku drží)
const capeU = { uTime: null, uSpd: { value: 0 } };
function capeWind(mat, b) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.uniforms.uSpd = capeU.uSpd; sh.uniforms.uTime = U.time; sh.uniforms.uCape = { value: new THREE.Vector2(b.min.y, b.max.y) };
    sh.vertexShader = 'uniform float uTime; uniform float uSpd; uniform vec2 uCape;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float f = clamp((uCape.y - position.y) / (uCape.y - uCape.x), 0.0, 1.0);
      float sw = sin(uTime * 1.3) * 0.5 + sin(uTime * 2.7) * 0.15;              // rovnaký vietor ako stromy
      transformed.x += sw * f * f * 0.03 + sin(uTime * 3.7 + position.y * 5.0) * f * 0.008;
      transformed.z -= f * f * (0.03 + uSpd * 0.09) + sin(uTime * (4.0 + uSpd * 1.2) + position.x * 6.0) * f * (0.012 + uSpd * 0.018);   // pri behu len jemne dozadu (Lukáš 26. 10.: menej lietať)
      transformed.y += f * f * uSpd * 0.015;`);
  };
  mat.customProgramCacheKey = () => key + 'cape';
}
// MIERENIE PALICOU (Majster): pravá ruka sa natočí k myši; čím ďalej je myš, tým viac je ruka vystretá
export const aim = { p: null, f: 0 };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _I = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
function aimArm(dt) {
  const ua = hero.getObjectByName('upperarmr'), la = hero.getObjectByName('lowerarmr'); if (!ua || !la) return;
  // ruka s palicou je VŽDY riadená kódom (animácie ňou nehýbu): drží palicu pred sebou, k myši sa vystrie viac
  const fwd = new THREE.Vector3(Math.sin(hero.rotation.y), 0, Math.cos(hero.rotation.y));
  const target = aim.p || hero.position.clone().addScaledVector(fwd, 4);
  const ext = Math.min(1, Math.max(0, (Math.hypot(target.x - hero.position.x, target.z - hero.position.z) - 1.2) / 5));   // myš blízko = palica nižšie, ďaleko = ruka vystretá
  aim.f += (ext - aim.f) * Math.min(1, dt * 8);
  const aimP = target;
  hero.updateMatrixWorld(true);
  ua.getWorldPosition(_a); la.getWorldPosition(_b);
  const d0 = _b.clone().sub(_a).normalize();
  const dT = new THREE.Vector3(aimP.x - _a.x, 0, aimP.z - _a.z).normalize(); dT.y = -0.7 + 0.45 * aim.f; dT.normalize();   // vodorovne k myši, mierne nadol
  _q.setFromUnitVectors(d0, dT); _q2.copy(_q);   // ruka úplne podľa kódu
  const wq = ua.getWorldQuaternion(new THREE.Quaternion()), pq = ua.parent.getWorldQuaternion(new THREE.Quaternion());
  ua.quaternion.copy(pq.invert().multiply(_q2.multiply(wq)));
  la.quaternion.slerp(_I, 0.85);   // lakeť takmer rovný – palica sa nekýve s animáciou
  const wr = hero.getObjectByName('wristr'); if (wr) wr.quaternion.slerp(_I, 0.7);
}
// lock = ako dlho sa animácia nesmie prerušiť chôdzou/státím
export function heroPlay(name, fade = 0.15, lock = 0) {
  const a = H.acts[name]; if (!a) return;
  if (H.cur === a && !lock) return;
  a.reset().fadeIn(fade).play(); if (H.cur && H.cur !== a) H.cur.fadeOut(fade);
  H.cur = a; H.lock = lock;
}
export function updateHero(dt, speed, frozen) {
  if (!H.mixer) return;
  capeU.uSpd.value += (speed - capeU.uSpd.value) * Math.min(1, dt * 4);   // plášť zaostáva za pohybom
  if (H.lock > 0) H.lock -= dt;
  else if (!frozen) heroPlay(speed > 0.3 ? 'Walking_A' : 'Idle', 0.2);   // beh (Running_A) vedie palicu cez klobúk → rýchlejšia chôdza
  if (H.cur === H.acts.Walking_A) H.cur.timeScale = Math.max(0.6, speed / 1.8); else if (H.cur) H.cur.timeScale = 1;
  // POKOJNEJŠIA PALICA: chôdza aj zosielanie sa miešajú 50 : 50 s pokojným postojom → ruky (a palica) sa hýbu o polovicu menej
  const idle = H.acts.Idle;
  if (idle && H.cur && H.cur !== idle && !/Death/.test(H.cur.getClip().name)) {
    if (!idle.isRunning()) idle.play();
    idle.enabled = true; idle.setEffectiveWeight(0.5); H.cur.setEffectiveWeight(0.5);
  } else if (H.cur === idle) idle.setEffectiveWeight(1);
  H.mixer.update(dt);
  aimArm(dt);
  // svetlo palice: z kryštálu POD klobúkom (kvôli kráse), jemne vyhladené, aby pri chôdzi necukalo
  hero.updateMatrixWorld(true); const cw = crystal.getWorldPosition(new THREE.Vector3());
  if (crystalLight.position.distanceTo(cw) > 3) crystalLight.position.copy(cw); else crystalLight.position.lerp(cw, Math.min(1, dt * 14));
}
export const heroLocked = () => H.lock > 0;

// ---------- bojovníci ----------
// h = výška, speed = krok za sekundu, hp = koľko príkladov vydrží, shield = najprv doplň chýbajúce, charge = zblízka sa rozbehne, ranged = strieľa šípy
export const KINDS = {
  rogue: { file: 'Rogue', name: 'Zbojník', keep: ['Knife', 'Knife_Offhand'], weapons: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'], h: 1.4, speed: 0.8, hp: 1, attack: 'Dualwield_Melee_Attack_Chop', walk: 'Running_B', prob: 'easy' },
  knight: { file: 'Knight', name: 'Rytier', keep: ['1H_Sword', 'Badge_Shield'], weapons: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', '2H_Sword'], h: 1.55, speed: 0.45, hp: 1, attack: '1H_Melee_Attack_Chop', walk: 'Walking_A', shield: true, prob: 'normal' },
  barbarian: { file: 'Barbarian', name: 'Barbar', keep: ['2H_Axe'], weapons: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug'], h: 1.75, speed: 0.4, hp: 2, attack: '2H_Melee_Attack_Chop', walk: 'Walking_A', charge: true, prob: 'three' },
  hooded: { file: 'Rogue_Hooded', name: 'Strelec', keep: ['2H_Crossbow'], weapons: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'], h: 1.4, speed: 0.6, hp: 1, attack: '2H_Ranged_Shoot', walk: 'Walking_A', ranged: true, prob: 'normal', range: 10, aim: 1.2, cd: 2.8, shotSpeed: 15 },
  // Majster: vrhač hádže 3 nože do vejára (bližšie, rýchlejšie mieri)
  vrhac: { file: 'Rogue', name: 'Vrhač', keep: ['Throwable', 'Knife'], weapons: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'], h: 1.35, speed: 0.7, hp: 1, attack: 'Throw', walk: 'Running_B', ranged: true, prob: 'easy', range: 7, aim: 0.9, cd: 3.2, shotSpeed: 10, fan: 0.3 },
  innkeeper: { file: 'Barbarian', name: 'Obchodník', keep: ['Mug'], weapons: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug'], h: 1.7, cape: 0x8a7a6a },
};
const TPL = {};
export async function loadFighters() {
  const files = [...new Set(Object.values(KINDS).map(d => d.file))];
  await Promise.all(files.map(async f => {
    const g = await loadGlb(`modely/bojovnici/${f}.glb`);
    const box = new THREE.Box3().setFromObject(g.scene);
    TPL[f] = { scene: g.scene, clips: g.animations, h: box.max.y - box.min.y };
  }));
}
// nová postava; size = násobok veľkosti (elita, vodca)
export function makeFighter(kind, size = 1, parent = scene) {
  const d = KINDS[kind], tpl = TPL[d.file], g = new THREE.Group(), m = skClone(tpl.scene);
  m.scale.setScalar(d.h / tpl.h * size); g.add(m);
  const mats = [];
  m.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    if (d.weapons.includes(o.name) && !d.keep.includes(o.name)) { o.visible = false; return; }
    o.material = /_Cape$/.test(o.name) ? std(d.cape || 0xb83a34, { flatShading: false, emissive: 0x000000 }) : tone(o.material.clone(), 0.98);
    mats.push(o.material);
  });
  parent.add(g); g.traverse(o => o.layers.enable(1));   // vrstva 1 = postava (kresba ich kreslí tmavšie)
  const mixer = new THREE.AnimationMixer(m), acts = {};
  tpl.clips.forEach(c => { acts[c.name] = mixer.clipAction(c); });
  for (const n of [d.attack, 'Hit_A', 'Death_A', 'Block_Hit', 'Sit_Floor_StandUp', 'Cheer', 'Spellcast_Raise']) if (n && acts[n]) { acts[n].setLoop(THREE.LoopOnce); acts[n].clampWhenFinished = true; }
  const f = { kind, d, g, mats, mixer, acts, cur: null, size, h: d.h * size };
  f.play = (name, fade = 0.15, restart = false) => { const a = acts[name]; if (!a || (f.cur === a && !restart)) return; a.reset().fadeIn(fade).play(); if (f.cur && f.cur !== a) f.cur.fadeOut(fade); f.cur = a; };
  return f;
}
export function removeFighter(f) { f.g.parent && f.g.parent.remove(f.g); }
