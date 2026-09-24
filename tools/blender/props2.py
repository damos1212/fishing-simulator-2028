"""Expansion props: wrecks, ghost ship, candy land, toxic factory, Atlantis ruins, storm
spires, outposts, the aquarium, hats for the fisherman."""
import math
import random

import bmesh
from mathutils import Vector, noise

import fish as F
import world as W
from lib import (bake_transform, box, cyl, empty, export, hexcol, ico, join, limb, paint, paint_verts, prism2d,
                 reset, set_origin, smooth, sphere, text_mesh, to_obj, torus)

C = hexcol
GOLD = C("#e0b040")
MARBLE = C("#ece6d8")
DARKWOOD = C("#4a3424")
BONE = C("#d8d0b8")


def wood_hull(scale, tones, holes=0.0, seed=1):
    ob = W.hull()
    rnd = random.Random(seed)

    def col(c, n):
        return tones[int((c.z + 1) / 0.25) % len(tones)]

    paint(ob, col)
    if holes > 0:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        kill = [f for f in bm.faces if f.calc_center_median().y > 0.5 and f.calc_center_median().z > 0.1 and rnd.random() < holes]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bm.to_mesh(ob.data)
        bm.free()
    ob.scale = (scale, scale, scale)
    bake_transform(ob)
    return ob


def shipwreck(outdir):
    reset()
    tones = [C("#5a4230"), C("#4a3424"), C("#6a5038")]
    hull = wood_hull(3.4, tones, 0.35, 3)
    deck = W.deck()
    paint(deck, lambda c, n: tones[int(c.x * 3) % 3])
    deck.scale = (3.4, 3.4, 3.4)
    bake_transform(deck)
    parts = [hull, deck,
             cyl("mast", 0.35, 0.3, 9, (0, 2, 6), DARKWOOD, 10, (0.5, 0.3, 0)),
             cyl("stump", 0.35, 0.35, 3, (0, -5, 3.5), DARKWOOD, 10)]
    rnd = random.Random(4)
    for i in range(10):
        parts.append(box("plank", (0.4, 3 + rnd.random() * 2, 0.12), (rnd.uniform(-8, 8), rnd.uniform(-14, 14), rnd.uniform(-2, 0)),
                         tones[i % 3], rot=(rnd.random(), rnd.random(), rnd.random() * 3)))
    ob = join(parts, "Shipwreck")
    ob.rotation_euler = (0, math.radians(28), math.radians(10))
    bake_transform(ob)
    export("shipwreck", [ob], outdir)


def ghostship(outdir):
    reset()
    tones = [C("#3a3a34"), C("#2e2e2a"), C("#44443c")]
    hull = wood_hull(4.0, tones, 0.08, 5)
    deck = W.deck()
    paint(deck, lambda c, n: tones[int(c.x * 3) % 3])
    deck.scale = (4, 4, 4)
    bake_transform(deck)
    SAIL = C("#b8c8b0")
    parts = [hull, deck]
    for y, h in ((5, 16), (-4, 13)):
        parts.append(cyl("mast", 0.3, 0.2, h, (0, y, 3.2 + h / 2), DARKWOOD, 10))
        for k, z in enumerate((3.2 + h * 0.45, 3.2 + h * 0.8)):
            w = 5 - k * 1.5
            parts.append(cyl("yard", 0.12, 0.12, w * 2, (0, y, z + 2.2), DARKWOOD, 8, (0, math.radians(90), 0)))
            pts = [(-w, z + 2.2), (w, z + 2.2), (w * 0.9, z - 1.5), (w * 0.4, z - 1.0), (w * 0.1, z - 2.2), (-w * 0.3, z - 1.2), (-w * 0.8, z - 1.9)]
            parts.append(prism2d("sail", pts, 0.08, "XZ", (0, y + 0.4, 0), SAIL))
    parts.append(cyl("nest", 0.9, 0.7, 0.8, (0, 5, 17.5), DARKWOOD, 12))
    parts.append(prism2d("jolly", [(0, 20.2), (2.2, 20.0), (2.0, 18.8), (0, 19.0)], 0.05, "XZ", (0, 5, 0), C("#1a1a1a")))
    ob = join(parts, "Ghostship")
    glows = [sphere("Glow", 0.4, (s * 3.8, y, 5.4), C("#a0ffd0"), segs=10, rings=8) for s in (1, -1) for y in (-8, 0, 8)]
    glow = join(glows, "Glow")
    W.flip_z([ob, glow])
    export("ghostship", [ob, glow], outdir)


