"""Shared helpers for the scripted Blender model pipeline.

Conventions (after glTF export, which maps Blender (x, y, z) -> glTF (x, z, -y)):
  * Models face Blender -Y, which becomes +Z (forward) in the game.
  * Vertex colors live in a single CORNER-domain FLOAT_COLOR attribute named "Color",
    stored linear. `hexcol` converts sRGB hex to linear.
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise


def srgb2lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexcol(h, a=1.0):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb2lin(r), srgb2lin(g), srgb2lin(b), a)


def lerpcol(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(7)


def to_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)


def bake_transform(ob):
    """Apply the object's transform to its mesh data."""
    ob.data.transform(ob.matrix_basis)
    ob.matrix_basis = Matrix.Identity(4)


def set_origin(ob, pivot):
    pivot = Vector(pivot)
    bake_transform(ob)
    ob.data.transform(Matrix.Translation(-pivot))
    ob.location = pivot


def smooth(ob, on=True):
    for p in ob.data.polygons:
        p.use_smooth = on


def color_attr(ob, domain="CORNER"):
    me = ob.data
    attr = me.color_attributes.get("Color")
    if attr is None:
        attr = me.color_attributes.new(name="Color", type="FLOAT_COLOR", domain=domain)
    me.color_attributes.active_color = attr
    return attr


def paint(ob, fn):
    """fn(face_center_world, face_normal_world) -> linear rgba. Paints per face (crisp)."""
    attr = color_attr(ob)
    mw = ob.matrix_world
    nm = mw.to_3x3().inverted().transposed()
    for poly in ob.data.polygons:
        c = fn(mw @ poly.center, (nm @ poly.normal).normalized())
        for li in poly.loop_indices:
            attr.data[li].color = c


def paint_verts(ob, fn):
    """fn(vertex_co_world, vertex_normal_world) -> rgba. Smooth per-vertex values (CORNER storage)."""
    attr = color_attr(ob)
    mw = ob.matrix_world
    nm = mw.to_3x3().inverted().transposed()
    me = ob.data
    vals = [fn(mw @ v.co, (nm @ v.normal).normalized()) for v in me.vertices]
    for loop in me.loops:
        attr.data[loop.index].color = vals[loop.vertex_index]


def solid(color):
    return lambda c, n: color


def join(objs, name):
    objs = [o for o in objs if o is not None]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


# ---------------------------------------------------------------- materials + AO
# The game reads vertex color alpha as (material + ao * 0.999) / 16 (see wgsl/mesh.ts).
PAINT, WOOD, STONE, METAL, CLOTH, FOLIAGE, GLASS, GOLD, ICE, GLOSS, ORGANIC, SLIME = range(12)
AUTO = -1        # browns become wood, everything else paint
AUTO_METAL = -2  # like AUTO, but greys become metal
AUTO_GOLD = -3   # like AUTO_METAL, plus saturated yellows become gold

# Default material per exported file (or per mesh name inside it).
MATERIALS = {
    "boat": {"Motor": METAL, "Rockets": METAL, "Radar": METAL, "Lamp": METAL, "Flag": CLOTH, "*": AUTO_METAL},
    "fisher": CLOTH, "lure": GLOSS, "pier": AUTO_METAL, "shop": AUTO, "lighthouse": AUTO, "rock": STONE,
    "coral": ORGANIC, "iceberg": ICE, "pillar": STONE, "tentacle": SLIME, "crystal": GLASS, "gull": ORGANIC,
    "chest": AUTO_GOLD, "shipwreck": AUTO, "ghostship": AUTO, "skullrock": STONE, "barrel": METAL,
    "factory": AUTO_METAL, "lollipop": GLOSS, "candycane": GLOSS, "gumdrop": SLIME, "icecream": GLOSS,
    "dome": AUTO_GOLD, "statue": STONE, "arch": STONE, "spire": STONE, "outpost": AUTO_METAL,
    "aquarium": AUTO_METAL, "shell": GLOSS, "anchor": METAL, "pets": ORGANIC,
    "hats": {"HatCrown": GOLD, "HatViking": AUTO_METAL, "HatPropeller": AUTO_METAL, "HatPropellerBlades": GLOSS, "HatFish": GLOSS, "*": CLOTH},
}


