"""Portal realm props: the rift gate, prehistoric flora and fauna, floating fel rocks, the moon base
and the neon dimension. Glowing parts are separate meshes whose names contain "Glow"."""
import math
import random

from mathutils import Vector

import fish as F
from lib import box, cyl, export, hexcol, ico, join, limb, paint, paint_verts, prism2d, reset, smooth, sphere, text_mesh, torus

C = hexcol


def portal(outdir):
    """A ring gate standing in the sea, ~30 m across; the swirl inside is drawn in game."""
    reset()
    STONE = C("#4a4658")
    STONE2 = C("#35323f")
    RUNE = C("#ffffff")
    ring = torus("ring", 14.0, 1.7, (0, 0, 13.0), None, (math.radians(90), 0, 0), 48, 12)
    paint(ring, lambda c, n: STONE if int((math.atan2(c.z - 13.0, c.x) + math.pi) / (math.tau / 24)) % 2 == 0 else STONE2)
    parts = [ring]
    rnd = random.Random(8)
    for i in range(12):
        a = i / 12 * math.tau
        x, z = math.cos(a) * 14.0, 13.0 + math.sin(a) * 14.0
        parts.append(box("block", (2.6, 3.6, 2.2), (x, 0, z), STONE2, 0.2, 2, (0, -a, 0)))
    for s in (1, -1):
        parts.append(ico("base", 4.5, (s * 11.0, 0, -1.0), 2, STONE, 0.25, (1.0, 1.3, 1.1), 3 + s, True))
        parts.append(limb("spike", (s * 14.5, 0, 20.0), (s * 19.0, 0, 30.0), 1.1, 0.1, STONE2, 6))
    parts.append(limb("crown", (0, 0, 27.0), (0, 0, 34.0), 1.4, 0.1, STONE2, 6))
    body = join(parts, "Gate")
    glows = [torus("inner", 12.2, 0.35, (0, 0, 13.0), RUNE, (math.radians(90), 0, 0), 64, 8)]
    for i in range(24):
        a = (i + 0.5) / 24 * math.tau
        x, z = math.cos(a) * 14.0, 13.0 + math.sin(a) * 14.0
        for s in (1, -1):
            glows.append(box("rune", (0.5, 0.2, 1.1), (x, s * 1.72, z), RUNE, 0.0, 1, (0, -a, rnd.random() * 0.3)))
    glow = join(glows, "Glow")
    export("portal", [body, glow], outdir)


def fern(outdir):
    """Prehistoric tree fern, ~9 m tall."""
    reset()
    TRUNK = C("#6a4a2a")
    LEAF = C("#3f9a3a")
    LEAF2 = C("#5ab040")
    n = 10
    pts = [(0.3 * math.sin(k * 0.35), 0, k / (n - 1) * 7.5) for k in range(n)]
    trunk = F.tube("trunk", pts, [0.55 - 0.25 * (k / (n - 1)) for k in range(n)], 10, TRUNK, True)
    parts = [trunk]
    for k in range(1, n - 1):
        p = Vector(pts[k])
        for j in range(3):
            a = j / 3 * math.tau + k
            parts.append(limb("scale", p, p + Vector((math.cos(a) * 0.6, math.sin(a) * 0.6, -0.2)), 0.12, 0.02, TRUNK, 4))
    top = Vector(pts[-1])
    for i in range(11):
        a = i / 11 * math.tau
        d = Vector((math.cos(a), math.sin(a), 0))
        spine = [top + d * (s * 5.0) + Vector((0, 0, 1.2 * math.sin(s * math.pi * 0.8) - s * s * 2.2)) for s in (k / 11 for k in range(12))]
        parts.append(F.tube("rachis", spine, [0.08 * (1 - k / 11) + 0.02 for k in range(12)], 5, LEAF, False))
        side = Vector((-d.y, d.x, 0))
        for k in range(1, 11):
            s = k / 11
            p = spine[k]
            ln = 1.1 * math.sin(math.pi * min(1, s * 1.1)) + 0.15
            for sg in (1, -1):
                tip = p + side * sg * ln + d * 0.35 + Vector((0, 0, -0.25))
                parts.append(limb("leaflet", p, tip, 0.14, 0.02, LEAF if k % 2 else LEAF2, 4))
    export("fern", [join(parts, "Fern")], outdir)


