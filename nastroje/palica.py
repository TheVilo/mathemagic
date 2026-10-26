# Palica z Gemini → štýl hry: 1-bit bodky (atrament + kostená biela), priehľadné pozadie, nájdené okienka displeja a klávesy.
# Použitie: python3 nastroje/palica.py zdroj/palice/pocitadlo-original.jpeg pocitadlo
# Výstup: scena3d/palice/<meno>.png + <meno>.json (okienka a klávesy v percentách obrázka)
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage

src, name = sys.argv[1], sys.argv[2]
SCALE = 0.5                       # 1440 px → 720 px: jemnejšie bodky (Lukáš 26. 10.), v hre sa zobrazí v rovnakej veľkosti
INK, BONE = (14, 14, 16), (242, 239, 230)

g = np.asarray(Image.open(src).convert('L'), dtype=np.float32) / 255
H, W = g.shape

# 1) KLÁVESY: svetlé kruhy uzavreté v kalkulačke (komponenty bielej, ktoré sa nedotýkajú okraja, tvar ~ kruh)
white = g > 0.8
lab, n = ndimage.label(white)
edge = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
keys = []
for i, sl in enumerate(ndimage.find_objects(lab), 1):
    if i in edge or sl is None: continue
    h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    area = (lab[sl] == i).sum()
    if 40 < w < 140 and 0.8 < h / w < 1.25 and area > 0.6 * w * h:
        keys.append((sl[1].start + w / 2, sl[0].start + h / 2, (w + h) / 4))
keys.sort(key=lambda k: (round(k[1] / 40), k[0]))

# 2) OKIENKA DISPLEJA: nad klávesmi, tmavé obdĺžniky so svetlejším rámom → komponenty stredne sivej v páse nad klávesmi
top = min(k[1] for k in keys) - max(k[2] for k in keys) * 1.2
band = slice(int(top - 260), int(top))
mid = (g[band] > 0.18) & (g[band] < 0.62)
lab2, n2 = ndimage.label(mid)
wins = []
for i, sl in enumerate(ndimage.find_objects(lab2), 1):
    h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    if 50 < w < 200 and 50 < h < 200 and 0.6 < h / w < 1.6:
        wins.append((sl[1].start + w / 2, band.start + sl[0].start + h / 2, w, h))
wins.sort(key=lambda r: r[0])

# 3) DITHER: zmenšiť, usporiadané Bayer 4×4 (rovnaký raster ako svet), pozadie priehľadné (biela spojená s okrajom)
sm = Image.open(src).convert('L').resize((int(W * SCALE), int(H * SCALE)), Image.LANCZOS)
a = np.asarray(sm, dtype=np.float32) / 255
B = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16 + 1 / 32
th = np.tile(B, (a.shape[0] // 4 + 1, a.shape[1] // 4 + 1))[:a.shape[0], :a.shape[1]]
a = np.clip((a - 0.08) / 0.84, 0, 1)        # kontrast: atrament čierny, papier biely, šrafy ostanú
on = a > th
bg = a > 0.9
lb, _ = ndimage.label(bg)
outside = np.isin(lb, np.unique(np.r_[lb[0], lb[-1], lb[:, 0], lb[:, -1]])) & bg
rgba = np.zeros(a.shape + (4,), np.uint8)
rgba[on] = (*BONE, 255); rgba[~on] = (*INK, 255); rgba[outside] = (0, 0, 0, 0)
Image.fromarray(rgba, 'RGBA').save(f'scena3d/palice/{name}.png')

pct = lambda x, y: [round(x / W * 100, 2), round(y / H * 100, 2)]
data = { 'w': rgba.shape[1], 'h': rgba.shape[0],
  'wins': [{ 'c': pct(x, y), 'w': round(w / W * 100, 2), 'h': round(h / H * 100, 2) } for x, y, w, h in wins],
  'keys': [{ 'c': pct(x, y), 'r': round(r / W * 100, 2) } for x, y, r in keys] }
json.dump(data, open(f'scena3d/palice/{name}.json', 'w'))
print(len(wins), 'okienka,', len(keys), 'klávesov,', data['w'], '×', data['h'])
