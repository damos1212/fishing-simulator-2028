"""Boat, fisherman, lure, harbor buildings and zone props."""
import math
import random

import bmesh
from mathutils import Matrix, Vector

import fish as F
from lib import (bake_transform, box, color_attr, cyl, empty, export, hexcol, ico, join, limb,
                 paint, prism2d, reset, set_origin, smooth, solid, sphere, text_mesh, to_obj, torus)

C = hexcol
WOOD = C("#a8764a")
WOOD_D = C("#6b4a2e")
WHITE = C("#f7f3e8")
RED = C("#d64933")
NAVY = C("#2f5d8a")
TAN = C("#c8a26b")
GLASS = C("#8fd3e0")
METAL = C("#9aa3ad")
DARK = C("#2b2b2b")
YELLOW = C("#f4c430")


def remap(ob, back, belly, fin):
    """Convert a fish mask (R/G/B) into real colors, for decorative fish."""
    attr = color_attr(ob)
    for d in attr.data:
        r, g, b, _ = d.color
        d.color = tuple(back[i] * r + belly[i] * g + fin[i] * b for i in range(3)) + (1.0,)


def flip_z(objs):
    """Rotate finished models 180 degrees so the bow/front faces Blender -Y (game +Z)."""
    R = Matrix.Rotation(math.pi, 4, "Z")
    for ob in objs:
        loc = ob.location.copy()
        if ob.type == "MESH":
            ob.data.transform(R)
        ob.location = R @ loc


# ---------------------------------------------------------------- boat

def hull_section_params(t):
    w = 1.35 * max(0.0, 1 - max(0.0, (t - 0.45) / 0.55) ** 2.2) ** 0.8
    w *= 0.86 + 0.14 * min(1.0, t / 0.3)
    w = max(w, 0.03)
    zb = -0.65 + 0.55 * max(0.0, (t - 0.55) / 0.45) ** 2.5
    zt = 0.95 + 0.45 * t ** 2.5
    return w, zb, zt


def hull():
    N, K, L = 20, 6, 7.0
    bm = bmesh.new()
    rows = []
    for i in range(N + 1):
        t = i / N
        y = -L / 2 + L * t
        w, zb, zt = hull_section_params(t)
        zc = max(zb + 0.05, 0.22)
        side = []
        for k in range(K + 1):
            th = k / K * math.pi / 2
            side.append((w * math.sin(th), zb + (zc - zb) * (1 - math.cos(th))))
        side += [(w * 1.01, zc + (zt - zc) * 0.33), (w * 1.03, zc + (zt - zc) * 0.66), (w * 1.02, zt)]
        sec = [(-x, z) for x, z in reversed(side[1:])] + [(0.0, side[0][1])] + side[1:]
        rows.append([bm.verts.new((x, y, z)) for x, z in sec])
    cols = len(rows[0])
    for i in range(N):
        for j in range(cols - 1):
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    bm.faces.new(rows[0])
    bm.faces.new(list(reversed(rows[-1])))
    ob = to_obj("hull", bm)
    m = ob.modifiers.new("sol", "SOLIDIFY")
    m.thickness = 0.08
    m.offset = -1
    from lib import apply_mods
    apply_mods(ob)
    smooth(ob)

    def col(c, n):
        t = (c.y + L / 2) / L
        _, _, zt = hull_section_params(min(1, max(0, t)))
        if n.z > 0.6 and c.z > 0.85:
            return WHITE
        v = Vector((c.x, c.y * 0.35, 0))
        inner = n.z > -0.3 and v.length > 0.01 and n.dot(v) < -0.05 * v.length
        if inner or (n.z > 0.6):
            return TAN
        if c.z < 0.1:
            return RED
        if c.z < 0.26:
            return WHITE
        if c.z > zt - 0.16:
            return WHITE
        return NAVY

    paint(ob, col)
    return ob


def deck():
    bm = bmesh.new()
    N, M = 16, 8
    rows = []
    for i in range(N + 1):
        t = 0.012 + 0.9 * i / N
        w, _, _ = hull_section_params(t)
        hw = max(0.05, w - 0.1)
        y = -3.5 + 7 * t
        rows.append([bm.verts.new((-hw + 2 * hw * j / M, y, 0.8)) for j in range(M + 1)])
    for i in range(N):
        for j in range(M):
            bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
    ob = to_obj("deck", bm)
    tones = [C("#b07b4a"), C("#9c6a3e")]
    paint(ob, lambda c, n: tones[int((c.x + 2) / 0.3) % 2])
    return ob