def skullrock(outdir):
    reset()
    head = ico("head", 20, (0, 0, 14), 3, None, 0.08, (1.0, 1.1, 0.9), seed=3)
    for v in head.data.vertices:
        if v.co.y < -8 and v.co.z < 12:
            v.co.y *= 0.85
    jaw = box("jaw", (26, 20, 10), (0, -4, 0), None, 3, 3)
    parts = [head, jaw]
    paint(head, lambda c, n: BONE)
    paint(jaw, lambda c, n: BONE)
    sockets = [sphere("sock", 5.5, (s * 7, -17, 16), C("#1a1814"), (1, 0.6, 1.1), 14, 10) for s in (1, -1)]
    nose = sphere("nose", 3, (0, -20, 10), C("#1a1814"), (0.7, 0.5, 1.2), 10, 8)
    teeth = [box("tooth", (2.4, 1.6, 3.2), (-9 + i * 3, -13.6, 5), C("#f0ead8"), 0.4, 2) for i in range(7)]
    ob = join(parts + sockets + [nose] + teeth, "Skullrock")
    glow = join([sphere("Glow", 2.2, (s * 7, -18.5, 16), C("#50ffb0"), segs=10, rings=8) for s in (1, -1)], "Glow")
    export("skullrock", [ob, glow], outdir)


def barrel(outdir):
    reset()
    parts = [cyl("barrel", 0.6, 0.6, 1.8, (0, 0, 0.9), C("#e0c020"), 16)]
    for z in (0.35, 0.9, 1.45):
        parts.append(cyl("band", 0.63, 0.63, 0.12, (0, 0, z), C("#2a2a2a"), 16))
    for i in range(3):
        a = i / 3 * math.tau
        parts.append(prism2d("tre", [(0, 0), (0.22 * math.cos(a - 0.4), 0.22 * math.sin(a - 0.4)), (0.22 * math.cos(a + 0.4), 0.22 * math.sin(a + 0.4))],
                             0.02, "XZ", (0, -0.61, 0.9), C("#1a1a1a")))
    ob = join(parts, "Barrel")
    glow = cyl("Glow", 0.5, 0.5, 0.06, (0, 0, 1.82), C("#a0ff30"), 16)
    export("barrel", [ob, glow], outdir)


def factory(outdir):
    reset()
    GREY = C("#7a7e80")
    parts = [box("main", (30, 20, 14), (0, 0, 7), GREY, 0.4, 2),
             box("roof", (31, 21, 1), (0, 0, 14.4), C("#4a4e50"), 0.2, 1),
             box("wing", (14, 12, 9), (20, 4, 4.5), C("#8a8e90"), 0.3, 2)]
    for i, x in enumerate((-9, 0, 9)):
        parts.append(cyl("chimney", 2.2, 1.8, 24, (x, 4, 26), C("#9a4a3a"), 14))
        for z in (18, 30):
            parts.append(cyl("stripe", 2.1, 2.1, 1.5, (x, 4, z + i), C("#f0f0f0"), 14))
    for k in range(4):
        pts = [(-15, -10 + k * 5, 5 + k), (-18, -11 + k * 5, 4 + k), (-22, -12 + k * 5, 1)]
        parts.append(F.tube("pipe", pts, [0.9, 0.9, 0.9], 10, C("#5a6a4a"), False))
    for i in range(6):
        parts.append(box("window", (0.3, 2.5, 2.5), (-15.1, -7 + i * 3, 8), C("#c0ff60")))
    ob = join(parts, "Factory")
    glow = join([sphere("Glow", 1.3, (-22, -12 + k * 5, 0.8), C("#a0ff30"), (1.6, 1.6, 0.5), 10, 6) for k in range(4)], "Glow")
    export("factory", [ob, glow], outdir)


