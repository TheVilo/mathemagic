// Zvuk Mathemagic: hudba (úvod / svet / súboj / vodca) sa prelína, efekty z Envato (../audio/*.mp3) cez WebAudio.
// MATEMATICKÁ HUDBA: každé znamienko v salve zahrá iný tón (pomer frekvencií = výška) → vzorec znie ako akord.
//   +  1 (základ)   −  8/9   ×  5/4 (veľká tercia)   ÷  9/8   √  3/2 (kvinta)   ²  4/3 (kvarta)   ³  15/8   !  2 (oktáva)
const NOTE = { '+': 1, '-': 8 / 9, '×': 5 / 4, '÷': 9 / 8, '√': 3 / 2, '²': 4 / 3, '³': 15 / 8, '!': 2 };
const FILES = ['uvod', 'svet', 'suboj', 'boss', 'kuzlo', 'zasah', 'gula', 'minca', 'truhla', 'objav'];
const BUF = {}, KEY = 'mm-zvuk';
let ac = null, master = null, musicG = null, cur = null, want = null;
export const zvuk = (() => { try { return Object.assign({ hudba: true, efekty: true }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { hudba: true, efekty: true }; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(zvuk)); } catch (e) {} };

// súbory sa sťahujú hneď pri načítaní (bez čakania na ťuk) – po prvom ťuknutí sa už len dekódujú, hudba ide okamžite
const RAW = {}; for (const n of FILES) RAW[n] = fetch('../audio/' + n + '.mp3').then(r => r.arrayBuffer()).catch(() => null);
// prehliadač pustí zvuk až po prvom ťuknutí / klávese (pravidlo prehliadačov, autoplay bez dotyku nejde)
export function zvukStart() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  musicG = ac.createGain(); musicG.gain.value = zvuk.hudba ? 0.3 : 0; musicG.connect(master);
  for (const n of FILES) RAW[n].then(b => b && ac.decodeAudioData(b.slice(0))).then(buf => { if (!buf) return; BUF[n] = buf; if (want === n && !cur) hudba(n); }).catch(() => {});
}
// capture: aj keď obrazovka zastaví udalosť (stopPropagation), zvuk sa odomkne pri úplne prvom dotyku
addEventListener('pointerdown', zvukStart, true); addEventListener('keydown', zvukStart, true);
// KLIK TLAČIDLA: krátky „kalkulačkový“ tón (syntéza, bez súboru); výška podľa druhu tlačidla
export function klik(pitch = 1) {
  if (!ac || !zvuk.efekty) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square'; o.frequency.setValueAtTime(880 * pitch, t); o.frequency.exponentialRampToValueAtTime(660 * pitch, t + 0.05);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.08);
}
const KLIK = 'button, .row, .lvo, .palc, .ck, .tk, .mp, .ovx, .card.pick, .lrow, [data-k]';
addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest(KLIK); if (!b || b.disabled) return; zvukStart(); klik(b.classList.contains('eq') || b.classList.contains('on') ? 1.5 : b.matches('.ck, .tk') ? 1.25 : 1); }, true);

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