def lifebuoy(loc, axis_rot):
    def col(c, n):
        a = math.atan2(c.z - loc[2], (c.y - loc[1]) if abs(axis_rot[1]) > 0 else (c.x - loc[0]))
        return RED if int((a + math.pi) / (math.pi / 2)) % 2 == 0 else WHITE
    return torus("buoy", 0.28, 0.075, loc, col, axis_rot, 20, 8)


def boat(outdir):
    reset()
    parts = [hull(), deck()]
    # cabin
    parts.append(box("cabin", (1.9, 1.8, 1.6), (0, 0.7, 1.6), WHITE, 0.12, 3))
    parts.append(box("roof", (2.25, 2.15, 0.18), (0, 0.7, 2.48), RED, 0.07, 2))
    parts.append(box("wfront", (1.4, 0.08, 0.5), (0, 1.61, 1.95), GLASS, 0.03, 1))
    for y in (0.3, 1.1):
        for s in (1, -1):
            parts.append(box("wside", (0.08, 0.5, 0.45), (s * 0.96, y, 1.95), GLASS, 0.03, 1))
    parts.append(box("door", (0.7, 0.08, 1.15), (0, -0.21, 1.42), C("#8a5a36"), 0.03, 1))
    parts.append(cyl("mast", 0.05, 0.04, 1.8, (0, 1.2, 3.4), WHITE, 10))
    parts.append(box("spar", (0.9, 0.06, 0.06), (0, 1.2, 3.7), WHITE))
    parts.append(prism2d("flag", [(1.2, 4.25), (1.2, 3.95), (0.45, 4.1)], 0.03, "YZ", (0, 0, 0), YELLOW))
    parts.append(cyl("stack", 0.11, 0.11, 0.7, (0.7, -0.05, 2.85), DARK, 12))
    parts.append(cyl("stackband", 0.12, 0.12, 0.12, (0.7, -0.05, 3.05), RED, 12))
    for s in (1, -1):
        parts.append(lifebuoy((s * 1.0, 0.25, 1.55), (0, math.radians(90), 0)))
        for y in (-1.6, 0.9):
            w, _, _ = hull_section_params((y + 3.5) / 7)
            parts.append(torus("fender", 0.2, 0.08, (s * (w * 1.03 + 0.08), y, 0.55), DARK, (0, math.radians(90), 0), 16, 8))
    # stern gear
    parts.append(box("cooler", (0.9, 0.6, 0.55), (0.62, -2.55, 1.08), C("#3a86c8"), 0.06, 2))
    parts.append(box("coolerlid", (0.96, 0.66, 0.1), (0.62, -2.55, 1.4), WHITE, 0.03, 1))
    parts.append(cyl("bucket", 0.22, 0.18, 0.45, (-0.7, -2.75, 1.03), YELLOW, 12))
    parts.append(text_mesh("name", "REEL DEAL", 0.26, 0.02, (0, -3.52, 0.58), (math.radians(90), 0, 0), WHITE))
    body = join(parts, "Boat")

    radar_pivot = Vector((0, 0.3, 2.85))
    radar = join([cyl("rpost", 0.04, 0.04, 0.3, (0, 0.3, 2.72), METAL, 8),
                  box("rbar", (0.9, 0.12, 0.1), (0, 0.3, 2.9), WHITE, 0.03, 1),
                  box("rbar2", (0.2, 0.14, 0.12), (0, 0.3, 2.9), RED, 0.02, 1)], "Radar")
    set_origin(radar, radar_pivot)

    lamp = join([cyl("lbody", 0.13, 0.16, 0.35, (0.55, 1.55, 2.72), DARK, 12, (math.radians(90), 0, 0)),
                 cyl("lglass", 0.12, 0.12, 0.04, (0.55, 1.74, 2.72), C("#fff2a8"), 12, (math.radians(90), 0, 0))], "Lamp")
    spot = empty("FisherSpot", (0, -2.2, 0.8))
    tip = empty("LampTip", (0.55, 1.8, 2.72))
    flip_z([body, radar, lamp, spot, tip])
    export("boat", [body, radar, lamp, spot, tip], outdir)