def brachio(outdir):
    """A brachiosaurus wading in the shallows (feet at z=0 on the seabed, ~22 m tall)."""
    reset()
    SKIN = C("#7a8a6a")
    BELLY = C("#b8c0a0")
    body = sphere("body", 1.0, (0, 0, 7.5), None, (3.2, 6.0, 3.4), 24, 16)
    paint_verts(body, lambda c, n: SKIN if n.z > -0.3 else BELLY)
    parts = [body]
    n = 14
    neck = [(0, -4.5 - 3.0 * math.sin(s * 1.2), 9.0 + s * 12.5) for s in (k / (n - 1) for k in range(n))]
    nk = F.tube("neck", neck, [1.5 - 0.9 * (k / (n - 1)) for k in range(n)], 12, None, False)
    paint_verts(nk, lambda c, n2: SKIN if n2.y > -0.2 else BELLY)
    parts.append(nk)
    hp = Vector(neck[-1])
    head = sphere("head", 1.0, hp + Vector((0, -1.0, 0.3)), SKIN, (0.8, 1.6, 0.8), 16, 10)
    parts.append(head)
    parts.append(sphere("crest", 1.0, hp + Vector((0, -0.6, 1.0)), SKIN, (0.5, 0.7, 0.5), 10, 8))
    tail = [(0, 5.5 + s * 9.0, 7.5 - s * 5.5 + math.sin(s * 3) * 0.5) for s in (k / 11 for k in range(12))]
    parts.append(F.tube("tail", tail, [1.6 * (1 - k / 11) + 0.1 for k in range(12)], 10, SKIN, True))
    for sx in (1, -1):
        for sy, h in ((-3.4, 7.0), (3.6, 6.2)):
            parts.append(cyl("leg", 0.9, 1.0, h, (sx * 1.9, sy, h / 2), SKIN, 12))
    eyes = [sphere("eye", 0.2, hp + Vector((sx * 0.65, -1.6, 0.6)), C("#101418"), segs=8, rings=6) for sx in (1, -1)]
    parts += eyes
    export("brachio", [join(parts, "Brachio")], outdir)


def ptero(outdir):
    """Pterodactyl for the sky; wings span X so the flap animation bends them."""
    reset()
    SKIN = C("#a0603a")
    WING = C("#c88a5a")
    parts = [sphere("body", 1.0, (0, 0, 0), SKIN, (0.25, 0.7, 0.25), 14, 10),
             sphere("head", 1.0, (0, -0.8, 0.15), SKIN, (0.18, 0.3, 0.2), 12, 8),
             limb("beak", (0, -1.0, 0.12), (0, -1.6, 0.05), 0.1, 0.01, C("#e0c080"), 6),
             limb("crest", (0, -0.75, 0.25), (0, -0.2, 0.55), 0.08, 0.01, C("#d04a2a"), 5),
             limb("tail", (0, 0.6, 0), (0, 1.1, 0.05), 0.06, 0.01, SKIN, 5)]
    for s in (1, -1):
        wing = [(0, -0.3), (s * 1.2, -0.25), (s * 2.6, 0.1), (s * 3.2, 0.35), (s * 1.6, 0.35), (s * 0.4, 0.6), (0, 0.4)]
        parts.append(prism2d("wing", wing, 0.05, "XY", (0, 0, 0.02), WING))
        parts.append(limb("arm", (s * 0.2, -0.2, 0.05), (s * 3.1, 0.25, 0.05), 0.07, 0.03, SKIN, 5))
    parts += [sphere("eye", 0.05, (sx * 0.14, -0.9, 0.24), C("#101418"), segs=6, rings=4) for sx in (1, -1)]
    export("ptero", [join(parts, "Ptero")], outdir)


def bones(outdir):
    """A giant ribcage and skull half buried in the sand."""
    reset()
    BONE = C("#e0d6bc")
    n = 14
    spine = [(0, -8 + 16 * k / (n - 1), 3.5 + 1.2 * math.sin(k / (n - 1) * math.pi)) for k in range(n)]
    parts = [F.tube("spine", spine, [0.45 - 0.2 * abs(k / (n - 1) - 0.4) for k in range(n)], 8, BONE, True)]
    for k in range(2, 10):
        p = Vector(spine[k])
        h = 4.0 * math.sin(math.pi * (k - 1) / 9) + 1.5
        for s in (1, -1):
            rib = [p, p + Vector((s * h * 0.7, 0.3, -h * 0.2)), p + Vector((s * h * 0.95, 0.6, -h * 0.8)), p + Vector((s * h * 0.8, 0.8, -h * 1.3))]
            parts.append(F.tube("rib", rib, [0.3, 0.26, 0.2, 0.12], 6, BONE, False))
    parts.append(sphere("skull", 1.0, (0.5, -10.2, 2.0), BONE, (2.0, 3.2, 1.8), 16, 10))
    parts.append(sphere("socket", 0.55, (1.8, -11.0, 2.6), C("#2a2418"), segs=8, rings=6))
    parts.append(sphere("socket", 0.55, (-0.8, -11.0, 2.6), C("#2a2418"), segs=8, rings=6))
    for i in range(7):
        parts.append(limb("tooth", (-0.9 + i * 0.4, -12.8, 1.2), (-0.9 + i * 0.4, -12.9, 0.4), 0.18, 0.02, BONE, 5))
    export("bones", [join(parts, "Bones")], outdir)