def lollipop(outdir):
    reset()
    stick = cyl("stick", 0.18, 0.18, 7, (0, 0, 3.5), C("#fff8f0"), 10)
    disc = cyl("disc", 2.4, 2.4, 0.6, (0, 0, 8.4), None, 40, (math.radians(90), 0, 0))
    for v in disc.data.vertices:
        pass

    def swirl(c, n):
        dx, dz = c.x, c.z - 8.4
        a = math.atan2(dz, dx)
        r = math.hypot(dx, dz)
        return C("#ffffff") if math.sin(a * 1 + r * 3.2) > 0 else C("#ff9ad5")
    sub = disc.modifiers.new("sub", "SUBSURF")
    sub.levels = 2
    from lib import apply_mods
    apply_mods(disc)
    paint(disc, swirl)
    ob = join([stick, disc], "Lollipop")
    export("lollipop", [ob], outdir)


def candycane(outdir):
    reset()
    pts, rad, cols = [], [], []
    for k in range(40):
        s = k / 39
        if s < 0.7:
            p = (0, 0, s / 0.7 * 10)
        else:
            t = (s - 0.7) / 0.3 * math.pi
            p = (1.6 - math.cos(t) * 1.6, 0, 10 + math.sin(t) * 1.6)
        pts.append(p)
        rad.append(0.5)
    ob = F.tube("Candycane", pts, rad, 14, None, True)

    def stripes(c, n):
        return C("#ff2a2a") if math.sin((c.z + c.x) * 2.2 + math.atan2(n.y, n.x) * 1.0) > 0 else C("#ffffff")
    paint(ob, stripes)
    export("candycane", [ob], outdir)


def gumdrop(outdir):
    reset()
    dome = sphere("dome", 1.0, (0, 0, 0), None, (1.6, 1.6, 1.8), 24, 16)
    bm = bmesh.new()
    bm.from_mesh(dome.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.05], context="VERTS")
    bm.to_mesh(dome.data)
    bm.free()
    paint(dome, lambda c, n: C("#ffffff"))
    dots = []
    rnd = random.Random(8)
    for i in range(60):
        a, b = rnd.random() * math.tau, rnd.random() * 1.3
        p = Vector((math.cos(a) * math.sin(b) * 1.6, math.sin(a) * math.sin(b) * 1.6, math.cos(b) * 1.8))
        dots.append(sphere("s", 0.06, p, C("#ffffff"), segs=6, rings=4))
    ob = join([dome] + dots, "Gumdrop")
    export("gumdrop", [ob], outdir)


def icecream(outdir):
    reset()
    cone = cyl("cone", 0.4, 6, 18, (0, 0, 9), None, 24)

    def waffle(c, n):
        a = math.atan2(c.y, c.x)
        return C("#d8a050") if (int(a * 4) + int(c.z * 0.8)) % 2 else C("#c08840")
    sub = cone.modifiers.new("sub", "SUBSURF")
    sub.levels = 1
    from lib import apply_mods
    apply_mods(cone)
    paint(cone, waffle)
    scoops = [sphere("s1", 6.2, (0, 0, 20), C("#ff9ad5"), segs=24, rings=16),
              sphere("s2", 5.2, (0.6, 0.4, 26.5), C("#fff4e0"), segs=24, rings=16),
              sphere("s3", 4.2, (-0.4, 0, 31.5), C("#6a3a1a"), segs=20, rings=14),
              sphere("cherry", 1.3, (0, 0, 36.2), C("#e0102a"), segs=12, rings=10)]
    sprinkles = []
    rnd = random.Random(3)
    cols = [C("#3ad0ff"), C("#ffd040"), C("#70ff70"), C("#ff5aa0")]
    for i in range(80):
        a, b = rnd.random() * math.tau, rnd.random() * 1.2
        p = Vector((math.cos(a) * math.sin(b) * 6.2, math.sin(a) * math.sin(b) * 6.2, 20 + math.cos(b) * 6.2))
        sprinkles.append(box("sp", (0.8, 0.2, 0.2), p, cols[i % 4], rot=(rnd.random() * 3, rnd.random() * 3, rnd.random() * 3)))
    ob = join([cone] + scoops + sprinkles, "Icecream")
    export("icecream", [ob], outdir)


