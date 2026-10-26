# Fotky kúziel a palíc → štýl hry: 5 sivých tónov (kresba.js), usporiadaný dither 4×4, 128 px (v hre ostré pixely)
# Použitie: python3 nastroje/karty-dither.py   (zdroj/karty/*.jpg → zdroj/karty/*.png, originály ostanú)
import glob, numpy as np
from PIL import Image
PAL = np.array([(0.22,0.18,0.22),(0.41,0.36,0.41),(0.6,0.55,0.58),(0.79,0.76,0.76),(0.96,0.94,0.87)]) * 255
B = np.array([[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]) / 16 + 1/32
S = 128
for f in sorted(glob.glob('zdroj/karty/*.jpg')):
    im = Image.open(f).convert('L').resize((S, S), Image.LANCZOS)
    a = np.asarray(im, np.float32) / 255
    lo, hi = np.percentile(a, 3), np.percentile(a, 97); a = np.clip((a - lo) / max(hi - lo, 1e-3), 0, 1)   # celý rozsah tónov
    t = a * 4; base = np.floor(t).clip(0, 3); frac = t - base
    th = np.tile(B, (S // 4, S // 4))
    idx = (base + (frac > th)).astype(int).clip(0, 4)
    Image.fromarray(PAL[idx].astype(np.uint8)).save(f[:-4] + '.png', optimize=True)
print('hotovo', len(glob.glob('zdroj/karty/*.png')))