def _lin2srgb(c):
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def classify(rgb, mode):
    import colorsys
    if mode >= 0:
        return mode
    h, s, v = colorsys.rgb_to_hsv(*(_lin2srgb(c) for c in rgb[:3]))
    if 0.03 < h < 0.12 and 0.3 < s < 0.85 and 0.15 < v < 0.8:
        return WOOD
    if mode in (AUTO_METAL, AUTO_GOLD) and s < 0.12 and 0.12 < v < 0.75:
        return METAL
    if mode == AUTO_GOLD and 0.1 < h < 0.17 and s > 0.5 and v > 0.55:
        return GOLD
    return PAINT


def _mesh_objects(objs):
    out = []

    def walk(o):
        if o.type == "MESH":
            out.append(o)
        for c in o.children:
            walk(c)

    for o in objs:
        walk(o)
    return out


def bake_ao_and_materials(name, objs, rays=20):
    """Writes material ids and raycast ambient occlusion into the vertex color alpha."""
    from mathutils.bvhtree import BVHTree
    meshes = [o for o in _mesh_objects(objs) if o.name != "Glow" and not o.name.startswith("Glow")]
    if not meshes:
        return
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        me = o.evaluated_get(dg).to_mesh()
        mw = o.matrix_world
        base = len(verts)
        for v in me.vertices:
            w = mw @ v.co
            verts.append(w)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
        polys += [[base + i for i in p.vertices] for p in me.polygons]
        o.evaluated_get(dg).to_mesh_clear()
    bvh = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    reach = max(0.08, min(3.0, (hi - lo).length * 0.18))
    rnd = random.Random(11)
    dirs = []
    for _ in range(rays):
        # cosine-weighted hemisphere around +Z
        u, v = rnd.random(), rnd.random()
        r, a = math.sqrt(u), v * math.tau
        dirs.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1 - u)))))
    fish = name.startswith("fish_")
    spec = MATERIALS.get(name, GLOSS if fish else AUTO)
    for o in meshes:
        attr = color_attr(o)
        me = o.data
        mw = o.matrix_world
        nm = mw.to_3x3().inverted().transposed()
        ao = []
        for v in me.vertices:
            n = (nm @ v.normal).normalized()
            p = mw @ v.co + n * (reach * 0.02 + 1e-3)
            q = n.to_track_quat("Z", "Y").to_matrix()
            hit = 0.0
            for d in dirs:
                loc, _, _, dist = bvh.ray_cast(p, q @ d, reach)
                if loc is not None:
                    hit += 1.0 - (dist / reach) * 0.5
            ao.append(max(0.25, 1.0 - hit / len(dirs) * 0.95))
        mode = spec.get(o.name, spec.get("*", AUTO)) if isinstance(spec, dict) else spec
        for loop in me.loops:
            c = attr.data[loop.index].color
            occ = ao[loop.vertex_index]
            if fish and o.name == "Body":
                a = occ * 0.999
            else:
                a = (classify(c, mode) + occ * 0.999) / 16.0
            attr.data[loop.index].color = (c[0], c[1], c[2], a)


def export(name, objs, outdir):
    bake_ao_and_materials(name, objs)
    bpy.ops.object.select_all(action="DESELECT")

    def sel(o):
        o.select_set(True)
        for c in o.children:
            sel(c)

    for o in objs:
        sel(o)
    path = os.path.join(outdir, name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_vertex_color="ACTIVE",
        export_materials="NONE",
        export_normals=True,
        export_animations=False,
        export_extras=False,
    )
    print("exported", path)


# ---------------------------------------------------------------- primitives