def dome(outdir):
    reset()
    parts = [cyl("base", 11, 11.5, 1.5, (0, 0, 0.75), MARBLE, 32), cyl("step", 10, 10, 0.6, (0, 0, 1.8), MARBLE, 32)]
    for i in range(10):
        a = i / 10 * math.tau
        parts.append(cyl("col", 0.7, 0.6, 9, (math.cos(a) * 8.5, math.sin(a) * 8.5, 6.6), MARBLE, 12))
        parts.append(box("cap", (1.8, 1.8, 0.5), (math.cos(a) * 8.5, math.sin(a) * 8.5, 11.3), MARBLE))
    parts.append(cyl("ring", 9.6, 9.6, 1.2, (0, 0, 12.1), GOLD, 32))
    d = sphere("dome", 9.2, (0, 0, 12.6), GOLD, (1, 1, 0.85), 32, 18)
    bm = bmesh.new()
    bm.from_mesh(d.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 12.5], context="VERTS")
    bm.to_mesh(d.data)
    bm.free()
    parts.append(d)
    parts.append(cyl("spire", 0.8, 0.05, 6, (0, 0, 23), GOLD, 12))
    ob = join(parts, "Dome")
    glow = sphere("Glow", 1.2, (0, 0, 26.2), C("#ffe080"), segs=12, rings=8)
    export("dome", [ob, glow], outdir)


def statue(outdir):
    reset()
    parts = [box("ped", (3, 3, 2), (0, 0, 1), MARBLE, 0.1, 2)]
    tail = [(0, 0.3, 2 + s * 3 - 0.8 * math.sin(s * math.pi)) for s in (k / 9 for k in range(10))]
    tail = [(0, 0.3 + 1.2 * math.sin(s * math.pi * 0.7), 2.2 + s * 3.2) for s in (k / 9 for k in range(10))]
    parts.append(F.tube("tail", tail[::-1], [0.9 - 0.06 * k for k in range(10)][::-1], 12, MARBLE, True))
    parts.append(cyl("torso", 0.9, 0.7, 2.4, (0, 0.3, 6.4), MARBLE, 14))
    parts.append(sphere("head", 0.6, (0, 0.3, 8.1), MARBLE, segs=14, rings=10))
    parts.append(sphere("beard", 1.0, (0, -0.15, 7.7), MARBLE, (0.45, 0.35, 0.5), 12, 8))
    parts.append(prism2d("fluke", [(-1.4, 0), (0, 0.5), (1.4, 0), (0, 0.9)], 0.2, "XZ", (0, 1.4, 2.2), MARBLE))
    parts.append(limb("arm", (0.8, 0.3, 7.2), (1.6, -0.2, 8.6), 0.25, 0.22, MARBLE, 10))
    parts.append(limb("staff", (1.7, -0.3, 3.5), (1.7, -0.3, 11.5), 0.12, 0.12, GOLD, 8))
    for dx in (-0.45, 0, 0.45):
        parts.append(limb("prong", (1.7 + dx, -0.3, 11.2), (1.7 + dx, -0.3, 12.6), 0.08, 0.02, GOLD, 6))
    parts.append(box("tbar", (1.1, 0.2, 0.2), (1.7, -0.3, 11.2), GOLD))
    ob = join(parts, "Statue")
    export("statue", [ob], outdir)


