"""Portal-realm creature archetypes: prehistoric (ammonite, trilobite, plesiosaur, mosasaur,
dunkleosteus, anomalocaris), undead/crystal (bonefish, crystalfish), fel drake, robo fish and
pixel fish. Same conventions as fish.py: mask colors (R back, G belly, B fins), head toward -Y."""
import math
import random

import bmesh
from mathutils import Vector

import fish as F
from fish import BACK, BELLY, FIN, smoothstep
from lib import box, export, hexcol, ico, join, limb, paint, paint_verts, prism2d, reset, smooth, sphere, to_obj


def back_belly(co, n):
    b = smoothstep(-0.3, 0.3, n.z)
    return (b, 1 - b, 0, 1)


def ellipsoid(name, r, loc, mask=back_belly, segs=20, rings=14):
    ob = sphere(name, 1.0, loc, None, r, segs, rings)
    paint_verts(ob, mask)
    return ob


def dark_eyes(pts, r=0.025, color="#101418"):
    return join([sphere("e", r, p, hexcol(color), segs=8, rings=6) for p in pts], "Eye")


def ammonite():
    # a coiled shell with a ring of tentacles trailing behind (it jets backwards like a nautilus)
    n = 40
    pts, rad = [], []
    for k in range(n):
        a = k / (n - 1) * math.pi * 3.2
        r = 0.035 * math.exp(0.21 * a)
        pts.append((0, -0.05 - r * math.sin(a), 0.12 + r * math.cos(a) * 0.95))
        rad.append(0.018 * math.exp(0.2 * a))
    shell = F.tube("shell", pts, rad, 12, None, True)
    paint_verts(shell, lambda c, n2: BACK if c.z > 0.0 or c.y < -0.1 else BELLY)
    ribs = []
    for k in range(4, n - 2, 3):
        c = Vector(pts[k])
        ribs.append(sphere("rib", rad[k] * 1.08, c, FIN, (0.4, 1.0, 1.0), 10, 6))
    parts = [shell] + ribs
    mouth = Vector(pts[-1])
    for i in range(10):
        a = i / 10 * math.tau
        tp = [(mouth.x + math.cos(a) * 0.06 * (1 + s * 0.6), mouth.y + 0.05 + s * 0.42, mouth.z + math.sin(a) * 0.06 * (1 + s * 0.6))
              for s in (k / 7 for k in range(8))]
        parts.append(F.tube("t", tp, [0.022 * (1 - k / 7) + 0.004 for k in range(8)], 6, FIN, False))
    eye = dark_eyes([(s * 0.09, mouth.y + 0.02, mouth.z + 0.06) for s in (1, -1)], 0.03)
    return [join(parts, "Body"), eye]


def trilobite():
    body = ellipsoid("body", (0.28, 0.46, 0.07), (0, 0.02, 0.07), back_belly, 24, 12)
    parts = [body, ellipsoid("head", (0.34, 0.16, 0.08), (0, -0.34, 0.07), back_belly, 20, 10)]
    for i in range(9):
        y = -0.18 + i * 0.07
        w = 0.26 - abs(i - 3) * 0.018
        parts.append(ellipsoid("seg", (w, 0.022, 0.03), (0, y, 0.12), lambda c, n: FIN, 14, 6))
    parts.append(ellipsoid("axis", (0.07, 0.42, 0.05), (0, 0.02, 0.13), lambda c, n: BACK, 12, 8))
    for s in (1, -1):
        for i in range(6):
            y = -0.2 + i * 0.09
            parts.append(F.tube("leg", [(s * 0.2, y, 0.04), (s * 0.3, y + 0.02, 0.05), (s * 0.36, y + 0.04, 0.0)], [0.014, 0.012, 0.006], 5, FIN, False))
        parts.append(F.tube("ant", [(s * 0.08, -0.46, 0.08), (s * 0.18, -0.62, 0.1), (s * 0.28, -0.72, 0.08)], [0.008, 0.006, 0.003], 4, FIN, False))
        parts.append(prism2d("spine", [(0.0, 0.0), (0.06, 0.12), (0.02, 0.0)], 0.02, "XY", (s * 0.3, -0.36, 0.06), FIN, (0, 0, 0) if s > 0 else (0, math.pi, 0)))
    eye = dark_eyes([(s * 0.14, -0.36, 0.15) for s in (1, -1)], 0.03, "#2a2010")
    return [join(parts, "Body"), eye]