def box(name, size, loc, color=None, bevel=0.0, segs=2, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = to_obj(name, bm)
    if bevel > 0:
        m = ob.modifiers.new("bev", "BEVEL")
        m.width = bevel
        m.segments = segs
        m.limit_method = "NONE"
        apply_mods(ob)
    if rot:
        ob.rotation_euler = rot
    ob.location = loc
    bake_transform(ob)
    smooth(ob)
    if color:
        paint(ob, solid(color) if not callable(color) else color)
    return ob


def cyl(name, r1, r2, depth, loc, color=None, segs=16, rot=None, caps=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs,
                          radius1=r1, radius2=r2, depth=depth)
    ob = to_obj(name, bm)
    if rot:
        ob.rotation_euler = rot
    ob.location = loc
    bake_transform(ob)
    smooth(ob)
    if color:
        paint(ob, solid(color) if not callable(color) else color)
    return ob


def sphere(name, radius, loc, color=None, scale=(1, 1, 1), segs=16, rings=10, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=radius)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    ob = to_obj(name, bm)
    if rot:
        ob.rotation_euler = rot
    ob.location = loc
    bake_transform(ob)
    smooth(ob)
    if color:
        paint(ob, solid(color) if not callable(color) else color)
    return ob


def ico(name, radius, loc, subdiv=2, color=None, jitter=0.0, scale=(1, 1, 1), seed=0, flat=False):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    rnd = random.Random(seed)
    if jitter:
        off = Vector((rnd.random() * 10, rnd.random() * 10, rnd.random() * 10))
        for v in bm.verts:
            n = noise.noise(v.co * 1.3 / radius + off)
            v.co *= 1.0 + jitter * n + jitter * 0.4 * (rnd.random() - 0.5)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    ob = to_obj(name, bm)
    ob.location = loc
    bake_transform(ob)
    smooth(ob, not flat)
    if color:
        paint(ob, solid(color) if not callable(color) else color)
    return ob


def torus(name, R, r, loc, color=None, rot=None, seg=24, rseg=10):
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = i / seg * math.tau
        ring = []
        for j in range(rseg):
            b = j / rseg * math.tau
            x = (R + r * math.cos(b)) * math.cos(a)
            y = (R + r * math.cos(b)) * math.sin(a)
            z = r * math.sin(b)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for i in range(seg):
        for j in range(rseg):
            a = rings[i][j]
            b = rings[(i + 1) % seg][j]
            c = rings[(i + 1) % seg][(j + 1) % rseg]
            d = rings[i][(j + 1) % rseg]
            bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = to_obj(name, bm)
    if rot:
        ob.rotation_euler = rot
    ob.location = loc
    bake_transform(ob)
    smooth(ob)
    if color:
        paint(ob, solid(color) if not callable(color) else color)
    return ob


def limb(name, p1, p2, r1, r2, color=None, segs=12):
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    ob = cyl(name, r1, r2, d.length, (0, 0, 0), None, segs)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    ob.rotation_euler = q.to_euler()
    ob.location = (p1 + p2) / 2
    bake_transform(ob)
    if color:
        paint(ob, solid(color))
    return ob


def prism2d(name, pts, thickness, plane="YZ", loc=(0, 0, 0), color=None, rot=None):
    """Extrude a 2D polygon (list of (u, v)) by thickness.
    plane YZ: u->y, v->z, thickness along x. plane XY: u->x, v->y, thickness along z."""
    bm = bmesh.new()
    h = thickness / 2

    def mk(u, v, w):
        if plane == "YZ":
            return bm.verts.new((w, u, v))
        if plane == "XZ":
            return bm.verts.new((u, w, v))
        return bm.verts.new((u, v, w))

    front = [mk(u, v, h) for u, v in pts]
    back = [mk(u, v, -h) for u, v in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = to_obj(name, bm)
    if rot:
        ob.rotation_euler = rot
    ob.location = loc
    bake_transform(ob)
    smooth(ob, False)
    if color:
        paint(ob, solid(color) if not callable(color) else color)
    return ob


def text_mesh(name, body, size, extrude, loc, rot, color, align="CENTER"):
    cu = bpy.data.curves.new(name, type="FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = "CENTER"
    try:
        cu.font = bpy.data.fonts.load("/System/Library/Fonts/Supplemental/Arial Black.ttf")
    except Exception:
        pass
    tob = bpy.data.objects.new(name + "_curve", cu)
    bpy.context.scene.collection.objects.link(tob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tob.evaluated_get(dg))
    bpy.data.objects.remove(tob)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = rot
    ob.location = loc
    bake_transform(ob)
    smooth(ob, False)
    paint(ob, solid(color))
    return ob


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    if parent is not None:
        e.parent = parent
        e.location = Vector(loc) - parent.location
    else:
        e.location = loc
    return e