def arch(outdir):
    reset()
    parts = []
    for x in (-5, 5):
        parts.append(box("leg", (2, 2, 10), (x, 0, 5), MARBLE, 0.1, 2))
    pts = [(math.cos(t) * 5, 0, 10 + math.sin(t) * 4) for t in (k / 15 * math.pi for k in range(16))]
    parts.append(F.tube("arc", pts, [1.0] * 16, 10, MARBLE, True))
    parts.append(F.tube("trim", pts, [1.1 if k % 3 == 0 else 0.3 for k in range(16)], 10, GOLD, True))
    ob = join(parts, "Arch")
    export("arch", [ob], outdir)


def spire(outdir):
    reset()
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=9, radius1=6, radius2=0.4, depth=42)
    for v in bm.verts:
        n = noise.noise(v.co * 0.2)
        v.co.x *= 1 + 0.35 * n
        v.co.y *= 1 + 0.35 * noise.noise(v.co * 0.2 + Vector((5, 1, 2)))
        v.co.x += math.sin(v.co.z * 0.1) * 1.5
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges], cuts=1)
    ob = to_obj("Spire", bm)
    ob.location = (0, 0, 21)
    bake_transform(ob)
    smooth(ob, False)
    paint(ob, lambda c, n: C("#3a3e46") if n.z < 0.5 else C("#5a6068"))
    rod = cyl("rod", 0.15, 0.08, 5, (1.5, 0, 44), C("#8a8e90"), 8)
    ob = join([ob, rod], "Spire")
    glow = sphere("Glow", 0.7, (1.5, 0, 46.8), C("#a0f0ff"), segs=10, rings=8)
    export("spire", [ob, glow], outdir)


def outpost(outdir):
    reset()
    tones = [C("#a8764a"), C("#9a6b42"), C("#b3814f")]
    rnd = random.Random(21)
    parts = []
    for i in range(22):
        parts.append(box("plank", (10, 0.44, 0.14), (0, -4.2 + i * 0.4, 1.2), tones[rnd.randrange(3)]))
    for x in (-4.2, 0, 4.2):
        for y in (-3.6, 0, 3.6):
            parts.append(cyl("float", 0.7, 0.7, 1.6, (x, y, 0.4), C("#3a86c8") if (x + y) % 2 else C("#e05a3a"), 12, (0, math.radians(90), 0)))
    parts.append(box("hut", (4, 3.4, 3), (1.8, 1.4, 2.8), C("#5fb3c9"), 0.08, 1))
    parts.append(prism2d("roof", [(-2.2, 4.2), (2.2, 4.2), (0, 5.8)], 4.8, "YZ", (1.8, 1.4, 0), C("#e0603a")))
    parts[-1].rotation_euler = (0, 0, 0)
    parts.append(box("door", (1.1, 0.12, 2.0), (1.8, -0.35, 2.3), C("#8a5a36"), 0.04, 1))
    parts.append(box("sign", (3.2, 0.14, 0.9), (1.8, -0.4, 4.6), C("#f6e6b4"), 0.04, 1))
    parts.append(text_mesh("signtext", "OUTPOST", 0.5, 0.04, (1.8, -0.5, 4.58), (math.radians(90), 0, 0), C("#b8332a")))
    parts.append(cyl("pole", 0.08, 0.08, 6, (-4, 3.5, 4.2), C("#e8e4dc"), 8))
    parts.append(prism2d("flag", [(0, 6.9), (0, 6.2), (1.4, 6.55)], 0.03, "XZ", (-4, 3.5, 0), C("#ffd23a")))
    parts.append(cyl("lamppost", 0.08, 0.08, 3, (-4.4, -3.8, 2.7), C("#2b2b2b"), 8))
    for (x, y) in ((3.8, -3.2), (4.2, 3.4)):
        parts.append(cyl("barrel", 0.4, 0.4, 1.0, (x, y, 1.8), C("#8f5d34"), 12))
    ob = join(parts, "Outpost")
    glow = box("Glow", (0.4, 0.4, 0.5), (-4.4, -3.8, 4.4), C("#ffd27a"))
    dock = empty("DockSpot", (-8.5, 0, 0))
    W.flip_z([ob, glow, dock])
    export("outpost", [ob, glow, dock], outdir)


