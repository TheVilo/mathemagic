// DRAHOKAM V DITHERI (Kniha kúziel, výber vylepšení – Lukáš 26. 10.): brus z palice, 3 tóny farby kúzla, svetlo zľava hore, tmavé rytie navrch
import { THREE } from './svet.js';
export const GEMCUT_S = { num: 4, '+': 0, '-': 3, '×': 7, '÷': 5, '√': 2, '²': 1, '³': 1, '!': 1, 'π': 6, 'e': 6, 'φ': 6 };
const GEMIMG = [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = new Image(), m = new Image(); a.src = `palice/gem-${i}.png`; m.src = `palice/gem-${i}-m.png`; return { a, m }; });
const GEMURL = {};
export function gemURL(cut, color) {
  const key = cut + '|' + color; if (GEMURL[key]) return GEMURL[key];
  const G2 = GEMIMG[cut]; if (!G2.a.complete || !G2.m.complete || !G2.a.naturalWidth) return '';
  const N = 48, cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  const read = img => { x.clearRect(0, 0, N, N); x.drawImage(img, 0, 0, N, N); return x.getImageData(0, 0, N, N).data; };
  const M = read(G2.m), A = read(G2.a), out = x.createImageData(N, N), c = new THREE.Color(color), CR = new THREE.Color(0xfff6dc);
  const tones = [c.clone().multiplyScalar(0.45), c.clone(), c.clone().lerp(CR, 0.6)].map(t => [t.r * 255, t.g * 255, t.b * 255]);
  const BAY = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) { const i = (yy * N + xx) * 4; if (M[i + 3] < 128) continue;
    let col; if (A[i + 3] > 128) col = [14, 14, 16]; else { const l = 1 - (xx + yy) / (2 * N) + 0.15, t = l * 2 + BAY[yy & 3][xx & 3] / 16 - 0.5; col = tones[Math.max(0, Math.min(2, Math.round(t)))]; }   // svetlo zľava hore, ditherom
    out.data[i] = col[0]; out.data[i + 1] = col[1]; out.data[i + 2] = col[2]; out.data[i + 3] = 255; }
  x.putImageData(out, 0, 0); return (GEMURL[key] = cv.toDataURL());
}