# ---------------------------------------------------------------- fisherman

def fisher(outdir):
    reset()
    SKIN = C("#f1c27d")
    COAT = C("#f2c230")
    parts = []
    for s in (1, -1):
        parts.append(box("boot", (0.2, 0.32, 0.2), (s * 0.14, -0.04, 0.1), C("#3b3b3b"), 0.06, 2))
        parts.append(cyl("leg", 0.1, 0.1, 0.5, (s * 0.14, 0, 0.45), C("#2c3e66"), 10))
    parts.append(sphere("coat", 1.0, (0, 0, 0.98), COAT, (0.34, 0.28, 0.46), 16, 12))
    for z in (0.95, 1.1, 1.25):
        parts.append(sphere("btn", 0.025, (0, -0.28, z - 0.08), C("#3b3b3b"), segs=6, rings=4))
    parts.append(sphere("head", 0.24, (0, 0, 1.52), SKIN, segs=18, rings=12))
    parts.append(sphere("beard", 1.0, (0, -0.12, 1.4), C("#e8e4dc"), (0.23, 0.15, 0.19), 14, 10))
    parts.append(sphere("nose", 0.075, (0, -0.25, 1.5), C("#e89a74"), segs=10, rings=8))
    for s in (1, -1):
        parts.append(sphere("eye", 0.03, (s * 0.085, -0.21, 1.59), C("#15181c"), segs=8, rings=6))
        parts.append(box("brow", (0.1, 0.03, 0.03), (s * 0.09, -0.22, 1.645), C("#e8e4dc"), rot=(0, s * 0.2, 0)))
    parts.append(cyl("brim", 0.36, 0.33, 0.05, (0, 0.03, 1.69), COAT, 20, (math.radians(-8), 0, 0)))
    parts.append(sphere("hat", 1.0, (0, 0.02, 1.72), COAT, (0.25, 0.25, 0.17), 16, 10))
    body = join(parts, "Fisher")

    shoulder = Vector((0, 0, 1.18))
    arms = []
    for s in (1, -1):
        sh = Vector((s * 0.3, 0, 1.18))
        hand = Vector((s * 0.07, -0.42, 1.02))
        arms.append(limb("arm", sh, hand, 0.085, 0.07, C("#f2c230"), 10))
        arms.append(sphere("hand", 0.07, hand, SKIN, segs=10, rings=8))
    arm = join(arms, "Arms")
    set_origin(arm, shoulder)
    sock = empty("RodSocket", (0, -0.44, 1.02), arm)
    export("fisher", [body, arm], outdir)


# ---------------------------------------------------------------- lure

def lure(outdir):
    reset()
    L, H, W = 1.0, 0.36, 0.26
    pr = F.make_profile(0.55, 0.35, 0.18)
    b = F.body(L, H, W, pr)
    parts = [b, F.fan_tail(0.42, 0.12, 0.12)]
    lip = prism2d("lip", [(-0.1, -0.5), (0.1, -0.5), (0.12, -0.72), (-0.12, -0.72)], 0.02, "XY",
                  (0, 0, -0.05), F.FIN, (math.radians(-25), 0, 0))
    parts.append(lip)
    body = join(parts, "Body")
    eye = F.eyes(L, H, W, pr, 0.16, 0.2, 0.07)
    hook = []
    silver = C("#c7cdd3")
    hook.append(torus("ring", 0.04, 0.012, (0, -0.52, 0.02), silver, (0, math.radians(90), 0), 12, 6))
    for y in (-0.05, 0.3):
        hook.append(limb("shank", (0, y, -0.14), (0, y, -0.3), 0.012, 0.012, silver, 6))
        for k in range(3):
            a = k / 3 * math.tau
            pts = []
            for i in range(8):
                s = i / 7
                ang = s * math.pi * 1.2
                r = 0.07
                pts.append((math.cos(a) * r * math.sin(ang), y + math.sin(a) * r * math.sin(ang), -0.3 + r * (1 - math.cos(ang)) - 0.07))
            hook.append(F.tube("barb", pts, [0.011] * 8, 5, silver, False))
    hk = join(hook, "Hook")
    export("lure", [body, join([eye], "Eye"), hk], outdir)