def floatrock(outdir):
    """A floating island: flat top, jagged underside, hanging roots and fel crystals."""
    reset()
    ROCK = C("#3a3040")
    ROCK2 = C("#2a2230")
    TOP = C("#4a3a5a")
    rnd = random.Random(21)
    top = sphere("top", 1.0, (0, 0, 0), None, (10.0, 10.0, 2.2), 24, 12)
    for v in top.data.vertices:
        if v.co.z > 0.2:
            v.co.z = 0.2 + (v.co.z - 0.2) * 0.25
        else:
            k = 1.0 - v.co.z
            v.co.x *= 0.7 + 0.3 * rnd.random()
            v.co.y *= 0.7 + 0.3 * rnd.random()
            v.co.z *= 1.0 + 3.5 * (1 - abs(v.co.x) / 11) * (1 - abs(v.co.y) / 11) * rnd.uniform(0.6, 1.2) * (k > 0)
    paint(top, lambda c, n: TOP if n.z > 0.6 else (ROCK if rnd.random() < 0.6 else ROCK2))
    parts = [top]
    for i in range(6):
        a = rnd.random() * math.tau
        r = rnd.uniform(2, 7)
        p = Vector((math.cos(a) * r, math.sin(a) * r, -2))
        parts.append(limb("spike", p, p + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), -rnd.uniform(6, 14))), rnd.uniform(1.0, 2.2), 0.1, ROCK2, 6))
    for i in range(10):
        a = rnd.random() * math.tau
        r = rnd.uniform(6, 9.5)
        p = Vector((math.cos(a) * r, math.sin(a) * r, -0.5))
        root = [p + Vector((0.3 * math.sin(k), 0.3 * math.cos(k), -k * 1.2)) for k in range(7)]
        parts.append(F.tube("root", root, [0.18 * (1 - k / 6) + 0.03 for k in range(7)], 5, C("#2a3a2a"), False))
    body = join(parts, "Rock")
    glows = []
    for i in range(7):
        a = rnd.random() * math.tau
        r = rnd.uniform(1, 7)
        p = Vector((math.cos(a) * r, math.sin(a) * r, 0.2))
        glows.append(limb("crystal", p, p + Vector((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), rnd.uniform(2, 5))), rnd.uniform(0.4, 0.9), 0.05, C("#ffffff"), 5))
    export("floatrock", [body, join(glows, "Glow")], outdir)


def moonbase(outdir):
    """Lunar lander, satellite dish, astronaut flag and a monolith."""
    reset()
    FOIL = C("#e0b040")
    WHITE = C("#e8e8ec")
    GREY = C("#8a8e96")
    lander = [box("stage", (4.0, 4.0, 2.2), (0, 0, 3.2), FOIL, 0.15, 2),
              box("cabin", (3.0, 3.0, 2.4), (0, 0, 5.5), WHITE, 0.25, 2),
              cyl("nozzle", 0.6, 1.0, 1.0, (0, 0, 1.8), GREY, 12),
              box("hatch", (1.0, 0.1, 1.2), (0, -1.55, 5.3), GREY, 0.05, 1),
              box("window", (0.9, 0.1, 0.5), (0, -1.56, 6.3), C("#1a2030"), 0.05, 1)]
    for sx in (1, -1):
        for sy in (1, -1):
            foot = Vector((sx * 3.2, sy * 3.2, 0.1))
            lander.append(limb("leg", Vector((sx * 1.8, sy * 1.8, 3.0)), foot, 0.14, 0.12, GREY, 6))
            lander.append(cyl("pad", 0.6, 0.6, 0.15, tuple(foot), GREY, 10))
    for k in range(6):
        lander.append(box("rung", (0.8, 0.08, 0.08), (0, -2.2 - k * 0.15, 0.6 + k * 0.45), GREY))
    dish = [cyl("mast", 0.2, 0.25, 6.0, (0, 0, 3.0), GREY, 10), box("mount", (0.8, 0.8, 0.6), (0, 0, 6.2), GREY, 0.05, 1)]
    d = sphere("dish", 1.0, (0, -0.6, 7.4), WHITE, (2.6, 0.7, 2.6), 24, 10, (math.radians(-30), 0, 0))
    dish += [d, limb("feed", (0, -1.0, 7.4), (0, -3.0, 8.4), 0.08, 0.05, GREY, 6)]
    flag = [cyl("pole", 0.07, 0.07, 5.0, (0, 0, 2.5), GREY, 8), box("cloth", (2.4, 0.05, 1.5), (1.2, 0, 4.2), WHITE, 0.0, 1),
            box("stripe", (2.4, 0.06, 0.25), (1.2, 0, 4.2), C("#d03030"), 0.0, 1),
            box("canton", (0.9, 0.07, 0.7), (0.45, 0, 4.55), C("#3050c0"), 0.0, 1)]
    mono = [box("mono", (1.0, 4.0, 9.0), (0, 0, 4.5), C("#050507"), 0.02, 1)]
    export("moonbase", [join(lander, "Lander"), join(dish, "Dish"), join(flag, "MoonFlag"), join(mono, "Monolith")], outdir)


