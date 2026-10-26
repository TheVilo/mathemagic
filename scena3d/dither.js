// JEDEN DITHER PRE VŠETKO (Lukáš 26. 10.: „dither bude na všetkom rovnaký“) – presne ako svet v kresba.js:
// bod = 2 px obrazovky, 5 tónov, prechody vzorom bodka → 2 bodky → X → obrátené X → plný tón, svetlo = čistá plocha.
// Obrázky sa ditherujú až v hre, v skutočnej veľkosti, v ktorej sa zobrazia → bodky sú všade rovnaké (aj na mobile).
// Všetko čiernobiele (sivé tóny sveta), FAREBNÉ sú len kúzla (mode 'col': 5 tónov z farby kúzla).
// Použitie v HTML: ditImg('../zdroj/karty/blesk.jpg', 'col')  ·  ditImg(cesta, 'grey', { paper: true }) = biely papier okolo kresby zmizne
const GREY = [[56, 46, 56], [105, 92, 105], [153, 140, 148], [201, 194, 194], [245, 240, 222]];   // g0…g4 z kresba.js
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
export const ditImg = (src, mode = 'grey', o = {}) => `<img class="dit${o.cls ? ' ' + o.cls : ''}" src="${BLANK}" data-src="${src}" data-mode="${mode}"${o.paper ? ' data-paper="1"' : ''} alt="">`;

const SRC = {}, OUT = {};
const load = src => SRC[src] || (SRC[src] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }));
const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
// vzor sveta: tón 0..4 → index palety (rovnaké prahy ako kresba.js)
function patIdx(tone, x, y) {
  if (tone > 3.6) return 4;
  const tb = Math.floor(Math.min(tone, 3.999)), tf = tone - tb, px = x & 3, py = y & 3;
  const xd = px === py || px + py === 3, d1 = px === 0 && py === 0, d2 = d1 || (px === 2 && py === 2);
  const up = tf < 0.12 ? 0 : tf < 0.3 ? +d1 : tf < 0.45 ? +d2 : tf < 0.62 ? +xd : tf < 0.85 ? +!xd : 1;
  return tb + up;
}
function palette(img, mode) {
  if (mode !== 'col') return GREY;
  // farba kúzla = priemer sýtych pixelov obrázka
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32);
  const d = x.getImageData(0, 0, 32, 32).data; let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < d.length; i += 4) { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), s = ((mx - mn) / Math.max(mx, 1)) * (mx / 255); const k = s * s; r += d[i] * k; g += d[i + 1] * k; b += d[i + 2] * k; w += k; }
  let col = w > 0.5 ? [r / w, g / w, b / w] : [200, 190, 170]; const m = Math.max(...col, 1); col = col.map(v => v / m * 235);   // jasná, sýta farba
  const mix = (a, t, k) => a.map((v, i) => v * (1 - k) + t[i] * k);
  return [[18, 16, 20], mix(col, [18, 16, 20], 0.62), mix(col, [18, 16, 20], 0.28), col, mix(col, [250, 244, 226], 0.6)];
}
async function render(el) {
  const r = { width: el.offsetWidth, height: el.offsetHeight }; if (r.width < 4) { if (el.isConnected) setTimeout(later, 120); return; }   // offsetWidth = bez animácie (scale)
  const dpr = devicePixelRatio || 1, W = Math.max(8, Math.round(r.width * dpr / 2)), H = Math.max(8, Math.round((r.height || r.width) * dpr / 2));
  const key = el.dataset.src + '|' + el.dataset.mode + '|' + W + 'x' + H + '|' + (el.dataset.paper || '');
  el.dataset.done = '1';
  if (!OUT[key]) OUT[key] = (async () => {
    const img = await load(el.dataset.src);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    const s = Math.max(W / img.width, H / img.height), dw = img.width * s, dh = img.height * s;   // ako object-fit: cover
    x.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    const D = x.getImageData(0, 0, W, H), d = D.data, P = palette(img, el.dataset.mode), N = W * H, L = new Float32Array(N);
    for (let i = 0; i < N; i++) L[i] = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    // kontrast: celý rozsah tónov (2 % – 98 %)
    const sorted = Float32Array.from(L).sort(), lo = sorted[Math.floor(N * 0.02)], hi = sorted[Math.floor(N * 0.98)];
    let out = null;
    if (el.dataset.paper) {   // papier spojený s okrajom → priehľadný (kresba palice na bielom papieri)
      out = new Uint8Array(N); const st = []; for (let i = 0; i < W; i++) st.push(i, N - 1 - i); for (let j = 0; j < H; j++) st.push(j * W, j * W + W - 1);
      while (st.length) { const i = st.pop(); if (out[i] || L[i] < 0.86) continue; out[i] = 1; const xx = i % W; if (xx > 0) st.push(i - 1); if (xx < W - 1) st.push(i + 1); if (i >= W) st.push(i - W); if (i < N - W) st.push(i + W); }
    }
    for (let i = 0; i < N; i++) {
      if (out && out[i]) { d[i * 4 + 3] = 0; continue; }
      const t = Math.min(1, Math.max(0, (L[i] - lo) / Math.max(hi - lo, 1e-3))), c = P[patIdx(t * 4, i % W, (i / W) | 0)];
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
    x.putImageData(D, 0, 0); return cv.toDataURL();
  })();
  try { el.src = await OUT[key]; } catch (e) { el.remove(); }
}
let q = 0; const later = () => { if (!q) q = setTimeout(() => { q = 0; document.querySelectorAll('img.dit:not([data-done])').forEach(render); }, 30); };
new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
addEventListener('resize', () => { document.querySelectorAll('img.dit[data-done]').forEach(e => delete e.dataset.done); later(); });

// PALICA = tá istá kresba, ako keď do nej hádžeš kamene (čiernobiela), na karte aj v obchode
export const palArt = (k, cls = '') => ditImg(`../zdroj/palice/${({ zakladna: 'pocitadlo2', tazka: 'monolit', graficka: 'graficka', rychla: 'abakus', dvojita: 'dvojcata', vedecka: 'vedecka' })[k] || 'pocitadlo2'}-original.jpeg`, 'grey', { paper: true, cls });