# ---------------------------------------------------------------- harbor

def pier(outdir):
    reset()
    rnd = random.Random(11)
    tones = [C("#a8764a"), C("#9a6b42"), C("#b3814f")]
    parts = []
    n = 85
    for i in range(n):
        parts.append(box("plank", (4.0, 0.36, 0.12), (0, -0.2 - i * 0.4, 1.4), tones[rnd.randrange(3)]))
    for s in (1, -1):
        parts.append(box("stringer", (0.25, 34, 0.25), (s * 1.5, -17, 1.22), WOOD_D))


    posts = [(s * 1.9, -2 - 4 * k) for k in range(8) for s in (1, -1)]
    for i in range(16):
        parts.append(box("pplank", (12.0, 0.36, 0.12), (0, -34.2 - i * 0.4, 1.4), tones[rnd.randrange(3)]))
    posts += [(x, y) for x in (-5.8, -2, 2, 5.8) for y in (-34.4, -40.2)]
    for x, y in posts:
        parts.append(cyl("post", 0.2, 0.2, 6.6, (x, y, -3.0), C("#4d5b3a"), 10))
        parts.append(cyl("post", 0.2, 0.2, 1.6, (x, y, 1.1), WOOD_D, 10))
        parts.append(cyl("postcap", 0.22, 0.12, 0.2, (x, y, 1.9), WOOD_D, 10))
    for x in (-5.4, 5.4):
        parts.append(cyl("bollard", 0.18, 0.22, 0.4, (x, -39.8, 1.66), DARK, 12))
        parts.append(cyl("bollardtop", 0.26, 0.26, 0.08, (x, -39.8, 1.9), DARK, 12))
    for x in (-3.0, 3.0):
        parts.append(torus("tire", 0.34, 0.14, (x, -40.55, 0.85), DARK, (math.radians(90), 0, 0), 16, 8))
    glows = []
    for x in (-5.6, 5.6):
        parts.append(cyl("pole", 0.08, 0.08, 3.4, (x, -34.6, 3.1), DARK, 8))
        parts.append(box("lamphead", (0.5, 0.5, 0.12), (x, -34.6, 5.0), DARK))
        parts.append(box("lampbase", (0.4, 0.4, 0.08), (x, -34.6, 4.5), DARK))
        glows.append(box("Glow", (0.34, 0.34, 0.42), (x, -34.6, 4.74), C("#ffd27a")))
    for (x, y, sz) in ((4.6, -37.0, 0.9), (4.1, -38.2, 0.75), (4.8, -38.1, 0.6)):
        parts.append(box("crate", (sz, sz, sz), (x, y, 1.46 + sz / 2), C("#c08a52"), 0.04, 1))
    for (x, y) in ((-4.6, -36.8), (-4.0, -37.6)):
        parts.append(cyl("barrel", 0.4, 0.4, 1.0, (x, y, 1.96), C("#8f5d34"), 14))
        for z in (1.66, 2.26):
            parts.append(cyl("band", 0.42, 0.42, 0.07, (x, y, z), DARK, 14))
    body = join(parts, "Pier")
    glow = join(glows, "Glow")
    empty("DockSpot", (-9.0, -37.5, 0.0))
    export("pier", [body, glow] + [o for o in __import__("bpy").data.objects if o.type == "EMPTY"], outdir)