def neonprops(outdir):
    """Chrome palm, arcade cabinet and a neon FISH sign; glows are separate meshes."""
    reset()
    CHROME = C("#c8d0e0")
    PINK = C("#ff5ab0")
    DARK = C("#1a1030")
    n = 9
    pts = [(0.25 * math.sin(k * 0.5), 0, k / (n - 1) * 8.0) for k in range(n)]
    palm = [F.tube("trunk", pts, [0.4 - 0.15 * k / (n - 1) for k in range(n)], 10, CHROME, True)]
    top = Vector(pts[-1])
    palm_glow = []
    for i in range(7):
        a = i / 7 * math.tau
        d = Vector((math.cos(a), math.sin(a), 0))
        leaf = [top + d * (s * 4.0) + Vector((0, 0, 1.0 * math.sin(s * 2.4) - s * 1.4)) for s in (k / 7 for k in range(8))]
        palm.append(F.tube("leaf", leaf, [0.35 * math.sin(math.pi * min(1, k / 7 * 1.2 + 0.1)) + 0.03 for k in range(8)], 6, PINK, False))
    for k in range(1, n - 1, 2):
        palm_glow.append(torus("ring", 0.42 - 0.15 * k / (n - 1), 0.05, pts[k], C("#ffffff"), None, 16, 6))
    arcade = [box("cab", (1.4, 1.2, 3.2), (0, 0, 1.6), DARK, 0.05, 1), box("panel", (1.4, 0.8, 0.2), (0, -0.8, 1.9), C("#3a1a6a"), 0.03, 1,
              (math.radians(-15), 0, 0)), limb("stick", (0.3, -0.85, 2.0), (0.3, -0.85, 2.35), 0.05, 0.05, C("#202020"), 6),
              sphere("ball", 0.1, (0.3, -0.85, 2.4), C("#ff3030"), segs=8, rings=6)]
    arcade_glow = [box("screen", (1.1, 0.05, 0.9), (0, -0.62, 2.6), C("#ffffff"), 0.0, 1, (math.radians(-10), 0, 0)),
                   box("marquee", (1.3, 0.05, 0.4), (0, -0.62, 3.1), C("#ffffff"), 0.0, 1),
                   sphere("button", 0.08, (-0.3, -0.85, 2.02), C("#ffffff"), segs=8, rings=6)]
    sign = [box("frame", (9.0, 0.4, 3.2), (0, 0.3, 6.0), DARK, 0.1, 1), cyl("post", 0.25, 0.25, 4.5, (-3.5, 0.4, 2.25), CHROME, 8),
            cyl("post", 0.25, 0.25, 4.5, (3.5, 0.4, 2.25), CHROME, 8)]
    sign_glow = [text_mesh("text", "FISH", 2.2, 0.15, (0, -0.05, 5.6), (math.radians(90), 0, 0), C("#ffffff"))]
    for x in (-4.3, 4.3):
        sign_glow.append(box("bar", (0.15, 0.1, 3.0), (x, -0.1, 6.0), C("#ffffff"), 0.0, 1))
    export("neonprops", [join(palm, "Palm"), join(palm_glow, "PalmGlow"), join(arcade, "Arcade"), join(arcade_glow, "ArcadeGlow"),
                         join(sign, "Sign"), join(sign_glow, "SignGlow")], outdir)


BUILDERS = [portal, fern, brachio, ptero, bones, floatrock, moonbase, neonprops]
