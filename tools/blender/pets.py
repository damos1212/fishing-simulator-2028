"""Boat pets. Each pet is a separate mesh in pets.glb, sitting on its origin, facing -Y (game +Z).
Vertex colors are real colors (mode 0)."""
import math

import fish as F
from lib import box, cyl, export, hexcol, join, limb, prism2d, reset, sphere

C = hexcol
EYE = C("#15181c")
WHITE = C("#ffffff")


def eyes(y, z, x=0.07, r=0.035):
    out = []
    for s in (1, -1):
        out.append(sphere("ew", r, (s * x, y, z), WHITE, segs=10, rings=8))
        out.append(sphere("ep", r * 0.6, (s * x, y - r * 0.5, z + r * 0.1), EYE, segs=8, rings=6))
    return out


def cat():
    O = C("#f0a040")
    parts = [sphere("body", 1.0, (0, 0.05, 0.2), O, (0.2, 0.26, 0.2), 16, 12),
             sphere("head", 0.17, (0, -0.12, 0.47), O, segs=16, rings=12),
             sphere("muzzle", 1.0, (0, -0.26, 0.43), WHITE, (0.08, 0.05, 0.05), 10, 8),
             sphere("nose", 0.02, (0, -0.31, 0.46), C("#ff8aa0"), segs=6, rings=4)]
    for s in (1, -1):
        parts.append(prism2d("ear", [(-0.06, 0), (0.06, 0), (0.0, 0.12)], 0.03, "XZ", (s * 0.09, -0.12, 0.58), O))
        parts.append(sphere("paw", 1.0, (s * 0.09, -0.16, 0.03), WHITE, (0.05, 0.08, 0.04), 8, 6))
    pts = [(0.0, 0.25 + 0.1 * t, 0.08 + math.sin(t * 2.4) * 0.35) for t in (k / 9 for k in range(10))]
    parts.append(F.tube("tail", pts, [0.04] * 10, 6, O, True))
    parts += eyes(-0.26, 0.52)
    for s in (1, -1):
        parts.append(box("stripe", (0.3, 0.03, 0.02), (0, 0.05 + s * 0.08, 0.38), C("#c07020")))
    return join(parts, "PetCat")


def parrot():
    G = C("#2ec040")
    parts = [sphere("body", 1.0, (0, 0.02, 0.28), G, (0.13, 0.13, 0.22), 14, 10),
             sphere("head", 0.12, (0, -0.04, 0.52), C("#ff3a2a"), segs=14, rings=10),
             cyl("beak", 0.05, 0.005, 0.1, (0, -0.16, 0.5), C("#f0e0a0"), 8, (math.radians(100), 0, 0)),
             prism2d("tail", [(-0.05, 0.1), (0.05, 0.1), (0.02, -0.25), (-0.02, -0.25)], 0.02, "XZ", (0, 0.12, 0.25), C("#3a6aff"))]
    for s in (1, -1):
        parts.append(sphere("wing", 1.0, (s * 0.12, 0.03, 0.28), C("#ffd23a"), (0.04, 0.1, 0.16), 10, 8))
        parts.append(limb("leg", (s * 0.04, 0, 0.1), (s * 0.04, 0, 0.0), 0.015, 0.015, C("#a07050"), 6))
    parts += eyes(-0.13, 0.56, 0.06, 0.03)
    return join(parts, "PetParrot")


def penguin():
    BK = C("#1a1c24")
    parts = [sphere("body", 1.0, (0, 0, 0.26), BK, (0.18, 0.16, 0.26), 16, 12),
             sphere("belly", 1.0, (0, -0.07, 0.24), WHITE, (0.14, 0.1, 0.21), 14, 10),
             sphere("head", 0.13, (0, -0.02, 0.56), BK, segs=14, rings=10),
             cyl("beak", 0.035, 0.005, 0.1, (0, -0.16, 0.54), C("#ffa020"), 8, (math.radians(95), 0, 0))]
    for s in (1, -1):
        parts.append(sphere("flip", 1.0, (s * 0.17, 0, 0.28), BK, (0.04, 0.07, 0.15), 8, 6))
        parts.append(sphere("foot", 1.0, (s * 0.07, -0.06, 0.01), C("#ffa020"), (0.06, 0.08, 0.02), 8, 6))
    parts += eyes(-0.12, 0.6, 0.05, 0.028)
    return join(parts, "PetPenguin")


def crabpet():
    R = C("#ff5a3a")
    parts = [sphere("body", 1.0, (0, 0, 0.1), R, (0.22, 0.16, 0.09), 16, 10)]
    for s in (1, -1):
        for i in range(3):
            y = -0.05 + i * 0.06
            parts.append(F.tube("leg", [(s * 0.18, y, 0.08), (s * 0.3, y, 0.12), (s * 0.34, y + 0.02, 0.0)], [0.02, 0.016, 0.01], 5, R, False))
        parts.append(sphere("claw", 1.0, (s * 0.2, -0.22, 0.14), R, (0.07, 0.08, 0.05), 10, 8))
        parts.append(limb("stalk", (s * 0.05, -0.1, 0.15), (s * 0.06, -0.12, 0.24), 0.012, 0.012, R, 6))
        parts.append(sphere("e", 0.03, (s * 0.06, -0.12, 0.26), WHITE, segs=8, rings=6))
        parts.append(sphere("p", 0.018, (s * 0.06, -0.145, 0.265), EYE, segs=6, rings=4))
    return join(parts, "PetCrab")


def ghost():
    W = C("#e8f4ff")
    body = sphere("body", 1.0, (0, 0, 0.4), W, (0.2, 0.2, 0.3), 16, 12)
    parts = [body]
    for i in range(6):
        a = i / 6 * math.tau
        parts.append(sphere("wisp", 0.06, (math.cos(a) * 0.15, math.sin(a) * 0.15, 0.12), W, segs=8, rings=6))
    for s in (1, -1):
        parts.append(sphere("eye", 1.0, (s * 0.07, -0.18, 0.47), EYE, (0.03, 0.02, 0.05), 8, 6))
    parts.append(sphere("mouth", 1.0, (0, -0.19, 0.36), EYE, (0.04, 0.02, 0.03), 8, 6))
    return join(parts, "PetGhost")


def alien():
    G = C("#7aff6a")
    parts = [sphere("body", 1.0, (0, 0, 0.18), G, (0.12, 0.1, 0.16), 14, 10),
             sphere("head", 1.0, (0, -0.02, 0.48), G, (0.2, 0.17, 0.16), 16, 12)]
    for s in (1, -1):
        parts.append(sphere("eye", 1.0, (s * 0.08, -0.15, 0.49), EYE, (0.06, 0.03, 0.04), 10, 8))
        parts.append(limb("ant", (s * 0.06, 0, 0.6), (s * 0.12, 0.02, 0.76), 0.012, 0.012, G, 6))
        parts.append(sphere("tip", 0.03, (s * 0.12, 0.02, 0.78), C("#ffe040"), segs=8, rings=6))
        parts.append(limb("arm", (s * 0.1, 0, 0.24), (s * 0.18, -0.05, 0.12), 0.025, 0.02, G, 6))
    parts.append(cyl("saucer", 0.3, 0.3, 0.04, (0, 0, -0.02), C("#a0a8b8"), 20))
    return join(parts, "PetAlien")


def build(outdir):
    reset()
    export("pets", [cat(), parrot(), penguin(), crabpet(), ghost(), alien()], outdir)
