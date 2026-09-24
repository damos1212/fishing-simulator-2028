"""Expansion creature archetypes: crustaceans, turtles, octopus, seahorse, starfish,
serpent, dolphin and junk. Same conventions as fish.py (mask colors, head toward -Y)."""
import math

import bmesh
from mathutils import Matrix, Vector

import fish as F
from fish import BACK, BELLY, FIN, smoothstep
from lib import export, hexcol, join, limb, paint, paint_verts, prism2d, reset, smooth, sphere, to_obj


def ellipsoid(name, r, loc, mask_fn=None, segs=20, rings=14):
    ob = sphere(name, 1.0, loc, None, r, segs, rings)
    if mask_fn:
        paint_verts(ob, mask_fn)
    return ob


def back_belly(co, n):
    b = smoothstep(-0.3, 0.3, n.z)
    return (b, 1 - b, 0, 1)


def leg(p1, p2, p3, r=0.03):
    return F.tube("leg", [p1, p2, p3], [r, r * 0.8, r * 0.4], 6, FIN, False)


def crab():
    body = ellipsoid("body", (0.34, 0.26, 0.14), (0, 0, 0.14), back_belly, 24, 14)
    parts = [body]
    for s in (1, -1):
        for i in range(3):
            y = -0.08 + i * 0.1
            parts.append(leg((s * 0.26, y, 0.12), (s * 0.48, y + 0.02, 0.2), (s * 0.6, y + 0.06, 0.0), 0.028))
        # claw arm + pincer
        parts.append(F.tube("arm", [(s * 0.2, -0.18, 0.14), (s * 0.34, -0.34, 0.2), (s * 0.3, -0.48, 0.16)], [0.04, 0.04, 0.035], 7, FIN, False))
        parts.append(ellipsoid("claw", (0.09, 0.13, 0.07), (s * 0.3, -0.56, 0.16), lambda c, n: FIN, 12, 8))
        parts.append(prism2d("pin", [(-0.03, -0.64), (0.03, -0.64), (0.0, -0.76)], 0.05, "XY", (s * 0.3 + s * 0.04, 0, 0.17), FIN))
        parts.append(limb("stalk", (s * 0.08, -0.22, 0.2), (s * 0.1, -0.26, 0.32), 0.015, 0.015, FIN, 6))
    eye = join([sphere("e", 0.04, (s * 0.1, -0.26, 0.34), hexcol("#101418"), segs=8, rings=6) for s in (1, -1)], "Eye")
    return [join(parts, "Body"), eye]


def lobster():
    parts = [ellipsoid("cara", (0.13, 0.22, 0.1), (0, -0.12, 0.1), back_belly)]
    for i in range(5):
        y = 0.1 + i * 0.09
        parts.append(ellipsoid("seg", (0.11 - i * 0.012, 0.06, 0.07 - i * 0.006), (0, y, 0.09 - i * 0.008), back_belly, 14, 8))
    parts.append(prism2d("fan", [(0.0, 0.52), (0.14, 0.66), (0.0, 0.62), (-0.14, 0.66)], 0.02, "XY", (0, 0, 0.06), FIN))
    for s in (1, -1):
        for i in range(4):
            y = -0.2 + i * 0.07
            parts.append(leg((s * 0.1, y, 0.06), (s * 0.24, y, 0.08), (s * 0.3, y + 0.03, -0.04), 0.018))
        parts.append(F.tube("arm", [(s * 0.1, -0.3, 0.1), (s * 0.2, -0.42, 0.12), (s * 0.18, -0.52, 0.12)], [0.03, 0.03, 0.03], 6, FIN, False))
        parts.append(ellipsoid("claw", (0.07, 0.14, 0.05), (s * 0.18, -0.64, 0.12), lambda c, n: FIN, 12, 8))
        parts.append(F.tube("ant", [(s * 0.04, -0.32, 0.14), (s * 0.18, -0.6, 0.3), (s * 0.3, -0.8, 0.28)], [0.008, 0.006, 0.003], 4, FIN, False))
    eye = join([sphere("e", 0.03, (s * 0.06, -0.33, 0.18), hexcol("#101418"), segs=8, rings=6) for s in (1, -1)], "Eye")
    return [join(parts, "Body"), eye]