def plesio():
    parts = [ellipsoid("body", (0.2, 0.34, 0.13), (0, 0.15, 0.0))]
    n = 14
    neck = [(0, -0.12 - 0.62 * (k / (n - 1)), 0.03 + 0.26 * math.sin(k / (n - 1) * math.pi * 0.55)) for k in range(n)]
    neckR = [0.1 - 0.06 * (k / (n - 1)) for k in range(n)]
    nk = F.tube("neck", neck, neckR, 10, None, False)
    paint_verts(nk, back_belly)
    parts.append(nk)
    hx = neck[-1]
    parts.append(ellipsoid("head", (0.06, 0.1, 0.05), (hx[0], hx[1] - 0.06, hx[2] + 0.01)))
    parts.append(ellipsoid("snout", (0.035, 0.06, 0.025), (hx[0], hx[1] - 0.15, hx[2] - 0.005), lambda c, n2: BELLY, 10, 6))
    tail = [(0, 0.46 + 0.3 * (k / 7), -0.01 * k) for k in range(8)]
    tl = F.tube("tail", tail, [0.08 * (1 - k / 7) + 0.008 for k in range(8)], 8, None, True)
    paint_verts(tl, back_belly)
    parts.append(tl)
    flip = [(0, 0), (0.3, 0.06), (0.36, 0.12), (0.06, 0.1)]
    for s in (1, -1):
        for y in (-0.02, 0.32):
            parts.append(prism2d("flip", [(s * x, yy) for x, yy in flip], 0.025, "XY", (s * 0.16, y, -0.03), FIN))
    eye = dark_eyes([(s * 0.045, hx[1] - 0.09, hx[2] + 0.035) for s in (1, -1)], 0.014)
    return [join(parts, "Body"), eye]


def mosasaur():
    L, H, W = 1.0, 0.17, 0.15
    pr = F.make_profile(0.95, 0.3, 0.06, 1.2)
    b = F.body(L, H, W, pr, segs=18, rings=26, belly_flat=0.85)
    parts = [b]
    # long crocodile jaws
    parts.append(limb("upper", (0, -0.42, 0.02), (0, -0.66, 0.015), 0.055, 0.03, BACK, 10))
    parts.append(limb("lower", (0, -0.42, -0.03), (0, -0.63, -0.035), 0.045, 0.025, BELLY, 10))
    for i in range(8):
        y = -0.45 - i * 0.026
        for s in (1, -1):
            parts.append(limb("tooth", (s * 0.03, y, 0.0), (s * 0.034, y, -0.035), 0.008, 0.001, hexcol("#fffbe8"), 5))
    y0 = 0.44
    parts.append(F.fin([(y0 - 0.03, 0.02), (y0 + 0.08, 0.06), (y0 + 0.18, 0.2), (y0 + 0.14, 0.04), (y0 + 0.14, -0.04), (y0 + 0.2, -0.12), (y0 + 0.02, -0.03)], 0.02))
    paddle = [(0, 0), (0.2, 0.05), (0.24, 0.1), (0.04, 0.09)]
    for s in (1, -1):
        for y, sz in ((-0.2, 1.0), (0.18, 0.75)):
            parts.append(prism2d("pad", [(s * x * sz, yy * sz) for x, yy in paddle], 0.02, "XY", (s * 0.06, y, -0.05), FIN))
    parts.append(F.fin([(-0.1, 0.07), (0.02, 0.14), (0.08, 0.06)], 0.02))
    eye = dark_eyes([(s * 0.05, -0.38, 0.055) for s in (1, -1)], 0.018, "#ffd040")
    return [join(parts, "Body"), eye]


def dunkle():
    L, H, W = 1.0, 0.36, 0.26
    pr = F.make_profile(0.4, 0.28, 0.08, 1.3)
    b = F.body(L, H, W, pr, segs=20, rings=18)
    parts = [b]
    # bony head armor
    head = ellipsoid("armor", (0.17, 0.2, 0.17), (0, -0.32, 0.01), lambda c, n: FIN, 18, 12)
    parts.append(head)
    for s in (1, -1):
        parts.append(prism2d("plate", [(0, 0), (0.12, 0.02), (0.1, 0.16), (0.0, 0.14)], 0.03, "YZ", (s * 0.16, -0.36, -0.02), FIN))
    # guillotine jaw blades
    parts.append(prism2d("jawU", [(-0.52, 0.0), (-0.42, 0.06), (-0.34, 0.02)], 0.2, "YZ", (0, 0, -0.02), hexcol("#e8e0d0")))
    parts.append(prism2d("jawL", [(-0.5, -0.02), (-0.42, -0.1), (-0.34, -0.05)], 0.18, "YZ", (0, 0, -0.03), hexcol("#e8e0d0")))
    parts.append(F.forked_tail(0.44, 0.22, 0.22))
    parts.append(F.fin([(-0.05, 0.16), (0.08, 0.3), (0.16, 0.14)], 0.02))
    parts += F.pectorals(-0.12, -0.1, 0.12, 0.14)
    eye = dark_eyes([(s * 0.12, -0.4, 0.07) for s in (1, -1)], 0.028, "#ffcc30")
    return [join(parts, "Body"), eye]