def shop(outdir):
    reset()
    WALL = C("#5fb3c9")
    parts = [box("porch", (10.5, 9.0, 0.5), (0, -0.6, 0.25), WOOD_D, 0.05, 1),
             box("walls", (9, 6.5, 3.6), (0, 0.5, 2.3), WALL, 0.06, 1)]
    for x in (-4.45, 4.45):
        for y in (-2.7, 3.7):
            parts.append(box("trim", (0.3, 0.3, 3.7), (x, y, 2.3), WHITE, 0.04, 1))
    y0 = 0.5
    parts.append(prism2d("roof", [(y0 - 4.2, 3.95), (y0 + 4.2, 3.95), (y0 + 4.2, 4.2), (y0, 6.4), (y0 - 4.2, 4.2)],
                         10.4, "YZ", (0, 0, 0), C("#e0603a")))
    parts.append(prism2d("gable", [(-4.5, 4.05), (4.5, 4.05), (0, 6.15)], 6.4, "XZ", (0, y0, 0), WALL))
    parts.append(box("door", (1.4, 0.15, 2.4), (-2.3, -2.8, 1.7), C("#8a5a36"), 0.04, 1))
    parts.append(sphere("knob", 0.08, (-1.8, -2.9, 1.7), YELLOW, segs=8, rings=6))
    parts.append(box("winframe", (2.2, 0.12, 1.6), (2.2, -2.78, 2.6), WHITE, 0.03, 1))
    parts.append(box("window", (1.9, 0.14, 1.3), (2.2, -2.8, 2.6), GLASS, 0.02, 1))
    parts.append(box("counter", (2.6, 0.9, 1.1), (2.2, -3.25, 1.05), WOOD, 0.04, 1))
    for i in range(7):
        x = 0.7 + i * 0.5
        parts.append(box("awn", (0.5, 1.4, 0.06), (x, -3.3, 3.55), RED if i % 2 == 0 else WHITE,
                         rot=(math.radians(22), 0, 0)))
    parts.append(box("signback", (6.2, 0.15, 1.5), (0, -2.85, 4.85), C("#6b3a22"), 0.04, 1))
    parts.append(box("sign", (5.9, 0.2, 1.25), (0, -2.95, 4.85), C("#f6e6b4"), 0.03, 1))
    parts.append(text_mesh("signtext", "TACKLE SHOP", 0.62, 0.05, (0, -3.08, 4.82), (math.radians(90), 0, 0), C("#b8332a")))
    for (x, y) in ((-4.6, -3.7), (-3.8, -4.1)):
        parts.append(cyl("barrel", 0.42, 0.42, 1.0, (x, y, 1.0), C("#8f5d34"), 14))
        for z in (0.72, 1.3):
            parts.append(cyl("band", 0.44, 0.44, 0.07, (x, y, z), DARK, 14))
    for (x, y, sz) in ((4.6, -3.9, 0.9), (4.2, -4.6, 0.7)):
        parts.append(box("crate", (sz, sz, sz), (x, y, 0.5 + sz / 2), C("#c08a52"), 0.04, 1))
    parts.append(cyl("fishpole", 0.08, 0.08, 1.2, (0, y0, 6.8), DARK, 8))
    body = join(parts, "Shop")

    fb = F.body(1.0, 0.56, 0.2, F.make_profile(0.7, 0.38, 0.14))
    fparts = [fb, F.fan_tail(0.44, 0.2, 0.2),
              F.fin([(-0.22, 0.2), (-0.14, 0.38), (0.0, 0.37), (0.14, 0.34), (0.3, 0.2), (0.3, 0.1)])]
    bigfish = join(fparts, "BigFish")
    remap(bigfish, C("#ff8c1a"), C("#ffe08a"), C("#ff5a36"))
    feye = F.eyes(1.0, 0.56, 0.2, F.make_profile(0.7, 0.38, 0.14), 0.14, 0.3, 0.06)
    bigfish = join([bigfish, feye], "BigFish")
    bigfish.scale = (3.2, 3.2, 3.2)
    bigfish.rotation_euler = (0, 0, math.radians(90))
    bigfish.location = (0, y0, 8.2)
    bake_transform(bigfish)
    set_origin(bigfish, (0, y0, 8.2))
    export("shop", [body, bigfish], outdir)


def lighthouse(outdir):
    reset()
    parts = [cyl("base", 3.0, 3.2, 1.2, (0, 0, 0.6), C("#8a8f96"), 20)]
    h = 2.4
    for i in range(6):
        r1 = 2.2 - i * 0.14
        r2 = 2.2 - (i + 1) * 0.14
        parts.append(cyl("band", r1, r2, h, (0, 0, 1.2 + h * i + h / 2), RED if i % 2 == 0 else C("#f5f1e6"), 20))
    top = 1.2 + h * 6
    parts.append(cyl("gallery", 2.1, 2.1, 0.3, (0, 0, top + 0.15), DARK, 20))
    parts.append(torus("rail", 2.0, 0.05, (0, 0, top + 1.0), DARK, None, 32, 6))
    for k in range(12):
        a = k / 12 * math.tau
        parts.append(cyl("rp", 0.04, 0.04, 0.85, (math.cos(a) * 2.0, math.sin(a) * 2.0, top + 0.6), DARK, 6))
    parts.append(cyl("roof", 1.4, 0.12, 1.4, (0, 0, top + 2.6), RED, 20))
    parts.append(sphere("ball", 0.22, (0, 0, top + 3.4), DARK, segs=10, rings=8))
    parts.append(box("door", (1.0, 0.3, 1.8), (0, -2.1, 2.0), C("#6b4a2e"), 0.05, 1))
    body = join(parts, "Lighthouse")
    beacon = cyl("Glow", 1.05, 1.05, 1.6, (0, 0, top + 1.1), C("#fff2a8"), 16)
    export("lighthouse", [body, beacon], outdir)