def turtle():
    def shell_mask(c, n):
        return (1, 0, 0, 1) if c.z > 0.07 else (0, 1, 0, 1)
    shell = sphere("shell", 1.0, (0, 0.02, 0.06), None, (0.36, 0.44, 0.2), 24, 14)
    for v in shell.data.vertices:
        if v.co.z < 0.04:
            v.co.z = 0.04 + (v.co.z - 0.04) * 0.25
    paint_verts(shell, shell_mask)
    parts = [shell, ellipsoid("head", (0.1, 0.13, 0.09), (0, -0.5, 0.08), back_belly),
             F.tube("neck", [(0, -0.3, 0.06), (0, -0.42, 0.08)], [0.07, 0.07], 8, BELLY, False)]
    front = [(0, 0), (0.42, 0.1), (0.5, 0.2), (0.1, 0.16)]
    back = [(0, 0), (0.18, 0.08), (0.2, 0.16), (0.02, 0.12)]
    for s in (1, -1):
        parts.append(prism2d("ff", [(s * x, y) for x, y in front], 0.03, "XY", (s * 0.28, -0.2, 0.04), FIN))
        parts.append(prism2d("bf", [(s * x, y) for x, y in back], 0.03, "XY", (s * 0.25, 0.28, 0.04), FIN))
    parts.append(F.tube("tail", [(0, 0.4, 0.05), (0, 0.5, 0.04)], [0.04, 0.01], 6, BELLY, False))
    eye = join([sphere("e", 0.025, (s * 0.07, -0.58, 0.12), hexcol("#101418"), segs=8, rings=6) for s in (1, -1)], "Eye")
    return [join(parts, "Body"), eye]


def octopus():
    mantle = sphere("mantle", 1.0, (0, -0.22, 0.02), None, (0.22, 0.3, 0.22), 20, 14)
    paint_verts(mantle, back_belly)
    head = sphere("head", 0.14, (0, 0.05, 0), None, segs=16, rings=10)
    paint_verts(head, lambda c, n: (0, 1, 0, 1))
    parts = [mantle, head]
    for i in range(8):
        a = i / 8 * math.tau
        pts = []
        for k in range(12):
            s = k / 11
            r = 0.1 + s * 0.35
            pts.append((math.cos(a) * r * 0.8, 0.1 + s * 0.75, math.sin(a) * r * 0.6 + 0.05 * math.sin(s * 6 + i)))
        parts.append(F.tube("arm", pts, [0.055 * (1 - s) + 0.008 for s in (k / 11 for k in range(12))], 7, FIN, False))
    eye = join([sphere("ew", 0.05, (s * 0.12, 0.02, 0.07), hexcol("#fff6d8"), segs=10, rings=8) for s in (1, -1)]
               + [sphere("ep", 0.03, (s * 0.15, 0.0, 0.08), hexcol("#101418"), segs=8, rings=6) for s in (1, -1)], "Eye")
    return [join(parts, "Body"), eye]