def anomalo():
    body = ellipsoid("body", (0.16, 0.42, 0.06), (0, 0.0, 0.0), back_belly, 20, 12)
    parts = [body]
    for i in range(9):
        y = -0.26 + i * 0.065
        w = 0.2 - abs(i - 3) * 0.012
        for s in (1, -1):
            parts.append(prism2d("flap", [(0, -0.03), (s * w, -0.01), (s * w, 0.035), (0, 0.03)], 0.012, "XY", (s * 0.1, y, 0.0), FIN))
    for s in (1, -1):
        pts = [(s * 0.05, -0.4, 0.0), (s * 0.08, -0.58, -0.02), (s * 0.06, -0.7, -0.08), (s * 0.02, -0.72, -0.14)]
        parts.append(F.tube("claw", pts, [0.03, 0.026, 0.02, 0.012], 6, FIN, False))
        for k in range(4):
            p = Vector(pts[min(3, k + 1)])
            parts.append(limb("spike", p, p + Vector((0, 0.03, -0.05)), 0.008, 0.002, FIN, 5))
        parts.append(limb("stalk", (s * 0.08, -0.34, 0.03), (s * 0.18, -0.4, 0.1), 0.012, 0.012, BACK, 6))
    for k, a in enumerate((-0.5, 0.0, 0.5)):
        parts.append(prism2d("tail", [(0, 0.4), (math.sin(a) * 0.08 - 0.03, 0.56), (math.sin(a) * 0.08 + 0.03, 0.56)], 0.012, "XY", (0, 0, 0.0), FIN))
    eye = dark_eyes([(s * 0.18, -0.41, 0.11) for s in (1, -1)], 0.028)
    return [join(parts, "Body"), eye]


def bonefish():
    parts = []
    n = 16
    spine = [(0, -0.25 + 0.72 * k / (n - 1), 0.02 * math.sin(k * 0.4)) for k in range(n)]
    parts.append(F.tube("spine", spine, [0.022] * n, 6, BACK, True))
    for k in range(2, 11):
        y = spine[k][1]
        h = 0.16 * math.sin(math.pi * (k - 1) / 11) + 0.04
        for s in (1, -1):
            rib = [(0, y, 0.01), (s * h * 0.8, y + 0.02, -h * 0.4), (s * h * 0.55, y + 0.04, -h * 1.1)]
            parts.append(F.tube("rib", rib, [0.012, 0.01, 0.006], 5, BACK, False))
        parts.append(limb("spike", (0, y, 0.02), (0, y + 0.03, 0.05 + h * 0.4), 0.01, 0.003, BACK, 5))
    skull = ellipsoid("skull", (0.1, 0.15, 0.11), (0, -0.33, 0.0), lambda c, n2: BACK, 16, 10)
    jaw = ellipsoid("jaw", (0.08, 0.1, 0.035), (0, -0.4, -0.08), lambda c, n2: BELLY, 12, 8)
    parts += [skull, jaw]
    for k in range(5):
        y = 0.45 + k * 0.02
        parts.append(limb("tailbone", (0, y, 0), (0, y + 0.12, 0.12 - k * 0.06), 0.008, 0.003, FIN, 4))
    glow = join([sphere("Glow", 0.03, (s * 0.06, -0.4, 0.04), hexcol("#ffffff"), segs=8, rings=6) for s in (1, -1)], "Glow")
    return [join(parts, "Body"), glow]


def crystalfish():
    b = ico("body", 1.0, (0, 0, 0), 1, None, 0.08, (0.14, 0.46, 0.22), 11, True)
    paint(b, lambda c, n: BACK if n.z > 0.15 else (BELLY if n.z < -0.4 else (0.5, 0.5, 0, 1)))
    parts = [b]
    shards = [((0, -0.05, 0.18), (0, 0.1, 0.42)), ((0, 0.12, 0.16), (0, 0.24, 0.36)), ((0, 0.3, 0.02), (0, 0.62, 0.22)),
              ((0, 0.3, -0.02), (0, 0.62, -0.2)), ((0, 0.08, -0.18), (0, 0.18, -0.32))]
    for a, c in shards:
        parts.append(limb("shard", a, c, 0.05, 0.002, FIN, 4))
    for s in (1, -1):
        parts.append(limb("pec", (s * 0.1, -0.1, -0.05), (s * 0.28, 0.02, -0.12), 0.035, 0.002, FIN, 4))
    eye = dark_eyes([(s * 0.1, -0.3, 0.06) for s in (1, -1)], 0.028, "#ffffff")
    return [join(parts, "Body"), eye]


