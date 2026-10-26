# Fotky kúziel a palíc → štýl hry: FAREBNÝ dither (Lukáš 26. 10.) – 3 tóny: tma, farba kúzla, svetlo,
# usporiadaný dither 4×4, 128 px (v hre ostré pixely). Farba sa zistí z obrázka (priemer sýtych pixelov).
# Použitie: python3 nastroje/karty-dither.py   (zdroj/karty/*.jpg → zdroj/karty/*.png, originály ostanú)
import glob, colorsys, numpy as np
from PIL import Image
B = np.array([[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]) / 16 + 1/32
S = 128
INK, CREAM = np.array([14, 14, 16]), np.array([250, 244, 226])
for f in sorted(glob.glob('zdroj/karty/*.jpg')):
    src = Image.open(f).convert('RGB').resize((S, S), Image.LANCZOS)
    rgb = np.asarray(src, np.float32)
    mx, mn = rgb.max(2), rgb.min(2); sat = (mx - mn) / np.maximum(mx, 1)
    w = (sat * (mx / 255)) ** 2
    col = (rgb * w[..., None]).sum((0, 1)) / max(w.sum(), 1e-3) if w.sum() > 1 else np.array([200, 190, 170])
    h, l, s_ = colorsys.rgb_to_hls(*(col / 255)); col = np.array(colorsys.hls_to_rgb(h, 0.55, max(0.55, min(0.9, s_ * 1.3)))) * 255   # čistá, žiarivá farba
    pal = np.array([INK, col * 0.85, col * 0.3 + CREAM * 0.7])   # len 3 tóny → výraznejšie bodky (Lukáš 26. 10.: „málo bodkované“)
    a = rgb.mean(2) / 255
    lo, hi = np.percentile(a, 2), np.percentile(a, 98); a = np.clip((a - lo) / max(hi - lo, 1e-3), 0, 1)
    t = a * 2; base = np.floor(t).clip(0, 1); frac = t - base
    idx = (base + (frac > np.tile(B, (S // 4, S // 4)))).astype(int).clip(0, 2)
    Image.fromarray(pal[idx].astype(np.uint8)).save(f[:-4] + '.png', optimize=True)
print('hotovo', len(glob.glob('zdroj/karty/*.png')))
