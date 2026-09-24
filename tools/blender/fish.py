"""Fish archetype meshes.

Each archetype exports a "Body" mesh whose vertex color is a mask the game recolors per
species: R = back, G = belly, B = fins/accents. Optional "Eye" (real colors) and "Glow"
(emissive lure bulbs) meshes are separate objects. Length is ~1 unit, head toward -Y
(game +Z), so the swim shader can bend along the length axis.
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector

from lib import (export, hexcol, join, limb, paint, paint_verts, prism2d, reset, smooth,
                 sphere, to_obj)

FIN = (0.0, 0.0, 1.0, 1.0)
BACK = (1.0, 0.0, 0.0, 1.0)
BELLY = (0.0, 1.0, 0.0, 1.0)


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def make_profile(head_exp=0.5, peak=0.32, ped=0.1, taper=1.6):
    def prof(t):
        if t < peak:
            u = (peak - t) / peak
            return max(0.0, 1 - u * u) ** head_exp
        v = (t - peak) / (1 - peak)
        return 1 - (1 - ped) * v ** taper
    return prof


def body(length=1.0, height=0.3, width=0.16, prof=None, segs=20, rings=18, belly_flat=0.92, arch=0.0):
    prof = prof or make_profile()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=0.5)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "X"), verts=bm.verts)
    for v in bm.verts:
        x, y, z = v.co
        t = y + 0.5
        r0 = math.sqrt(max(0.0, 0.25 - y * y))
        if r0 > 1e-5:
            dx, dz = x / r0, z / r0
            p = prof(t)
            v.co.x = dx * width / 2 * p
            v.co.z = dz * height / 2 * p * (belly_flat if dz < 0 else 1.0) + arch * math.sin(math.pi * t) * height
        v.co.y = y * length
    ob = to_obj("Body", bm)
    smooth(ob)

    def mask(co, n):
        back = smoothstep(-0.35, 0.35, n.z)
        return (back, 1 - back, 0.0, 1.0)

    paint_verts(ob, mask)
    return ob


def surface_point(length, height, width, prof, t, side=1, up=0.2):
    p = prof(t)
    y = (t - 0.5) * length
    ang = up * math.pi / 2
    return Vector((side * width / 2 * p * math.cos(ang), y, height / 2 * p * math.sin(ang)))


def eyes(length, height, width, prof, t=0.14, up=0.25, r=0.055, pupil=0.6, white=True, count=2):
    parts = []
    for side in (1, -1) if count == 2 else (1,):
        c = surface_point(length, height, width, prof, t, side, up)
        c.x += side * r * 0.25
        if white:
            parts.append(sphere("eyew", r, c, hexcol("#ffffff"), segs=12, rings=8))
        pc = c + Vector((side * r * 0.55, -r * 0.25, r * 0.1))
        parts.append(sphere("eyep", r * pupil, pc, hexcol("#101418"), segs=10, rings=6))
    return join(parts, "Eye")


def fin(pts, thick=0.02, plane="YZ", loc=(0, 0, 0), rot=None):
    return prism2d("fin", pts, thick, plane, loc, FIN, rot)


def tube(name, pts, radii, segs=8, color=None, cap=True):
    bm = bmesh.new()
    pts = [Vector(p) for p in pts]
    rings = []
    prev_n = None
    for i, p in enumerate(pts):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == len(pts) - 1:
            t = pts[-1] - pts[-2]
        else:
            t = pts[i + 1] - pts[i - 1]
        t.normalize()
        if prev_n is None:
            a = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            n = t.cross(a).normalized()
        else:
            n = (prev_n - t * prev_n.dot(t)).normalized()
        b = t.cross(n)
        prev_n = n
        r = max(0.002, radii[i])
        rings.append([bm.verts.new(p + (n * math.cos(a) + b * math.sin(a)) * r)
                      for a in (k / segs * math.tau for k in range(segs))])
    for i in range(len(rings) - 1):
        for k in range(segs):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = to_obj(name, bm)
    smooth(ob)
    if color is not None:
        paint(ob, (lambda c, n: color) if not callable(color) else color)
    return ob


def ribbon(ys, bottoms, tops, thick=0.015):
    """A long fin built as a quad strip so it bends smoothly with the swim shader."""
    bm = bmesh.new()
    h = thick / 2
    cols = []
    for y, b, t in zip(ys, bottoms, tops):
        cols.append([bm.verts.new((s, y, z)) for s in (h, -h) for z in (b, t)])
    # per column: [0]=+x bottom, [1]=+x top, [2]=-x bottom, [3]=-x top
    for i in range(len(cols) - 1):
        a, c = cols[i], cols[i + 1]
        bm.faces.new((a[0], c[0], c[1], a[1]))
        bm.faces.new((a[3], c[3], c[2], a[2]))
        bm.faces.new((a[1], c[1], c[3], a[3]))
        bm.faces.new((a[2], c[2], c[0], a[0]))
    bm.faces.new((cols[0][0], cols[0][1], cols[0][3], cols[0][2]))
    bm.faces.new((cols[-1][2], cols[-1][3], cols[-1][1], cols[-1][0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = to_obj("ribbon", bm)
    smooth(ob, False)
    paint(ob, lambda c, n: FIN)
    return ob


def pectorals(y, z, x, size=0.12, angle=60):
    pts = [(0, 0), (size, size * 0.5), (size * 0.8, size * 1.2), (0.0, size * 0.5)]
    out = []
    for side in (1, -1):
        f = prism2d("pec", [(side * u, v) for u, v in pts], 0.012, "XY", (side * x, y, z), FIN,
                    (math.radians(-angle * 0.5), math.radians(side * -25), 0))
        out.append(f)
    return out


def forked_tail(y0, h=0.21, depth=0.2, fork=0.1, thick=0.02):
    return fin([(y0 - 0.02, 0.03), (y0 + depth * 0.5, h * 0.8), (y0 + depth, h), (y0 + depth * 0.7, h * 0.38),
                (y0 + fork, 0), (y0 + depth * 0.7, -h * 0.38), (y0 + depth, -h), (y0 + depth * 0.5, -h * 0.8),
                (y0 - 0.02, -0.03)], thick)


def fan_tail(y0, h=0.2, depth=0.2, thick=0.02):
    return fin([(y0 - 0.02, 0.05), (y0 + depth * 0.8, h), (y0 + depth, h * 0.5), (y0 + depth * 1.05, 0),
                (y0 + depth, -h * 0.5), (y0 + depth * 0.8, -h), (y0 - 0.02, -0.05)], thick)


# ------------------------------------------------------------------ archetypes

def slim():
    L, H, W = 1.0, 0.28, 0.16
    pr = make_profile(0.6, 0.32, 0.1)
    b = body(L, H, W, pr)
    parts = [b, forked_tail(0.44),
             fin([(-0.12, 0.1), (-0.02, 0.24), (0.06, 0.21), (0.14, 0.08)]),
             fin([(0.12, -0.08), (0.2, -0.16), (0.26, -0.06)])]
    parts += pectorals(-0.2, -0.04, 0.06)
    return [join(parts, "Body"), eyes(L, H, W, pr, 0.13, 0.25, 0.05)]


def tall():
    L, H, W = 1.0, 0.56, 0.2
    pr = make_profile(0.7, 0.38, 0.14)
    b = body(L, H, W, pr)
    parts = [b, fan_tail(0.44, 0.2, 0.2),
             fin([(-0.22, 0.2), (-0.14, 0.38), (0.0, 0.37), (0.14, 0.34), (0.3, 0.2), (0.3, 0.1)]),
             fin([(0.05, -0.2), (0.22, -0.32), (0.3, -0.1)])]
    parts += pectorals(-0.12, -0.05, 0.08, 0.14)
    return [join(parts, "Body"), eyes(L, H, W, pr, 0.14, 0.3, 0.06)]


def round_():
    L, H, W = 0.9, 0.64, 0.62
    pr = make_profile(0.35, 0.45, 0.22, 2.2)
    b = body(L, H, W, pr, segs=24, rings=18)
    parts = [b, fan_tail(0.38, 0.13, 0.14), fin([(0.05, 0.25), (0.14, 0.34), (0.22, 0.2)]),
             fin([(0.05, -0.25), (0.14, -0.34), (0.22, -0.2)])]
    parts += pectorals(-0.08, 0.0, 0.26, 0.1)
    rnd = random.Random(3)
    me = b.data
    for v in me.vertices:
        t = v.co.y / L + 0.5
        if 0.12 < t < 0.8 and rnd.random() < 0.18:
            n = v.normal.normalized()
            parts.append(limb("spike", v.co - n * 0.01, v.co + n * 0.09, 0.022, 0.002, FIN, 6))
    return [join(parts, "Body"), eyes(L, H, W, pr, 0.18, 0.35, 0.08)]


def eel():
    L, H, W = 1.0, 0.1, 0.085
    pr = make_profile(0.6, 0.12, 0.08, 1.3)
    b = body(L, H, W, pr, segs=12, rings=44)
    n = 16
    ys = [-0.3 + 0.8 * i / (n - 1) for i in range(n)]
    tops = [0.035 + 0.04 * math.sin(math.pi * min(1, (y + 0.3) / 0.75)) ** 0.5 for y in ys]
    parts = [b, ribbon(ys, [0.015] * n, tops), ribbon(ys[6:], [-0.015] * (n - 6), [-t for t in tops[6:]])]
    parts += pectorals(-0.36, -0.01, 0.035, 0.05)
    return [join(parts, "Body"), eyes(L, H, W, pr, 0.06, 0.4, 0.022, 0.7)]


def shark():
    L, H, W = 1.0, 0.26, 0.2
    pr = make_profile(0.9, 0.35, 0.09)
    b = body(L, H, W, pr, belly_flat=0.8)
    y0 = 0.44
    parts = [b,
             fin([(y0 - 0.03, 0.03), (y0 + 0.1, 0.14), (y0 + 0.24, 0.3), (y0 + 0.2, 0.2), (y0 + 0.1, 0.0),
                  (y0 + 0.16, -0.13), (y0 + 0.02, -0.04)]),
             fin([(-0.06, 0.1), (0.07, 0.32), (0.15, 0.3), (0.17, 0.09)], 0.025),
             fin([(0.25, 0.05), (0.3, 0.1), (0.34, 0.04)])]
    parts += pectorals(-0.12, -0.08, 0.07, 0.2, 50)
    return [join(parts, "Body"), eyes(L, H, W, pr, 0.12, 0.25, 0.025, 0.95, white=False)]


def ray():
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=16, radius=0.5)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "X"), verts=bm.verts)
    for v in bm.verts:
        v.co.y *= 0.7
        v.co.z *= 0.11
        ax = abs(v.co.x)
        if ax > 0.15:
            v.co.y += (ax - 0.15) * 0.45
            v.co.x *= 1.0 + (ax - 0.15) * 0.5
            v.co.z += (ax - 0.15) * 0.08
    b = to_obj("Body", bm)
    smooth(b)
    paint_verts(b, lambda co, n: (smoothstep(-0.3, 0.3, n.z), 1 - smoothstep(-0.3, 0.3, n.z), 0, 1))
    n = 10
    tail = tube("tail", [(0, 0.3 + 0.7 * i / (n - 1), 0.0) for i in range(n)],
                [0.03 * (1 - i / (n - 1)) + 0.003 for i in range(n)], 6, FIN)
    parts = [b, tail]
    eye = join([sphere("e", 0.035, (s * 0.09, -0.2, 0.045), hexcol("#101418"), segs=8, rings=6) for s in (1, -1)], "Eye")
    return [join(parts, "Body"), eye]


def jelly():
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=0.5)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.04], context="VERTS")
    for v in bm.verts:
        v.co.z *= 0.75
    dome = to_obj("dome", bm)
    smooth(dome)
    paint_verts(dome, lambda co, n: (1, 0, 0, 1))
    parts = [dome]
    rnd = random.Random(5)
    for i in range(10):
        a = i / 10 * math.tau
        r = 0.42
        pts = []
        for k in range(12):
            s = k / 11
            pts.append((math.cos(a) * r * (1 - 0.3 * s) + 0.05 * math.sin(s * 9 + i),
                        math.sin(a) * r * (1 - 0.3 * s) + 0.05 * math.cos(s * 7 + i),
                        -0.02 - s * (1.1 + rnd.random() * 0.4)))
        parts.append(tube("t", pts, [0.018 * (1 - k / 11) + 0.004 for k in range(12)], 5, FIN, False))
    for i in range(4):
        a = i / 4 * math.tau + 0.4
        pts = [(math.cos(a) * 0.08 * (1 + s) + 0.04 * math.sin(s * 6 + i), math.sin(a) * 0.08 * (1 + s), -0.02 - s * 0.8)
               for s in (k / 9 for k in range(10))]
        parts.append(tube("arm", pts, [0.06 * (1 - k / 9) + 0.01 for k in range(10)], 7, BELLY, False))
    return [join(parts, "Body")]


def squid():
    L, H, W = 0.62, 0.22, 0.22
    pr = make_profile(1.2, 0.72, 0.62, 2.0)
    mantle = body(L, H, W, pr, segs=18, rings=16)
    for v in mantle.data.vertices:
        v.co.y -= 0.18
    head = sphere("head", 0.12, (0, 0.17, 0), BELLY, (0.95, 1.0, 0.85))
    parts = [mantle, head,
             prism2d("finL", [(0, -0.48), (0.2, -0.36), (0, -0.25)], 0.012, "XY", (0.02, 0, 0), FIN),
             prism2d("finR", [(0, -0.48), (-0.2, -0.36), (0, -0.25)], 0.012, "XY", (-0.02, 0, 0), FIN)]
    for i in range(8):
        a = i / 8 * math.tau
        pts = [(math.cos(a) * 0.07 * (1 + s * 0.8), 0.22 + s * 0.45, math.sin(a) * 0.06 * (1 + s * 0.8) + 0.02 * math.sin(s * 5 + i))
               for s in (k / 9 for k in range(10))]
        parts.append(tube("arm", pts, [0.03 * (1 - k / 9) + 0.004 for k in range(10)], 6, FIN, False))
    for side in (1, -1):
        pts = [(side * 0.03, 0.22 + s * 0.8, -0.02) for s in (k / 11 for k in range(12))]
        parts.append(tube("tent", pts, [0.014 if k < 9 else 0.03 for k in range(12)], 6, FIN, False))
    eye = join([sphere("ew", 0.055, (s * 0.1, 0.14, 0.03), hexcol("#fff6d8"), segs=10, rings=8) for s in (1, -1)]
               + [sphere("ep", 0.035, (s * 0.135, 0.13, 0.035), hexcol("#101418"), segs=8, rings=6) for s in (1, -1)], "Eye")
    return [join(parts, "Body"), eye]


def angler():
    L, H, W = 0.8, 0.62, 0.52
    pr = make_profile(0.28, 0.3, 0.16, 1.4)
    b = body(L, H, W, pr, segs=24, rings=18)
    parts = [b, fan_tail(0.34, 0.16, 0.16), fin([(0.0, 0.26), (0.12, 0.32), (0.22, 0.18)])]
    parts += pectorals(-0.02, -0.12, 0.22, 0.12)
    teeth = []
    for i in range(11):
        a = (i / 10 - 0.5) * math.pi * 0.85
        x = math.sin(a) * 0.2
        y = -0.36 + (1 - math.cos(a)) * 0.12
        teeth.append(limb("tooth", (x, y, -0.03), (x, y - 0.02, 0.07), 0.018, 0.002, hexcol("#fffbe8"), 6))
        teeth.append(limb("tooth", (x * 0.9, y + 0.01, 0.07), (x * 0.9, y - 0.01, -0.02), 0.015, 0.002, hexcol("#fffbe8"), 6))
    n = 12
    stalk = [(0, -0.12 - 0.35 * math.sin(s * 1.4), 0.27 + 0.18 * math.sin(s * math.pi * 0.8))
             for s in (k / (n - 1) for k in range(n))]
    parts.append(tube("stalk", stalk, [0.014] * n, 6, FIN, False))
    glow = sphere("Glow", 0.055, stalk[-1], hexcol("#ffffff"), segs=12, rings=8)
    eye = eyes(L, H, W, pr, 0.2, 0.45, 0.04, 0.7)
    return [join(parts, "Body"), join([eye] + teeth, "Eye"), glow]


def whale():
    L, H, W = 1.0, 0.3, 0.3
    pr = make_profile(0.45, 0.3, 0.07, 1.4)
    b = body(L, H, W, pr, segs=22, rings=20, belly_flat=0.85)
    fl = [(0, 0.44), (0.12, 0.5), (0.26, 0.6), (0.2, 0.63), (0.06, 0.57), (0, 0.6),
          (-0.06, 0.57), (-0.2, 0.63), (-0.26, 0.6), (-0.12, 0.5)]
    parts = [b, prism2d("fluke", fl, 0.02, "XY", (0, 0, 0), FIN),
             fin([(0.1, 0.1), (0.2, 0.17), (0.24, 0.08)])]
    for side in (1, -1):
        pts = [(0, 0), (side * 0.22, 0.1), (side * 0.26, 0.16), (side * 0.04, 0.12)]
        parts.append(prism2d("flip", pts, 0.02, "XY", (side * 0.1, -0.15, -0.08), FIN,
                             (math.radians(side * 0), math.radians(side * -30), 0)))
    return [join(parts, "Body"), eyes(L, H, W, pr, 0.2, -0.05, 0.028, 0.9, white=False)]


def sword():
    L, H, W = 1.0, 0.25, 0.14
    pr = make_profile(0.85, 0.3, 0.08)
    b = body(L, H, W, pr)
    bill = limb("bill", (0, -0.47, 0.0), (0, -0.9, 0.0), 0.022, 0.003, BACK, 8)
    y0 = 0.44
    n = 10
    ys = [-0.3 + 0.45 * i / (n - 1) for i in range(n)]
    tops = [0.08 + 0.3 * math.sin(math.pi * (i / (n - 1))) ** 0.6 * (1 - 0.5 * i / (n - 1)) for i in range(n)]
    parts = [b, bill, ribbon(ys, [0.06] * n, tops),
             fin([(y0 - 0.02, 0.03), (y0 + 0.08, 0.2), (y0 + 0.2, 0.32), (y0 + 0.12, 0.12), (y0 + 0.08, 0),
                  (y0 + 0.12, -0.12), (y0 + 0.2, -0.32), (y0 + 0.08, -0.2), (y0 - 0.02, -0.03)])]
    parts += pectorals(-0.18, -0.06, 0.05, 0.14)
    return [join(parts, "Body"), eyes(L, H, W, pr, 0.1, 0.2, 0.04)]


def eyeball():
    b = sphere("ball", 0.3, (0, 0, 0), None, segs=24, rings=16)
    paint_verts(b, lambda co, n: (0, 1, 0, 1) if n.y < -0.72 else (1, 0, 0, 1))
    parts = [b]
    for i in range(7):
        a = i / 7 * math.tau
        pts = [(math.cos(a) * 0.15 * (1 + s * 0.6) + 0.06 * math.sin(s * 7 + i), 0.2 + s * 0.8,
                math.sin(a) * 0.15 * (1 + s * 0.6) + 0.06 * math.cos(s * 6 + i)) for s in (k / 11 for k in range(12))]
        parts.append(tube("t", pts, [0.05 * (1 - k / 11) + 0.006 for k in range(12)], 6, FIN, False))
    pupil = sphere("Eye", 0.12, (0, -0.24, 0), hexcol("#07060a"), (1, 0.4, 1), segs=16, rings=8)
    return [join(parts, "Body"), pupil]


ARCHETYPES = {
    "slim": slim, "tall": tall, "round": round_, "eel": eel, "shark": shark, "ray": ray,
    "jelly": jelly, "squid": squid, "angler": angler, "whale": whale, "sword": sword, "eyeball": eyeball,
}


def build(outdir):
    for name, fn in ARCHETYPES.items():
        reset()
        objs = fn()
        export("fish_" + name, objs, outdir)