def aquarium(outdir):
    reset()
    STONE = C("#b8b0a0")
    L, Wd, D = 18, 11, 2.8
    parts = [box("floor", (L, Wd, 0.4), (0, 0, -D), C("#e8d8a8"))]
    t = 0.8
    parts += [box("wallN", (L + 2 * t, t, D + 1.2), (0, Wd / 2 + t / 2, -D / 2 + 0.6), STONE, 0.1, 1),
              box("wallS", (L + 2 * t, t, D + 1.2), (0, -Wd / 2 - t / 2, -D / 2 + 0.6), STONE, 0.1, 1),
              box("wallE", (t, Wd, D + 1.2), (L / 2 + t / 2, 0, -D / 2 + 0.6), STONE, 0.1, 1),
              box("wallW", (t, Wd, D + 1.2), (-L / 2 - t / 2, 0, -D / 2 + 0.6), STONE, 0.1, 1)]
    for x in (-L / 2 - 0.4, L / 2 + 0.4):
        for y in (-Wd / 2 - 0.4, Wd / 2 + 0.4):
            parts.append(cyl("post", 0.5, 0.5, 2.4, (x, y, 0.6), C("#5fb3c9"), 12))
            parts.append(sphere("ball", 0.5, (x, y, 2.1), C("#ffd23a"), segs=10, rings=8))
    parts.append(box("signpost", (0.3, 0.3, 3), (0, -Wd / 2 - 1.6, 1.5), C("#6b4a2e")))
    parts.append(box("sign", (6, 0.25, 1.4), (0, -Wd / 2 - 1.6, 3.4), C("#f6e6b4"), 0.05, 1))
    parts.append(text_mesh("t", "AQUARIUM", 0.8, 0.05, (0, -Wd / 2 - 1.76, 3.36), (math.radians(90), 0, 0), C("#2a6adf")))
    rnd = random.Random(5)
    for i in range(12):
        parts.append(sphere("rock", 0.4 + rnd.random() * 0.5, (rnd.uniform(-8, 8), rnd.uniform(-4.5, 4.5), -D + 0.2), C("#8a8278"), (1, 1, 0.6), 8, 6))
    ob = join(parts, "Aquarium")
    export("aquarium", [ob], outdir)


def shell(outdir):
    reset()
    pts, rad = [], []
    for k in range(30):
        s = k / 29
        a = s * math.tau * 2.2
        r = 0.05 + s * 0.5
        pts.append((math.cos(a) * r * 0.6, math.sin(a) * r * 0.6, s * 0.3))
        rad.append(0.05 + s * 0.38)
    ob = F.tube("Shell", pts[::-1], rad[::-1], 12, None, True)
    paint(ob, lambda c, n: C("#fff0e0") if math.sin(math.atan2(n.y, n.x) * 6) > 0 else C("#ffc0a0"))
    export("shell", [ob], outdir)


