// Zvuk Mathemagic: hudba (úvod / svet / súboj / vodca) sa prelína, efekty z Envato (../audio/*.mp3) cez WebAudio.
// MATEMATICKÁ HUDBA: každé znamienko v salve zahrá iný tón (pomer frekvencií = výška) → vzorec znie ako akord.
//   +  1 (základ)   −  8/9   ×  5/4 (veľká tercia)   ÷  9/8   √  3/2 (kvinta)   ²  4/3 (kvarta)   ³  15/8   !  2 (oktáva)
const NOTE = { '+': 1, '-': 8 / 9, '×': 5 / 4, '÷': 9 / 8, '√': 3 / 2, '²': 4 / 3, '³': 15 / 8, '!': 2 };
const FILES = ['uvod', 'svet', 'suboj', 'boss', 'kuzlo', 'zasah', 'gula', 'minca', 'truhla', 'objav'];
const BUF = {}, KEY = 'mm-zvuk';
let ac = null, master = null, musicG = null, cur = null, want = null;
export const zvuk = (() => { try { return Object.assign({ hudba: true, efekty: true }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { hudba: true, efekty: true }; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(zvuk)); } catch (e) {} };

// prehliadač pustí zvuk až po prvom ťuknutí / klávese
export function zvukStart() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  musicG = ac.createGain(); musicG.gain.value = zvuk.hudba ? 0.3 : 0; musicG.connect(master);
  for (const n of FILES) fetch('../audio/' + n + '.mp3').then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(buf => { BUF[n] = buf; if (want === n && !cur) hudba(n); }).catch(() => {});
}
addEventListener('pointerdown', zvukStart); addEventListener('keydown', zvukStart);

export function efekt(n, vol = 0.7, rate = 1, delay = 0) {
  if (!ac || !zvuk.efekty || !BUF[n]) return;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = BUF[n]; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g).connect(master); s.start(ac.currentTime + delay);
}
// salva kúzla: každé znamienko svoj tón, krátko po sebe; silnejšie kúzlo = hlasnejšie a hlbšie
export function akord(ops, power = 1) {
  const list = ops && ops.length ? ops : ['+'];
  list.slice(0, 8).forEach((o, i) => efekt('gula', 0.35 + Math.min(0.4, power * 0.25), (NOTE[o] || 1) * (1.15 - Math.min(0.35, power * 0.15)), i * 0.09));
}
export function hudba(n) {
  want = n; if (!ac || !BUF[n]) return;
  if (cur && cur.n === n) return;
  const t = ac.currentTime;
  if (cur) { const o = cur; o.g.gain.cancelScheduledValues(t); o.g.gain.setValueAtTime(o.g.gain.value, t); o.g.gain.linearRampToValueAtTime(0, t + 1.2); o.s.stop(t + 1.3); }
  const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = BUF[n]; s.loop = true;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 1.5); s.connect(g).connect(musicG); s.start();
  cur = { n, s, g };
}
export function nastavZvuk(k, v) {
  zvuk[k] = v; save();
  if (k === 'hudba' && musicG && ac) musicG.gain.setTargetAtTime(v ? 0.3 : 0, ac.currentTime, 0.2);
}