def seahorse():
    n = 18
    pts, rad = [], []
    for k in range(n):
        s = k / (n - 1)
        z = 0.5 - s * 0.95
        y = 0.08 * math.sin(s * math.pi * 1.3) - 0.02
        if s > 0.72:
            t = (s - 0.72) / 0.28
            y = 0.02 + math.sin(t * math.pi * 1.4) * 0.12
            z = -0.2 - math.sin(t * math.pi * 0.9) * 0.18
        pts.append((0, y, z))
        rad.append(0.1 * math.sin(math.pi * min(1, s * 1.6 + 0.2)) ** 0.7 * (1 - 0.8 * max(0, s - 0.6)) + 0.01)
    body = F.tube("body", pts, rad, 10, None, True)
    paint_verts(body, lambda c, n2: (smoothstep(-0.3, 0.3, n2.y), 1 - smoothstep(-0.3, 0.3, n2.y), 0, 1))
    head = sphere("head", 1.0, (0, -0.06, 0.52), None, (0.07, 0.1, 0.08), 12, 8)
    paint_verts(head, lambda c, n2: (1, 0, 0, 1))
    snout = limb("snout", (0, -0.12, 0.52), (0, -0.28, 0.48), 0.03, 0.022, BACK, 8)
    fin = prism2d("dorsal", [(0.06, 0.2), (0.16, 0.26), (0.14, 0.05), (0.06, 0.08)], 0.015, "YZ", (0, 0, 0), FIN)
    crest = prism2d("crest", [(-0.02, 0.58), (0.02, 0.66), (0.06, 0.58)], 0.02, "YZ", (0, 0, 0), FIN)
    eye = join([sphere("e", 0.022, (s * 0.06, -0.1, 0.55), hexcol("#101418"), segs=8, rings=6) for s in (1, -1)], "Eye")
    return [join([body, head, snout, fin, crest], "Body"), eye]


