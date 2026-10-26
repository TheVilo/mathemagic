# Drahokamy z Gemini (8 brúsov, rytina) → hra: každý zvlášť, dither 1-bit, priehľadné pozadie.
# Výstup scena3d/palice/gem-<i>.png: atrament = čierne čiary a tiene, svetlé plôšky PRIEHĽADNÉ (hra pod ne dá farbu živlu)
#          scena3d/palice/gem-<i>-m.png: silueta (maska), aby farba bola len vnútri kameňa
# Poradie (zľava, 2 riadky): 0 osemuholník, 1 šesťuholník, 2 kosoštvorec, 3 bageta, 4 okrúhly, 5 slza, 6 trojuholník, 7 hviezda
import numpy as np
from PIL import Image
from scipy import ndimage

src = Image.open('zdroj/palice/gemy-original.jpeg').convert('L')
g = np.asarray(src, dtype=np.float32) / 255
ink = g < 0.55
blob = ndimage.binary_closing(ink, iterations=6)
blob = ndimage.binary_fill_holes(blob)
lab, n = ndimage.label(blob)
objs = [(sl, i) for i, sl in enumerate(ndimage.find_objects(lab), 1) if (sl[0].stop - sl[0].start) > g.shape[0] * 0.15]
objs.sort(key=lambda o: (round(o[0][0].start / (g.shape[0] / 2)), o[0][1].start))
B = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16 + 1 / 32
S = 160   # veľkosť výstupu (štvorec)
for k, (sl, i) in enumerate(objs[:8]):
    m = ndimage.binary_fill_holes(lab[sl] == i)
    crop = g[sl]; h, w = crop.shape; side = max(h, w) + 8
    a = np.ones((side, side), np.float32); mm = np.zeros((side, side), bool)
    oy, ox = (side - h) // 2, (side - w) // 2
    a[oy:oy + h, ox:ox + w] = np.where(m, crop, 1); mm[oy:oy + h, ox:ox + w] = m
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((S, S), Image.LANCZOS), np.float32) / 255
    mm = np.asarray(Image.fromarray(mm.astype(np.uint8) * 255).resize((S, S), Image.LANCZOS)) > 127
    th = np.tile(B, (S // 4, S // 4))
    dark = (np.clip((a - 0.05) / 0.9, 0, 1) < th) & mm
    rgba = np.zeros((S, S, 4), np.uint8); rgba[dark] = (14, 14, 16, 255)
    Image.fromarray(rgba).save(f'scena3d/palice/gem-{k}.png')
    mk = np.zeros((S, S, 4), np.uint8); mk[mm] = (255, 255, 255, 255)
    Image.fromarray(mk).save(f'scena3d/palice/gem-{k}-m.png')
print(len(objs), 'drahokamov')
