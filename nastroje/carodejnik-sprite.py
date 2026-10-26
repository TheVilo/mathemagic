# Sprite čarodejníka z Gemini (4 × 3, purpurové pozadie) → atlas pre hru: 12 snímok rovnakej veľkosti, nohy dole v strede.
# Riadky: 0 chôdza, 1 státie (plášť veje), 2 kúzlo. Výstup scena3d/carodejnik.png (+ .json s rozmermi)
import json, numpy as np
from PIL import Image
from scipy import ndimage
im = Image.open('zdroj/carodejnik/sprite-original.jpeg').convert('RGB'); a = np.asarray(im).astype(int)
H, W = a.shape[:2]
r, g, b = a[..., 0], a[..., 1], a[..., 2]
bg = (r > 170) & (b > 170) & (g < 120)                         # purpurová
fg = ndimage.binary_opening(~bg, iterations=1)
frames = []
for row in range(3):
    for col in range(4):
        y0, y1, x0, x1 = row * H // 3, (row + 1) * H // 3, col * W // 4, (col + 1) * W // 4
        m = fg[y0:y1, x0:x1]; lab, n = ndimage.label(m)
        if not n: continue
        sizes = ndimage.sum(m, lab, range(1, n + 1)); keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 400])
        ys, xs = np.where(keep); frames.append((y0 + ys.min(), y0 + ys.max() + 1, x0 + xs.min(), x0 + xs.max() + 1, keep[ys.min():ys.max() + 1, xs.min():xs.max() + 1]))
FH = 56   # výška snímky v hre (px) – pixelová postavička
sc = FH / max(f[1] - f[0] for f in frames)
CW = int(max(f[3] - f[2] for f in frames) * sc) + 4; CH = FH + 2
atlas = Image.new('RGBA', (CW * 4, CH * 3), (0, 0, 0, 0))
for i, (y0, y1, x0, x1, m) in enumerate(frames):
    crop = im.crop((x0, y0, x1, y1)).convert('RGBA'); al = Image.fromarray((m * 255).astype(np.uint8)); crop.putalpha(al)
    w, h = int((x1 - x0) * sc), int((y1 - y0) * sc)
    small = crop.resize((w, h), Image.LANCZOS)
    arr = np.asarray(small).copy(); arr[..., 3] = np.where(arr[..., 3] > 110, 255, 0); small = Image.fromarray(arr)
    cx, cy = (i % 4) * CW + (CW - w) // 2, (i // 4) * CH + CH - h - 1
    atlas.alpha_composite(small, (cx, cy))
atlas.save('scena3d/carodejnik.png'); json.dump({ 'cw': CW, 'ch': CH, 'n': len(frames) }, open('scena3d/carodejnik.json', 'w'))
print(len(frames), 'snímok', CW, CH)