def starfish():
    bm = bmesh.new()
    N = 60
    top = bm.verts.new((0, 0, 0.1))
    bot = bm.verts.new((0, 0, -0.02))
    ring_t, ring_b = [], []
    for i in range(N):
        a = i / N * math.tau
        r = 0.18 + 0.32 * (0.5 + 0.5 * math.cos(a * 5)) ** 2.5
        ring_t.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0.02 + 0.03 * (r / 0.5))))
        ring_b.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0.0)))
    for i in range(N):
        j = (i + 1) % N
        bm.faces.new((top, ring_t[i], ring_t[j]))
        bm.faces.new((bot, ring_b[j], ring_b[i]))
        bm.faces.new((ring_t[i], ring_b[i], ring_b[j], ring_t[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = to_obj("Body", bm)
    smooth(ob)
    paint_verts(ob, lambda c, n: (1, 0, 0, 1) if n.z > -0.3 else (0, 1, 0, 1))
    bumps = []
    for i in range(5):
        a = i / 5 * math.tau
        for k in range(3):
            r = 0.12 + k * 0.1
            bumps.append(sphere("b", 0.025, (math.cos(a) * r, math.sin(a) * r, 0.07 - k * 0.012), FIN, segs=6, rings=4))
    return [join([ob] + bumps, "Body")]


def serpent():
    L, H, W = 1.0, 0.07, 0.07
    pr = F.make_profile(0.7, 0.08, 0.1, 1.1)
    b = F.body(L, H, W, pr, segs=14, rings=72)
    parts = [b]
    for i in range(18):
        y = -0.4 + i * 0.05
        h = 0.035 * (1 - i / 18) + 0.01
        parts.append(prism2d("sp", [(y - 0.015, 0.025), (y, 0.025 + h), (y + 0.015, 0.025)], 0.01, "YZ", (0, 0, 0), FIN))
    for s in (1, -1):
        parts.append(limb("horn", (s * 0.02, -0.44, 0.03), (s * 0.05, -0.4, 0.09), 0.012, 0.002, FIN, 6))
        parts.append(prism2d("frill", [(-0.46, 0.0), (-0.4, 0.06 * s), (-0.36, 0.0)], 0.008, "XZ", (0, 0, 0), FIN))
    eye = join([sphere("e", 0.012, (s * 0.028, -0.46, 0.018), hexcol("#ffd040"), segs=8, rings=6) for s in (1, -1)], "Eye")
    return [join(parts, "Body"), eye]


def dolphin():
    L, H, W = 1.0, 0.24, 0.22
    pr = F.make_profile(0.6, 0.35, 0.08, 1.5)
    b = F.body(L, H, W, pr, segs=22, rings=20)
    beak = limb("beak", (0, -0.46, -0.03), (0, -0.6, -0.04), 0.045, 0.03, BELLY, 10)
    fl = [(0, 0.44), (0.1, 0.5), (0.2, 0.58), (0.14, 0.6), (0.04, 0.55), (0, 0.58), (-0.04, 0.55), (-0.14, 0.6), (-0.2, 0.58), (-0.1, 0.5)]
    parts = [b, beak, prism2d("fluke", fl, 0.02, "XY", (0, 0, 0), FIN),
             F.fin([(-0.05, 0.1), (0.08, 0.26), (0.14, 0.22), (0.16, 0.09)], 0.02)]
    parts += F.pectorals(-0.15, -0.08, 0.08, 0.14, 55)
    eye = join([sphere("e", 0.022, (s * 0.085, -0.36, 0.02), hexcol("#101418"), segs=8, rings=6) for s in (1, -1)], "Eye")
    return [join(parts, "Body"), eye]


def boot():
    parts = [box_mask("sole", (0.24, 0.62, 0.06), (0, -0.05, 0.03), (0, 0, 1, 1)),
             box_mask("foot", (0.22, 0.5, 0.16), (0, -0.08, 0.13), BACK),
             box_mask("toe", (0.21, 0.16, 0.12), (0, -0.33, 0.1), BACK),
             box_mask("shaft", (0.22, 0.22, 0.5), (0, 0.15, 0.4), BACK),
             box_mask("cuff", (0.24, 0.24, 0.06), (0, 0.15, 0.66), BELLY)]
    for i in range(4):
        parts.append(box_mask("lace", (0.23, 0.02, 0.02), (0, -0.1 + i * 0.07, 0.22 + i * 0.07), (0, 0, 1, 1)))
    return [join(parts, "Body")]


def box_mask(name, size, loc, col):
    from lib import box
    return box(name, size, loc, col, 0.03, 2)


def bottle():
    from lib import cyl
    parts = [cyl("glass", 0.12, 0.12, 0.42, (0, 0, 0), BACK, 16, (math.radians(90), 0, 0)),
             cyl("shoulder", 0.12, 0.05, 0.1, (0, -0.26, 0), BACK, 16, (math.radians(90), 0, 0)),
             cyl("neck", 0.045, 0.045, 0.12, (0, -0.36, 0), BACK, 12, (math.radians(90), 0, 0)),
             cyl("cork", 0.05, 0.042, 0.07, (0, -0.44, 0), (0, 0, 1, 1), 12, (math.radians(90), 0, 0)),
             cyl("paper", 0.07, 0.07, 0.3, (0, 0.02, 0), BELLY, 12, (math.radians(90), 0, 0))]
    parts[-1].scale = (1, 1, 1)
    return [join(parts, "Body")]


def duck():
    parts = [sphere("body", 1.0, (0, 0.05, 0.12), BACK, (0.26, 0.34, 0.2), 20, 14),
             sphere("head", 0.15, (0, -0.2, 0.36), BACK, segs=16, rings=12),
             sphere("beak", 1.0, (0, -0.36, 0.33), (0, 0, 1, 1), (0.08, 0.08, 0.035), 12, 8),
             sphere("tail", 1.0, (0, 0.34, 0.2), BACK, (0.08, 0.1, 0.06), 10, 8),
             sphere("wingL", 1.0, (0.2, 0.08, 0.16), BELLY, (0.06, 0.18, 0.1), 12, 8),
             sphere("wingR", 1.0, (-0.2, 0.08, 0.16), BELLY, (0.06, 0.18, 0.1), 12, 8)]
    eye = join([sphere("e", 0.03, (s * 0.08, -0.31, 0.41), hexcol("#101418"), segs=8, rings=6) for s in (1, -1)], "Eye")
    return [join(parts, "Body"), eye]


ARCHETYPES = {
    "crab": crab, "lobster": lobster, "turtle": turtle, "octopus": octopus, "seahorse": seahorse, "starfish": starfish,
    "serpent": serpent, "dolphin": dolphin, "boot": boot, "bottle": bottle, "duck": duck,
}


def build(outdir, only=None):
    for name, fn in ARCHETYPES.items():
        if only and name not in only and "fish2" not in only:
            continue
        reset()
        export("fish_" + name, fn(), outdir)