def drake():
    L, H, W = 1.0, 0.11, 0.11
    pr = F.make_profile(0.6, 0.18, 0.08, 1.2)
    b = F.body(L, H, W, pr, segs=14, rings=60)
    parts = [b]
    for i in range(14):
        y = -0.36 + i * 0.06
        h = 0.05 * (1 - i / 14) + 0.012
        parts.append(prism2d("sp", [(y - 0.02, 0.04), (y + 0.01, 0.04 + h), (y + 0.02, 0.04)], 0.01, "YZ", (0, 0, 0), FIN))
    for s in (1, -1):
        wing = [(0, 0), (s * 0.34, -0.08), (s * 0.46, 0.02), (s * 0.4, 0.12), (s * 0.28, 0.1), (s * 0.18, 0.16), (0, 0.12)]
        parts.append(prism2d("wing", wing, 0.012, "XY", (s * 0.04, -0.24, 0.04), FIN))
        parts.append(limb("horn", (s * 0.03, -0.42, 0.04), (s * 0.09, -0.34, 0.14), 0.016, 0.002, BELLY, 6))
    parts.append(prism2d("tailfin", [(0.46, 0.0), (0.56, 0.08), (0.6, 0.0), (0.56, -0.08)], 0.012, "YZ", (0, 0, 0), FIN))
    eye = dark_eyes([(s * 0.04, -0.44, 0.03) for s in (1, -1)], 0.014, "#ffe040")
    return [join(parts, "Body"), eye]


def robo():
    parts = []
    for i, (y, w, h) in enumerate(((-0.28, 0.2, 0.26), (-0.06, 0.24, 0.3), (0.16, 0.2, 0.24), (0.34, 0.12, 0.14))):
        seg = box("seg", (w, 0.2, h), (0, y, 0), None, 0.03, 2)
        paint(seg, lambda c, n: BACK if n.z > 0.3 else (BELLY if n.z < -0.3 else FIN if abs(n.y) > 0.9 else BACK))
        parts.append(seg)
    parts.append(prism2d("tail", [(0.4, 0.0), (0.56, 0.14), (0.6, 0.12), (0.52, 0.0), (0.6, -0.12), (0.56, -0.14)], 0.02, "YZ", (0, 0, 0), FIN))
    parts.append(prism2d("dorsal", [(-0.1, 0.15), (0.0, 0.26), (0.1, 0.15)], 0.02, "YZ", (0, 0, 0), FIN))
    parts.append(limb("antenna", (0, -0.3, 0.13), (0, -0.36, 0.3), 0.008, 0.008, FIN, 5))
    for s in (1, -1):
        parts.append(prism2d("pec", [(0, 0), (s * 0.14, 0.04), (s * 0.12, 0.1), (0, 0.06)], 0.015, "XY", (s * 0.12, -0.1, -0.06), FIN))
    glow = join([box("Glow", (0.07, 0.02, 0.05), (s * 0.07, -0.38, 0.04), hexcol("#ffffff"), 0.0, 1) for s in (1, -1)]
                + [sphere("bulb", 0.025, (0, -0.36, 0.31), hexcol("#ffffff"), segs=8, rings=6)], "Glow")
    return [join(parts, "Body"), glow]


PIXEL_ART = [
    "....##......",
    "..######...#",
    ".#o######.##",
    "############",
    ".#########.#",
    "..######...#",
    "....##......",
]


def pixel():
    parts = []
    rows = len(PIXEL_ART)
    cols = len(PIXEL_ART[0])
    s = 1.0 / cols
    for r, line in enumerate(PIXEL_ART):
        for c, ch in enumerate(line):
            if ch == ".":
                continue
            y = -0.5 + (c + 0.5) * s
            z = ((rows - 1) / 2 - r) * s
            col = FIN if c >= cols - 2 or r in (0, rows - 1) else (BACK if r < rows // 2 else BELLY)
            if ch == "o":
                col = BACK
            parts.append(box("px", (0.16, s * 1.001, s * 1.001), (0, y, z), col, 0.0, 1))
    eye = join([box("e", (0.17, s * 0.5, s * 0.5), (0, -0.5 + 2.5 * s, 1.0 * s), hexcol("#101418"), 0.0, 1)], "Eye")
    return [join(parts, "Body"), eye]


ARCHETYPES = {
    "ammonite": ammonite, "trilobite": trilobite, "plesio": plesio, "mosasaur": mosasaur, "dunkle": dunkle,
    "anomalo": anomalo, "bonefish": bonefish, "crystalfish": crystalfish, "drake": drake, "robo": robo, "pixel": pixel,
}


def build(outdir, only=None):
    for name, fn in ARCHETYPES.items():
        if only and name not in only and "fish3" not in only:
            continue
        reset()
        export("fish_" + name, fn(), outdir)
