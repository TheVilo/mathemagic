# Zjednoduší čarodejníka: 4 tóny, bez osamelých pixelov, čistý obrys, dorobená chôdza (nohy sa striedajú).
import json, sys
from collections import Counter
from PIL import Image
F = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
LV = {0: '0', 1: '0', 2: '2', 3: '2', 4: '4', 5: '4', 6: '6', 7: '7', 8: '7'}

def grid(fr): return [list(r) for r in fr]
def post(g):
    return [[c if c in '.9C' else LV[int(c)] for c in r] for r in g]
def denoise(g, passes=2):
    h, w = len(g), len(g[0])
    for _ in range(passes):
        n = [r[:] for r in g]
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                c = g[y][x]
                if c in '.9C': continue
                nb = [g[y + j][x + i] for j in (-1, 0, 1) for i in (-1, 0, 1) if (i or j)]
                if nb.count(c) <= 1:
                    cand = Counter(v for v in nb if v not in '.9C').most_common(1)
                    if cand: n[y][x] = cand[0][0]
        g = n
    return g
def outline(g):
    h, w = len(g), len(g[0])
    n = [r[:] for r in g]
    for y in range(h):
        for x in range(w):
            if g[y][x] in '.C': continue
            edge = any(not (0 <= y + j < h and 0 <= x + i < w) or g[y + j][x + i] == '.' for j, i in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge: n[y][x] = '0'
    return n
def pad(g, top=3):
    w = len(g[0]); return [['.'] * w for _ in range(top)] + g
def legs(g, rows, lift, side):
    """Vráti 4 snímky chôdze: stoj, ľavá hore, stoj (telo vyššie), pravá hore."""
    h, w = len(g), len(g[0])
    cols = [x for x in range(w) if any(g[y][x] != '.' for y in range(h - rows, h))]
    if not cols: return [g] * 4
    mid = (min(cols) + max(cols)) / 2
    def step(left):
        n = [r[:] for r in g]
        for y in range(h - rows, h):
            for x in range(w): 
                if (x < mid) == left: n[y][x] = '.'
        for y in range(h - rows, h):
            for x in range(w):
                if (x < mid) == left and g[y][x] != '.':
                    nx = x + (side if side else 0)
                    if 0 <= nx < w: n[y - lift][nx] = g[y][x]
        return n
    up = [r[:] for r in g[1:]] + [['.'] * w]   # telo o 1 px vyššie
    return [g, step(True), up, step(False)]

def face_only(g):
    # svetlé pixely (7) nechaj len pri očiach; inde sú to rušivé fliačiky
    h, w = len(g), len(g[0])
    eyes = [(y, x) for y in range(h) for x in range(w) if g[y][x] == '9']
    n = [r[:] for r in g]
    for y in range(h):
        for x in range(w):
            if g[y][x] == '7' and not any(abs(y - ey) <= 3 and abs(x - ex) <= 4 for ey, ex in eyes): n[y][x] = '4'
    return n
def process(fr, rows, lift, side):
    g = outline(denoise(face_only(post(grid(fr)))))
    g = pad(g, lift + 1)
    return [[''.join(r) for r in f] for f in legs(g, rows, lift, side)]

big = json.load(open(sys.argv[1]))
def pool(fr):
    h = len(fr); w = len(fr[0]); out = []
    for y in range(0, h - 1, 2):
        line = ''
        for x in range(0, w - 1, 2):
            cs = [fr[y][x], fr[y][x + 1], fr[y + 1][x], fr[y + 1][x + 1]]
            op = [c for c in cs if c != '.']
            if len(op) < 2: line += '.'; continue
            if 'C' in op: line += 'C'; continue
            if '9' in op: line += '9'; continue
            d = [int(c) for c in op]
            line += str(max(d) if max(d) >= 6 else min(8, round(0.5 * min(d) + 0.5 * sum(d) / len(d)) + 1))
        out.append(line)
    return out
SIDE = [0, 0, 1, -1]
res_big = [process(big[d][0], 8, 3, SIDE[d]) for d in range(4)]
res_small = [process(pool(big[d][0]), 4, 2, SIDE[d]) for d in range(4)]
json.dump({'big': res_big, 'small': res_small}, open(OUT, 'w'))

def render(fr, s=8):
    hh = len(fr); ww = len(fr[0]); im = Image.new('RGB', (ww * s, hh * s), (205, 203, 198)); px = im.load()
    for y, l in enumerate(fr):
        for x, c in enumerate(l):
            if c == '.': continue
            col = (96, 190, 104) if c == 'C' else (240, 240, 240) if c == '9' else tuple([int(20 + int(c) / 8 * 200)] * 3)
            for j in range(s):
                for i in range(s): px[x * s + i, y * s + j] = col
    return im
for name, res, s in (('big', res_big, 6), ('small', res_small, 10)):
    tiles = [render(f, s) for d in res for f in d]
    Wm = max(t.width for t in tiles); Hm = max(t.height for t in tiles)
    sh = Image.new('RGB', (Wm * 4, Hm * 4), (205, 203, 198))
    for i, t in enumerate(tiles): sh.paste(t, ((i % 4) * Wm, (i // 4) * Hm))
    sh.save(OUT.replace('.json', f'_{name}.png'))