def anchor(outdir):
    reset()
    IRON = C("#3a3e44")
    parts = [cyl("shank", 0.25, 0.25, 6, (0, 0, 3), IRON, 10), cyl("stock", 0.18, 0.18, 3.4, (0, 0, 5.4), IRON, 8, (0, math.radians(90), 0)),
             torus("ring", 0.6, 0.14, (0, 0, 6.6), IRON, (math.radians(90), 0, 0), 16, 6)]
    pts = [(math.cos(t) * 2.4, 0, 2.4 - math.sin(t) * 2.4 + 0.2) for t in (k / 11 * math.pi for k in range(12))]
    parts.append(F.tube("arms", pts, [0.25] * 12, 8, IRON, True))
    for s in (1, -1):
        parts.append(prism2d("fluke", [(0, 0), (0.5 * s, 0.9), (-0.3 * s, 0.6)], 0.2, "XZ", (s * 2.4, 0, 2.4), IRON))
    ob = join(parts, "Anchor")
    export("anchor", [ob], outdir)


# ---------------------------------------------------------------- hats

def hats(outdir):
    reset()
    Y = C("#f2c230")
    out = []

    def hat(name, parts):
        ob = join(parts, name)
        out.append(ob)

    hat("HatSouwester", [cyl("brim", 0.36, 0.33, 0.05, (0, 0.03, 0.03), Y, 20, (math.radians(-8), 0, 0)),
                         sphere("crown", 1.0, (0, 0.02, 0.06), Y, (0.25, 0.25, 0.17), 16, 10)])
    BL = C("#1f1f24")
    tri = [cyl("brim", 0.4, 0.38, 0.04, (0, 0, 0.02), BL, 24), sphere("crown", 1.0, (0, 0, 0.08), BL, (0.24, 0.24, 0.2), 16, 10)]
    for i in range(3):
        a = i / 3 * math.tau + math.pi / 2
        tri.append(prism2d("flap", [(-0.3, 0), (0.3, 0), (0, 0.22)], 0.03, "XZ", (0, 0, 0), BL))
        tri[-1].rotation_euler = (0, 0, a)
        tri[-1].location = (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.02)
        bake_transform(tri[-1])
    tri.append(sphere("skull", 0.05, (0, -0.25, 0.16), C("#f0f0f0"), segs=8, rings=6))
    tri.append(torus("trim", 0.39, 0.015, (0, 0, 0.04), GOLD, None, 24, 4))
    hat("HatPirate", tri)
    hat("HatTop", [cyl("brim", 0.34, 0.34, 0.03, (0, 0, 0.02), BL, 24), cyl("tube", 0.2, 0.21, 0.4, (0, 0, 0.22), BL, 20),
                   cyl("band", 0.215, 0.215, 0.07, (0, 0, 0.08), C("#c0302a"), 20)])
    beanie = sphere("beanie", 0.25, (0, 0, 0.0), None, (1, 1, 0.8), 16, 10)
    cols = [C("#e0302a"), C("#ffd23a"), C("#3a86ff"), C("#3ad060")]
    paint(beanie, lambda c, n: cols[int((math.atan2(c.y, c.x) + math.pi) / (math.pi / 2)) % 4])
    bm = bmesh.new()
    bm.from_mesh(beanie.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.02], context="VERTS")
    bm.to_mesh(beanie.data)
    bm.free()
    hat("HatPropeller", [beanie, cyl("post", 0.02, 0.02, 0.12, (0, 0, 0.24), C("#888888"), 6)])
    hat("HatPropellerBlades", [box("blade", (0.5, 0.06, 0.015), (0, 0, 0), C("#e0302a")), box("blade2", (0.06, 0.5, 0.015), (0, 0, 0), C("#3a86ff")),
                               sphere("hub", 0.035, (0, 0, 0.01), C("#ffd23a"), segs=8, rings=6)])
    GREYM = C("#a0a4aa")
    helm = sphere("helm", 0.26, (0, 0, 0.0), GREYM, (1, 1, 0.9), 16, 10)
    horns = []
    for s in (1, -1):
        pts = [(s * (0.22 + 0.12 * t), 0, 0.08 + 0.3 * t - 0.2 * t * t + 0.25 * t ** 3) for t in (k / 7 for k in range(8))]
        horns.append(F.tube("horn", pts, [0.06 * (1 - k / 7) + 0.01 for k in range(8)], 8, C("#f0e6cc"), True))
    hat("HatViking", [helm, box("nose", (0.05, 0.03, 0.22), (0, -0.26, -0.04), GREYM), torus("rim", 0.26, 0.025, (0, 0, 0.0), C("#8a6a3a"), None, 20, 4)] + horns)
    crown = [cyl("band", 0.24, 0.24, 0.12, (0, 0, 0.05), GOLD, 20)]
    for i in range(6):
        a = i / 6 * math.tau
        crown.append(cyl("pt", 0.06, 0.005, 0.16, (math.cos(a) * 0.22, math.sin(a) * 0.22, 0.19), GOLD, 6))
        crown.append(sphere("gem", 0.03, (math.cos(a) * 0.245, math.sin(a) * 0.245, 0.05), C("#e0203a") if i % 2 else C("#3a8aff"), segs=6, rings=4))
    hat("HatCrown", crown)
    BR = C("#8a5a30")
    brim = cyl("brim", 0.46, 0.46, 0.03, (0, 0, 0.02), BR, 28)
    for v in brim.data.vertices:
        v.co.z += (abs(v.co.x) / 0.46) ** 2 * 0.12
    hat("HatCowboy", [brim, sphere("crown", 1.0, (0, 0, 0.12), BR, (0.24, 0.26, 0.2), 16, 10), cyl("band", 0.235, 0.235, 0.05, (0, 0, 0.06), C("#3a2a1a"), 20)])
    WH = C("#fafafa")
    hat("HatChef", [cyl("band", 0.24, 0.26, 0.2, (0, 0, 0.1), WH, 20)] + [sphere("puff", 0.16, (math.cos(a) * 0.14, math.sin(a) * 0.14, 0.3), WH, segs=10, rings=8)
                                                                       for a in (i / 5 * math.tau for i in range(5))] + [sphere("top", 0.18, (0, 0, 0.36), WH, segs=10, rings=8)])
    PU = C("#5a2ab0")
    wiz = [cyl("brim", 0.42, 0.42, 0.03, (0, 0, 0.02), PU, 24)]
    cone_pts = [(0.06 * math.sin(t * 3), -0.1 * t * t, 0.02 + t * 0.7) for t in (k / 9 for k in range(10))]
    wiz.append(F.tube("cone", cone_pts, [0.24 * (1 - k / 9) + 0.01 for k in range(10)], 14, PU, True))
    for i in range(5):
        a = i / 5 * math.tau
        wiz.append(sphere("star", 0.03, (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.12 + i * 0.06), C("#ffe040"), segs=6, rings=4))
    hat("HatWizard", wiz)
    fb = F.body(1.0, 0.56, 0.2, F.make_profile(0.7, 0.38, 0.14))
    fparts = [fb, F.fan_tail(0.44, 0.2, 0.2), F.fin([(-0.22, 0.2), (-0.14, 0.38), (0.0, 0.37), (0.14, 0.34), (0.3, 0.2), (0.3, 0.1)])]
    fish = join(fparts, "fishhat")
    W.remap(fish, C("#ff8c1a"), C("#ffe08a"), C("#ff5a36"))
    eye = F.eyes(1.0, 0.56, 0.2, F.make_profile(0.7, 0.38, 0.14), 0.14, 0.3, 0.06)
    fh = join([fish, eye], "HatFish")
    fh.scale = (0.55, 0.55, 0.55)
    fh.location = (0, 0, 0.14)
    bake_transform(fh)
    out.append(fh)
    export("hats", out, outdir)


BUILDERS = [shipwreck, ghostship, skullrock, barrel, factory, lollipop, candycane, gumdrop, icecream, dome, statue, arch, spire,
            outpost, aquarium, shell, anchor, hats]


def build(outdir):
    for fn in BUILDERS:
        fn(outdir)