# ---------------------------------------------------------------- props

def rock(outdir):
    reset()
    rnd = random.Random(2)
    tones = [C("#9a968f"), C("#8d8a85"), C("#a7a39b")]
    ob = ico("Rock", 1.0, (0, 0, 0), 3, None, 0.35, (1.0, 1.0, 0.8), seed=4)
    paint(ob, lambda c, n: tones[rnd.randrange(3)])
    export("rock", [ob], outdir)


def coral(outdir):
    reset()
    rnd = random.Random(9)
    parts = []

    def branch(p, d, length, r, depth):
        pts = []
        rad = []
        seg = 5
        q = Vector(p)
        dd = Vector(d).normalized()
        for i in range(seg + 1):
            pts.append(q.copy())
            rad.append(r * (1 - 0.35 * i / seg))
            q += dd * (length / seg)
            dd = (dd + Vector((rnd.uniform(-.25, .25), rnd.uniform(-.25, .25), 0.15))).normalized()
        parts.append(F.tube("br", pts, rad, 7, None, False))
        end = pts[-1]
        if depth == 0:
            parts.append(sphere("tip", rad[-1] * 1.4, end, None, segs=8, rings=6))
            return
        for _ in range(rnd.choice((2, 3))):
            nd = (dd + Vector((rnd.uniform(-.9, .9), rnd.uniform(-.9, .9), 0.3))).normalized()
            branch(end, nd, length * 0.72, rad[-1] * 0.85, depth - 1)

    branch((0, 0, -0.1), (0, 0, 1), 0.7, 0.12, 3)
    ob = join(parts, "Coral")
    paint(ob, lambda c, n: (0.55 + 0.45 * min(1, c.z / 1.6),) * 3 + (1,))
    smooth(ob)
    export("coral", [ob], outdir)


def iceberg(outdir):
    reset()

    def col(c, n):
        if c.z < -0.1:
            return C("#8fd0ea")
        return C("#ffffff") if n.z > 0.45 else C("#cdeefa")

    ob = ico("Iceberg", 1.0, (0, 0, 0), 2, None, 0.3, (1.5, 1.1, 1.3), seed=8, flat=True)
    for v in ob.data.vertices:
        if v.co.z > 0.3:
            v.co.z *= 1.25
    paint(ob, col)
    export("iceberg", [ob], outdir)


def pillar(outdir):
    reset()
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=24, radius1=0.55, radius2=0.5, depth=6.0)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x)
        if round(a / (math.tau / 24)) % 2:
            v.co.x *= 0.86
            v.co.y *= 0.86
        if v.co.z > 2.9:
            v.co.z += v.co.x * 0.9 - 0.5
    col = to_obj("col", bm)
    col.location = (0, 0, 3.4)
    bake_transform(col)
    smooth(col)
    parts = [col, box("plinth", (1.6, 1.6, 0.5), (0, 0, 0.25), None, 0.04, 1),
             box("plinth2", (1.35, 1.35, 0.25), (0, 0, 0.6), None, 0.04, 1)]
    ob = join(parts, "Pillar")

    def pc(c, n):
        return C("#6f8f6a") if c.z < 1.0 + 0.4 * math.sin(c.x * 5) else C("#b9c2b5")

    paint(ob, pc)
    export("pillar", [ob], outdir)


