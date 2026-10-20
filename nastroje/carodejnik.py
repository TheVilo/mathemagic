# Čarodejník nakreslený tvarmi (podľa Lukášovej predlohy): klobúk, plášť, oči, palica s kryštálom, nohy s krokom.
# Výstup: 4 smery (dole, hore, vpravo, vľavo) × 4 snímky chôdze. Znaky: 0 obrys, 2–6 jas, 9 oči, C kryštál, . nič.
import json, sys
from PIL import Image
W, H = 20, 26

def blank(): return [['.'] * W for _ in range(H)]
def put(g, x, y, c):
    if 0 <= x < W and 0 <= y < H: g[y][x] = c

def hat(g, cx, top, lean):
    for r in range(7):                       # kužeľ
        y = top + r; half = r * 0.55 + 0.5
        c = cx + (6 - r) * lean * 0.35
        for x in range(round(c - half), round(c + half) + 1):
            put(g, x, y, '3' if x < c else '2')
    for x in range(cx - 6, cx + 7): put(g, x, top + 7, '2')   # okraj
    for x in range(cx - 5, cx + 6): put(g, x, top + 8, '2')
    for x in range(round(cx - 3 + 0 * lean), round(cx + 3) + 1): put(g, x, top + 6, '4')   # pásik

def cloak(g, cx, top, bottom, lean, flutter):
    for y in range(top, bottom + 1):
        k = (y - top) / (bottom - top)
        half = 3 + k * 3.2
        l = round(cx - half - (lean < 0) * k * 2 * flutter); r = round(cx + half + (lean > 0) * 0 - (lean > 0) * 0)
        if lean != 0: l, r = (round(cx - half - k * 2.5 * flutter), round(cx + half - 1)) if lean > 0 else (round(cx - half + 1), round(cx + half + k * 2.5 * flutter))
        for x in range(l, r + 1):
            if y == bottom and (x + flutter) % 3 == 0: continue   # zúbkovaný lem
            shade = 'c' if x < cx - 1 else ('a' if x >= r - 1 else 'b')   # plášť: a/b/c = vlniace sa znamienka
            put(g, x, y, shade)

def staff(g, x, top, bottom):
    for y in range(top, bottom + 1): put(g, x, y, '2')
    for dx, dy in ((0, -4), (-1, -3), (0, -3), (1, -3), (-1, -2), (0, -2), (1, -2), (0, -1)):
        put(g, x + dx, top + dy, 'C')

def legs(g, cx, y0, frame, side):
    # y0 = horný riadok nôh; nohy sú 3 riadky + topánka
    if side == 0:
        lift = {1: (1, 0), 3: (0, 1)}.get(frame, (0, 0))
        for i, lx in enumerate((cx - 2, cx + 1)):
            up = lift[i]
            for y in range(y0, y0 + 3 - up):
                put(g, lx, y, '2'); put(g, lx + 1, y, '2')
            put(g, lx, y0 + 3 - up, '0'); put(g, lx + 1, y0 + 3 - up, '0')
    else:
        # bokom: predná a zadná noha sa striedajú
        off = {0: (0, 0), 1: (2, -2), 2: (0, 0), 3: (-2, 2)}[frame]
        for i, base in enumerate((cx - 1, cx + 1)):
            dx = off[i] * side
            for y in range(y0, y0 + 3):
                put(g, base + round(dx * (y - y0 + 1) / 3), y, '2')
            put(g, base + dx, y0 + 3, '0'); put(g, base + dx + side, y0 + 3, '0')

def face(g, cx, y, eyes):
    for yy in range(y, y + 3):
        for x in range(cx - 3, cx + 4): put(g, x, yy, '3')
    for ex in eyes: put(g, ex, y + 1, '9'); put(g, ex + 1, y + 1, '9')

def outline(g):
    n = [r[:] for r in g]
    for y in range(H):
        for x in range(W):
            if g[y][x] != '.': continue
            if any(0 <= y + j < H and 0 <= x + i < W and g[y + j][x + i] not in '.0C' for j, i in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                n[y][x] = '0'
    return n

def frame(d, f):
    g = blank(); cx = 10
    bob = 1 if f in (1, 3) else 0
    top = 1 + bob
    if d == 0:       # dole (spredu)
        legs(g, cx, 21, f, 0)
        cloak(g, cx, top + 11, 20, 0, f % 2); face(g, cx, top + 9, (cx - 2, cx + 1)); hat(g, cx, top, 1)
        put(g, 4, top + 14, '6'); put(g, 4, top + 15, '6')       # ruka na palici
    elif d == 1:     # hore (zozadu)
        legs(g, cx, 21, f, 0); cloak(g, cx, top + 10, 21, 0, f % 2)
        for x in range(cx - 3, cx + 4): put(g, x, top + 9, '2')
        hat(g, cx, top, -1); put(g, 15, top + 14, '6')
    else:            # vpravo
        side = 1
        legs(g, cx, 21, f, side); cloak(g, cx - 1, top + 11, 20, -1, 1 + f % 2)
        face(g, cx + 1, top + 9, (cx + 2,)); hat(g, cx, top, -1)
        put(g, 14, top + 14, '6'); put(g, 14, top + 15, '6')
    g = outline(g)
    if d == 3: g = [list(reversed(r)) for r in g]
    if d == 2: pass
    return [''.join(r) for r in g]

dirs = [[frame(d if d != 3 else 2, f) if d != 3 else None for f in range(4)] for d in range(4)]
dirs[3] = [[''.join(reversed(r)) for r in fr] for fr in dirs[2]]
json.dump(dirs, open(sys.argv[1], 'w'))

def render(fr, s=10):
    im = Image.new('RGB', (W * s, H * s), (205, 203, 198)); px = im.load()
    for y, l in enumerate(fr):
        for x, c in enumerate(l):
            if c == '.': continue
            col = (96, 190, 104) if c == 'C' else (245, 245, 240) if c == '9' else (120, 110, 150) if c in 'abc' else tuple([int(18 + int(c) / 8 * 210)] * 3)
            for j in range(s):
                for i in range(s): px[x * s + i, y * s + j] = col
    return im
sh = Image.new('RGB', (W * 10 * 4, H * 10 * 4), (205, 203, 198))
for d in range(4):
    for f in range(4): sh.paste(render(dirs[d][f]), (f * W * 10, d * H * 10))
sh.save(sys.argv[1].replace('.json', '.png'))