def tentacle(outdir):
    reset()
    n = 40
    pts, rad = [], []
    for i in range(n):
        s = i / (n - 1)
        pts.append((1.8 * math.sin(s * math.pi * 1.1) * s - 2.2 * max(0, s - 0.75) ** 1.5,
                    0.0,
                    13 * s - 3.0 * max(0, s - 0.7) ** 2))
        rad.append(1.15 * (1 - s) ** 0.85 + 0.06)
    body = F.tube("tent", pts, rad, 14, None, True)

    def col(c, n):
        return C("#d78fb0") if n.y < -0.55 else C("#6b3f7a")

    paint(body, col)
    suckers = []
    for i in range(3, n - 4, 2):
        p = Vector(pts[i])
        suckers.append(sphere("s", rad[i] * 0.32, p + Vector((0, -rad[i] * 0.92, 0)), C("#f2c0d4"), (1, 0.5, 1), 10, 6))
    ob = join([body] + suckers, "Tentacle")
    export("tentacle", [ob], outdir)


def crystal(outdir):
    reset()
    rnd = random.Random(12)
    parts = []
    for i in range(6):
        h = rnd.uniform(1.0, 2.2)
        r = rnd.uniform(0.18, 0.32)
        c = cyl("prism", r, r, h, (0, 0, h / 2), None, 6)
        tip = cyl("tip", r, 0.01, r * 1.6, (0, 0, h + r * 0.8), None, 6)
        ob = join([c, tip], "cr")
        ob.rotation_euler = (rnd.uniform(-.5, .5), rnd.uniform(-.5, .5), rnd.uniform(0, 3))
        ob.location = (rnd.uniform(-.3, .3), rnd.uniform(-.3, .3), 0)
        bake_transform(ob)
        parts.append(ob)
    ob = join(parts, "Crystal")
    smooth(ob, False)
    paint(ob, lambda c, n: (0.62 + 0.38 * min(1, c.z / 2),) * 3 + (1,))
    export("crystal", [ob], outdir)


def gull(outdir):
    reset()
    GREY = C("#c9ced6")
    parts = [sphere("body", 1.0, (0, 0, 0), WHITE, (0.2, 0.5, 0.2), 14, 10),
             sphere("head", 0.15, (0, -0.4, 0.1), WHITE, segs=12, rings=8),
             cyl("beak", 0.045, 0.005, 0.18, (0, -0.58, 0.08), YELLOW, 8, (math.radians(90), 0, 0)),
             prism2d("tail", [(-0.12, 0.35), (0.12, 0.35), (0.0, 0.6)], 0.03, "XY", (0, 0, 0.02), WHITE)]
    for s in (1, -1):
        parts.append(prism2d("wing", [(s * 0.1, -0.12), (s * 0.85, 0.02), (s * 0.95, 0.14), (s * 0.1, 0.16)], 0.03,
                             "XY", (0, 0, 0.06), GREY))
        parts.append(prism2d("tipw", [(s * 0.85, 0.02), (s * 1.1, 0.1), (s * 0.95, 0.14)], 0.03, "XY", (0, 0, 0.06), DARK))
        parts.append(sphere("eye", 0.022, (s * 0.1, -0.47, 0.14), DARK, segs=6, rings=4))
    ob = join(parts, "Gull")
    export("gull", [ob], outdir)


def chest(outdir):
    reset()
    GOLD = C("#f2c230")
    parts = [box("base", (1.2, 0.8, 0.6), (0, 0, 0.3), C("#8a5a36"), 0.04, 1)]
    lid = cyl("lid", 0.4, 0.4, 1.2, (0, 0, 0.6), C("#8a5a36"), 16, (0, math.radians(90), 0))
    for v in lid.data.vertices:
        if v.co.z < 0.6:
            v.co.z = 0.6
    parts.append(lid)
    for x in (-0.4, 0.4):
        parts.append(box("band", (0.1, 0.84, 0.62), (x, 0, 0.3), GOLD))
        parts.append(torus("bandtop", 0.41, 0.04, (x, 0, 0.6), GOLD, (0, math.radians(90), 0), 16, 6))
    parts.append(box("lock", (0.18, 0.08, 0.22), (0, -0.42, 0.55), GOLD, 0.02, 1))
    ob = join(parts, "Chest")
    export("chest", [ob], outdir)


BUILDERS = [boat, fisher, lure, pier, shop, lighthouse, rock, coral, iceberg, pillar, tentacle, crystal, gull, chest]


def build(outdir):
    for fn in BUILDERS:
        fn(outdir)
