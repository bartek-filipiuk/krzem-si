"""Procedural polycrystalline silicon chunk -> baked runtime GLBs (2K, 1K) + entry-face patch.

  blender -b --factory-startup -P tools/blender/silicon_chunk.py -- [--seed 14] [--preview out.webp]

The shape is an implicit surface: a lumpy ellipsoid ("rod skin") intersected with seeded fracture
half-spaces whose boundary is curved (conchoidal bowl + concentric ripples), minus a few stepped
terraces and scalloped edge chips. Smooth-max gives the small edge bevel. A dense icosphere is
projected onto that surface (high-res bake source). Micro-relief (hackle striations radiating
from each face's impact point, sparse pits) lives only in the high-res shader and reaches the
runtime mesh through the baked normal and roughness maps.
"""
import argparse
import json
import math
import pathlib
import sys

import bmesh
import bpy
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import studio  # noqa: E402

ROOT = studio.ROOT
MODELS = ROOT / "src/assets/models"
OUT = HERE / "out"
EDGE_K = 0.0055          # smooth-max radius = edge bevel (object ~1.0 m)
BASE_COLOR = (0.228, 0.262, 0.300)   # linear, ~#848b95 sRGB: cool dark grey-blue
METALLIC = 0.9
BUMP_DIST = 0.0009       # metres per unit of the shader height signal
GRAIN_SCALE = 40.0       # Voronoi cells per metre (~2.5 cm grains)
GRAIN_TILT = 0.022       # facet tilt of a grain (slope, ~1.3 degrees)


def args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=14)
    ap.add_argument("--subdiv", type=int, default=9, help="icosphere level of the high-res source")
    ap.add_argument("--preview", help="render the high-res source (procedural shader) to this webp and stop")
    ap.add_argument("--blend", action="store_true", help="also save the runtime scene to tools/blender/src/")
    return ap.parse_args(studio.argv())


# ------------------------------------------------------------------ implicit shape

def unit(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def frame(n, ref=None):
    """Orthonormal in-plane basis (e1, e2) for normal n."""
    for r in ([] if ref is None else [ref]) + [np.array([0.0, 0, 1]), np.array([1.0, 0, 0])]:
        if abs(np.dot(r, n)) < 0.95:
            e1 = unit(np.cross(n, r))
            return e1, np.cross(n, e1)


def rand_rot(rng):
    q = unit(rng.normal(size=4))
    w, x, y, z = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def smax(a, b, k):
    h = np.clip(0.5 + 0.5 * (a - b) / k, 0, 1)
    return b + (a - b) * h + k * h * (1 - h)


class Chunk:
    """All pieces are 'outside-positive' terms; the solid is their smooth intersection."""

    def __init__(self, seed):
        rng = np.random.default_rng(seed)
        self.rng = rng
        self.R = np.array([0.68, 0.46, 0.39]) * rng.uniform(0.93, 1.07, 3)
        self.Rot = rand_rot(rng)
        self.lump_k = rng.normal(size=(9, 3)) * 9.0
        self.lump_a = rng.uniform(0.002, 0.005, 9)
        self.lump_p = rng.uniform(0, 2 * np.pi, 9)
        self.pieces = []   # dicts: kind, frame (q,e1,e2,n), rough, id
        self._planes(rng)

    # --- base: lumpy ellipsoid (the original rod skin, only small patches survive the cuts)
    def base(self, p):
        lp = p @ self.Rot
        k0 = np.linalg.norm(lp / self.R, axis=1)
        k1 = np.linalg.norm(lp / self.R ** 2, axis=1)
        d = k0 * (k0 - 1) / np.maximum(k1, 1e-9)
        return d + (np.sin(p @ self.lump_k.T + self.lump_p) * self.lump_a).sum(1)

    def support(self, n):
        return math.sqrt(float(((self.Rot.T @ n) * self.R) @ ((self.Rot.T @ n) * self.R)))

    def _planes(self, rng):
        N = int(rng.integers(17, 21))
        i = np.arange(N) + 0.5
        phi = np.arccos(1 - 2 * i / N)
        th = np.pi * (1 + 5 ** 0.5) * i
        dirs = np.stack([np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)], 1)
        dirs = unit(dirs @ rand_rot(rng).T + rng.normal(scale=0.22, size=dirs.shape))
        depth = rng.uniform(0.72, 0.93, N)
        depth[rng.permutation(N)[:3]] = rng.uniform(0.52, 0.62, 3)   # three large faces
        self.planes = []
        for n, dep in zip(dirs, depth):
            s = self.support(n)
            d = s * dep
            rad = math.sqrt(max(s * s - d * d, 1e-4))
            e1, e2 = frame(n)
            a = rng.uniform(0, 2 * np.pi)
            dirq = math.cos(a) * e1 + math.sin(a) * e2
            # impact point outside the face: ripples and hackle cross it as arcs and fan lines, never a bullseye
            q = n * d + dirq * rad * rng.uniform(1.15, 1.5)
            e1 = unit(-dirq)                                        # theta = 0 points across the face
            e2 = np.cross(n, e1)
            flat = rng.random() < 0.35
            pl = dict(n=n, d=d, q=q, e1=e1, e2=e2, rad=rad,
                      kappa=(rng.uniform(-0.25, 0.2) if flat else rng.uniform(-1.1, 0.7)),
                      amp=rng.uniform(0.0001, 0.0004), lam=rng.uniform(0.04, 0.09),
                      decay=rng.uniform(0.18, 0.4),
                      wk=unit(rng.normal(size=2)) * rng.uniform(12, 25), wa=rng.uniform(0.001, 0.003),
                      wp=rng.uniform(0, 2 * np.pi), flat=flat)
            self.planes.append(pl)

    def plane_term(self, pl, p):
        rel = p - pl["q"]
        u, v = rel @ pl["e1"], rel @ pl["e2"]
        r = np.hypot(u, v)
        g = (-0.5 * pl["kappa"] * r * r
             + pl["amp"] * np.sin(2 * np.pi * r / pl["lam"] + 0.9 * np.sin(3 * np.arctan2(v, u) + pl["wp"]))
             * np.exp(-r / pl["decay"])
             + pl["wa"] * np.sin(u * pl["wk"][0] + v * pl["wk"][1] + pl["wp"]))
        return p @ pl["n"] - pl["d"] - g

    def add_details(self):
        """Steps and chips are placed on the fractured solid, so they need a first surface pass."""
        rng = self.rng
        dirs = unit(rng.normal(size=(30000, 3)))
        pts = self.surface(dirs, with_details=False)
        vals = np.stack([self.plane_term(pl, pts) for pl in self.planes])
        order = np.argsort(vals, 0)
        top2 = np.take_along_axis(vals, order[-2:], 0)
        on_edge = (np.abs(top2[1] - top2[0]) < 0.004) & (top2[1] > -0.01)
        edge_pts, fa, fb = pts[on_edge], order[-1][on_edge], order[-2][on_edge]
        self.steps = []
        big = sorted(range(len(self.planes)), key=lambda i: -self.planes[i]["rad"])[:4]
        for i in big:
            pl = self.planes[i]
            m = unit(pl["e1"] * rng.uniform(-0.4, 0.4) + pl["e2"] * rng.choice([-1, 1]))
            t = float(pl["n"] * pl["d"] @ m) + pl["rad"] * rng.uniform(0.2, 0.45)
            self.steps.append(dict(plane=i, m=m, t=t, h=rng.uniform(0.014, 0.03)))
        # Scalloped chips: a flake taken off face A starting at its edge with face B.
        self.chips = []
        M = int(rng.integers(9, 13))
        picks = []
        for k in rng.permutation(len(edge_pts)):
            c = edge_pts[k]
            if all(np.linalg.norm(c - o) > 0.16 for o, _, _ in picks):
                picks.append((c, fa[k], fb[k]))
            if len(picks) == M:
                break
        for c, a, b in picks:
            if rng.random() < 0.5:
                a, b = b, a
            na, nb = self.planes[a]["n"], self.planes[b]["n"]
            t = unit(np.cross(na, nb))
            n = unit(na + 0.35 * nb)                     # scar plane leans slightly toward the edge
            w = np.cross(n, t)
            # a few large shallow conchoidal scoops, the rest small edge chips
            size = rng.uniform(0.2, 0.32) if len(self.chips) < 3 else rng.uniform(0.05, 0.13)
            wide = rng.uniform(0.45, 0.7) if size > 0.15 else rng.uniform(0.28, 0.4)   # small chips run along the edge
            radii = np.array([size, size * wide, size * rng.uniform(0.12, 0.2)])
            centre = c + n * radii[2] * rng.uniform(0.35, 0.6) - w * radii[1] * 0.15 * np.sign(w @ nb)
            self.chips.append(dict(c=centre, axes=np.stack([t, w, n]), radii=radii,
                                   q=c, e1=t, e2=w, n=n))

    def step_parts(self, st, p):
        pl = self.planes[st["plane"]]
        return self.plane_term(pl, p) + st["h"], p @ st["m"] - st["t"]

    @staticmethod
    def chip_term(ch, p):
        lp = (p - ch["c"]) @ ch["axes"].T
        k0 = np.linalg.norm(lp / ch["radii"], axis=1)
        k1 = np.linalg.norm(lp / ch["radii"] ** 2, axis=1)
        return -(k0 * (k0 - 1) / np.maximum(k1, 1e-9))

    def terms(self, p, with_details=True):
        out = [self.base(p)] + [self.plane_term(pl, p) for pl in self.planes]
        if with_details:
            out += [np.minimum(*self.step_parts(st, p)) for st in self.steps]
            out += [self.chip_term(ch, p) for ch in self.chips]
        return out

    def sdf(self, p, with_details=True):
        ts = self.terms(p, with_details)
        f = ts[0]
        for t in ts[1:]:
            f = smax(f, t, EDGE_K)
        return f

    def grad(self, p, eps=2e-4):
        g = np.zeros_like(p)
        for a in range(3):
            o = np.zeros(3)
            o[a] = eps
            g[:, a] = (self.sdf(p + o) - self.sdf(p - o)) / (2 * eps)
        return g

    def surface(self, dirs, with_details=True):
        lo, hi = np.zeros(len(dirs)), np.full(len(dirs), 1.2)
        for _ in range(28):
            mid = 0.5 * (lo + hi)
            inside = self.sdf(dirs * mid[:, None], with_details) < 0
            lo, hi = np.where(inside, mid, lo), np.where(inside, hi, mid)
        return dirs * (0.5 * (lo + hi))[:, None]

    def project(self, p, steps=2):
        for _ in range(steps):
            g = self.grad(p)
            p = p - (self.sdf(p) / np.maximum((g * g).sum(1), 1e-8))[:, None] * g
        return p

    def piece_frames(self):
        """One entry per surface piece: (kind, q, e1, e2, n, roughness). Index = piece id."""
        rng = np.random.default_rng(1000)
        fr = [("skin", np.zeros(3), np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0]), 0.55)]
        for pl in self.planes:
            rough = rng.uniform(0.2, 0.28) if pl["flat"] else rng.uniform(0.26, 0.42)
            fr.append(("fracture", pl["q"], pl["e1"], pl["e2"], pl["n"], rough))
        for st in self.steps:
            pl = self.planes[st["plane"]]
            fr.append(("riser", pl["q"], st["m"], pl["n"], np.cross(st["m"], pl["n"]), rng.uniform(0.3, 0.45)))
        for ch in self.chips:
            fr.append(("chip", ch["q"], ch["e1"], ch["e2"], ch["n"], rng.uniform(0.28, 0.4)))
        return fr

    def piece_ids(self, p):
        """Which piece is the active surface at p (argmax of the terms; a step splits into terrace/riser)."""
        ts = self.terms(p)
        P = len(self.planes)
        ids = np.argmax(np.stack(ts), 0)
        for j, st in enumerate(self.steps):
            sel = ids == 1 + P + j
            terrace, riser = self.step_parts(st, p[sel])
            ids[sel] = np.where(terrace < riser, 1 + st["plane"], 1 + P + j)
        return ids


# ------------------------------------------------------------------ high-res mesh

def mesh_arrays(me):
    v = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", v)
    e = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", e)
    return v.reshape(-1, 3), e.reshape(-1, 2)


def build_highres(chunk, subdiv):
    me = bpy.data.meshes.new("chunk_high")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    bm.to_mesh(me)
    bm.free()
    v, e = mesh_arrays(me)
    print(f"icosphere: {len(v)} verts")
    p = chunk.surface(unit(v))
    p = chunk.project(p, 2)
    deg = np.bincount(e.ravel(), minlength=len(p)).astype(float)
    for it in range(4):   # tangential relaxation, then back onto the surface
        nb = np.zeros_like(p)
        for a in range(3):
            nb[:, a] = (np.bincount(e[:, 0], p[e[:, 1], a], len(p)) + np.bincount(e[:, 1], p[e[:, 0], a], len(p))) / deg
        n = unit(chunk.grad(p))
        dlt = nb - p
        dlt -= (dlt * n).sum(1, keepdims=True) * n
        p = chunk.project(p + 0.5 * dlt, 2)
        print("relax", it, float(np.abs(chunk.sdf(p)).max()))
    return me, p


def normalise(chunk, p):
    lo, hi = p.min(0), p.max(0)
    centre = 0.5 * (lo + hi)
    scale = 1.0 / float((hi - lo).max())
    return centre, scale


def write_attributes(me, chunk, p_src, centre, scale):
    ids = chunk.piece_ids(p_src)
    fr = chunk.piece_frames()
    q = np.array([f[1] for f in fr])[ids]
    e1 = np.array([f[2] for f in fr])[ids]
    e2 = np.array([f[3] for f in fr])[ids]
    rough = np.array([f[5] for f in fr])[ids]
    kind = np.array([{"skin": 0.0, "fracture": 1.0, "riser": 1.0, "chip": 1.0}[f[0]] for f in fr])[ids]
    rel = p_src - q
    u, v = (rel * e1).sum(1), (rel * e2).sum(1)
    r = np.hypot(u, v) * scale
    theta = np.arctan2(v, u)
    hashv = (np.sin(ids * 12.9898) * 43758.5453) % 1.0
    frac = np.stack([r, theta * 0.3, hashv], 1)            # radial dist, arc coordinate, per-piece hash
    me.attributes.new("frac", "FLOAT_VECTOR", "POINT").data.foreach_set("vector", frac.ravel())
    me.attributes.new("rough", "FLOAT", "POINT").data.foreach_set("value", rough)
    me.attributes.new("fracture", "FLOAT", "POINT").data.foreach_set("value", kind)
    return ids


# ------------------------------------------------------------------ materials

def node(nt, kind, loc, **inputs):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, val in inputs.items():
        n.inputs[k].default_value = val
    return n


def math_node(nt, op, loc, a=None, b=None):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.location = loc
    if a is not None:
        n.inputs[0].default_value = a
    if b is not None:
        n.inputs[1].default_value = b
    return n


def highres_material():
    """Procedural source material. Everything that is not in the geometry is here and gets baked."""
    mat = bpy.data.materials.new("silicon_high")
    nt = mat.node_tree
    nt.nodes.clear()
    L = nt.links.new
    out = node(nt, "ShaderNodeOutputMaterial", (1400, 0))
    bsdf = node(nt, "ShaderNodeBsdfPrincipled", (1100, 0), Metallic=METALLIC)
    bsdf.inputs["Base Color"].default_value = (*BASE_COLOR, 1)
    L(bsdf.outputs[0], out.inputs[0])

    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name, attr.location = "frac", (-1200, 0)
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    sep.location = (-1000, 0)
    L(attr.outputs["Vector"], sep.inputs[0])
    rough_attr = nt.nodes.new("ShaderNodeAttribute")
    rough_attr.attribute_name, rough_attr.location = "rough", (-1000, 300)
    kind_attr = nt.nodes.new("ShaderNodeAttribute")
    kind_attr.attribute_name, kind_attr.location = "fracture", (-1000, 450)

    # hackle: streaks radiating from the impact point -> fine along the arc, long along the radius
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    comb.location = (-800, 0)
    arc = math_node(nt, "MULTIPLY", (-900, -100), None, 170.0)
    L(sep.outputs["Y"], arc.inputs[0])
    rad = math_node(nt, "MULTIPLY", (-900, -250), None, 5.0)
    L(sep.outputs["X"], rad.inputs[0])
    seed = math_node(nt, "MULTIPLY", (-900, -400), None, 37.0)
    L(sep.outputs["Z"], seed.inputs[0])
    L(arc.outputs[0], comb.inputs[0])
    L(rad.outputs[0], comb.inputs[1])
    L(seed.outputs[0], comb.inputs[2])
    hackle = node(nt, "ShaderNodeTexNoise", (-600, 0), Scale=1.0, Detail=3.0, Roughness=0.55)
    L(comb.outputs[0], hackle.inputs["Vector"])
    # hackle fades in with distance from the impact point (mirror zone near it is smooth)
    fade = node(nt, "ShaderNodeMapRange", (-600, -250))
    fade.inputs["From Min"].default_value, fade.inputs["From Max"].default_value = 0.08, 0.35
    fade.inputs["To Max"].default_value = 0.45       # hackle amplitude
    L(sep.outputs["X"], fade.inputs["Value"])
    hk = math_node(nt, "SUBTRACT", (-400, 0), None, 0.5)
    L(hackle.outputs["Fac"], hk.inputs[0])
    hkf = math_node(nt, "MULTIPLY", (-250, 0))
    L(hk.outputs[0], hkf.inputs[0])
    L(fade.outputs[0], hkf.inputs[1])

    # Wallner-like fine rings around the impact point
    ring = math_node(nt, "MULTIPLY", (-600, -500), None, 2 * math.pi / 0.0065)
    L(sep.outputs["X"], ring.inputs[0])
    rs = math_node(nt, "SINE", (-450, -500))
    L(ring.outputs[0], rs.inputs[0])
    rsa = math_node(nt, "MULTIPLY", (-300, -500), None, 0.025)
    L(rs.outputs[0], rsa.inputs[0])

    # sparse pits
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tc.location = (-1200, -700)
    vor = node(nt, "ShaderNodeTexVoronoi", (-900, -700), Scale=22.0)
    L(tc.outputs["Object"], vor.inputs["Vector"])
    sel = math_node(nt, "LESS_THAN", (-700, -800), None, 0.07)
    colsep = nt.nodes.new("ShaderNodeSeparateColor")
    colsep.location = (-750, -950)
    L(vor.outputs["Color"], colsep.inputs[0])
    L(colsep.outputs[0], sel.inputs[0])
    pitshape = node(nt, "ShaderNodeMapRange", (-700, -600))
    pitshape.inputs["From Min"].default_value, pitshape.inputs["From Max"].default_value = 0.07, 0.0
    L(vor.outputs["Distance"], pitshape.inputs["Value"])
    pit = math_node(nt, "MULTIPLY", (-500, -700))
    L(pitshape.outputs[0], pit.inputs[0])
    L(sel.outputs[0], pit.inputs[1])

    # skin (rod surface): cauliflower bumps
    skin = node(nt, "ShaderNodeTexNoise", (-600, 400), Scale=55.0, Detail=4.0, Roughness=0.6)
    L(tc.outputs["Object"], skin.inputs["Vector"])

    # polycrystalline grains: each Voronoi cell is a facet with its own small tilt
    grain = node(nt, "ShaderNodeTexVoronoi", (-900, -1150), Scale=GRAIN_SCALE)
    L(tc.outputs["Object"], grain.inputs["Vector"])
    gvec = nt.nodes.new("ShaderNodeVectorMath")
    gvec.operation, gvec.location = "MULTIPLY_ADD", (-700, -1150)
    gvec.inputs[1].default_value = (2, 2, 2)
    gvec.inputs[2].default_value = (-1, -1, -1)
    L(grain.outputs["Color"], gvec.inputs[0])
    gworld = nt.nodes.new("ShaderNodeVectorTransform")
    gworld.vector_type, gworld.convert_from, gworld.convert_to = "VECTOR", "OBJECT", "WORLD"
    gworld.location = (-500, -1150)
    L(gvec.outputs[0], gworld.inputs[0])

    frac_h = math_node(nt, "ADD", (-100, -200))
    L(hkf.outputs[0], frac_h.inputs[0])
    L(rsa.outputs[0], frac_h.inputs[1])
    pitneg = math_node(nt, "MULTIPLY", (-300, -700), None, -1.2)
    L(pit.outputs[0], pitneg.inputs[0])
    frac_h2 = math_node(nt, "ADD", (50, -200))
    L(frac_h.outputs[0], frac_h2.inputs[0])
    L(pitneg.outputs[0], frac_h2.inputs[1])
    height = node(nt, "ShaderNodeMix", (250, 0))
    height.data_type = "FLOAT"
    L(kind_attr.outputs["Fac"], height.inputs["Factor"])
    L(skin.outputs["Fac"], height.inputs["A"])
    L(frac_h2.outputs[0], height.inputs["B"])
    bump = node(nt, "ShaderNodeBump", (600, -200), Strength=1.0, Distance=BUMP_DIST)
    L(height.outputs["Result"], bump.inputs["Height"])
    # tilt the bumped normal per grain (fracture pieces only); no height step -> no boundary lines
    tilt = math_node(nt, "MULTIPLY", (600, -500), None, GRAIN_TILT)
    L(kind_attr.outputs["Fac"], tilt.inputs[0])
    gscale = nt.nodes.new("ShaderNodeVectorMath")
    gscale.operation, gscale.location = "SCALE", (700, -600)
    L(gworld.outputs[0], gscale.inputs[0])
    L(tilt.outputs[0], gscale.inputs["Scale"])
    nadd = nt.nodes.new("ShaderNodeVectorMath")
    nadd.operation, nadd.location = "ADD", (850, -400)
    L(bump.outputs[0], nadd.inputs[0])
    L(gscale.outputs[0], nadd.inputs[1])
    nnorm = nt.nodes.new("ShaderNodeVectorMath")
    nnorm.operation, nnorm.location = "NORMALIZE", (950, -400)
    L(nadd.outputs[0], nnorm.inputs[0])
    L(nnorm.outputs[0], bsdf.inputs["Normal"])

    # roughness: per-piece base + streaks + pits
    rv = math_node(nt, "MULTIPLY", (300, 300), None, 0.3)
    L(hkf.outputs[0], rv.inputs[0])
    r1 = math_node(nt, "ADD", (500, 300))
    L(rough_attr.outputs["Fac"], r1.inputs[0])
    L(rv.outputs[0], r1.inputs[1])
    pr = math_node(nt, "MULTIPLY", (500, 150), None, 0.25)
    L(pit.outputs[0], pr.inputs[0])
    r2 = math_node(nt, "ADD", (700, 300))
    L(r1.outputs[0], r2.inputs[0])
    L(pr.outputs[0], r2.inputs[1])
    clamp = node(nt, "ShaderNodeClamp", (900, 300), Min=0.18, Max=0.62)
    L(r2.outputs[0], clamp.inputs[0])
    L(clamp.outputs[0], bsdf.inputs["Roughness"])
    return mat


def runtime_material(name, normal_img, orm_img):
    """glTF-exportable: Principled + normal map + ORM (occlusion R, roughness G, metallic B)."""
    mat = bpy.data.materials.new(name)
    mat.use_backface_culling = True          # exported as doubleSided: false
    nt = mat.node_tree
    nt.nodes.clear()
    L = nt.links.new
    out = node(nt, "ShaderNodeOutputMaterial", (900, 0))
    bsdf = node(nt, "ShaderNodeBsdfPrincipled", (600, 0))
    bsdf.inputs["Base Color"].default_value = (*BASE_COLOR, 1)
    L(bsdf.outputs[0], out.inputs[0])
    ntex = nt.nodes.new("ShaderNodeTexImage")
    ntex.image, ntex.location = normal_img, (-300, -300)
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.location = (200, -300)
    L(ntex.outputs["Color"], nmap.inputs["Color"])
    L(nmap.outputs[0], bsdf.inputs["Normal"])
    otex = nt.nodes.new("ShaderNodeTexImage")
    otex.image, otex.location = orm_img, (-300, 200)
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    sep.location = (100, 200)
    L(otex.outputs["Color"], sep.inputs[0])
    L(sep.outputs["Green"], bsdf.inputs["Roughness"])
    L(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    grp = bpy.data.node_groups.get("glTF Material Output")
    if grp is None:
        grp = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        grp.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    gnode = nt.nodes.new("ShaderNodeGroup")
    gnode.node_tree, gnode.location = grp, (600, 400)
    L(sep.outputs["Red"], gnode.inputs["Occlusion"])
    return mat


# ------------------------------------------------------------------ bake + export

def new_image(name, size, data=True):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color" if data else "sRGB"
    return img


def image_array(img):
    a = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def array_image(name, arr):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    return img


def bake(low, high, kind, img, samples):
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    tex = low.active_material.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    low.active_material.node_tree.nodes.active = tex
    bpy.ops.object.select_all(action="DESELECT")
    use_high = high is not None
    hidden = [o for o in scene.objects if o.type == "MESH" and o is not low and not use_high]
    for o in hidden:   # AO of the runtime mesh alone; the coincident source would occlude it
        o.hide_render = True
    if use_high:
        high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bb = scene.render.bake
    bb.margin = 16
    bb.margin_type = "EXTEND"
    bpy.ops.object.bake(type=kind, use_selected_to_active=use_high, cage_extrusion=0.006,
                        max_ray_distance=0.02, normal_space="TANGENT", margin=16, use_clear=True)
    low.active_material.node_tree.nodes.remove(tex)
    for o in hidden:
        o.hide_render = False
    return image_array(img)


def blur(a, radius):
    """Separable box blur (x3 ~ gaussian): AO is low-frequency, this removes its sampling noise."""
    for _ in range(3):
        for axis in (0, 1):
            k = 2 * radius + 1
            pad = np.pad(a, [(radius, radius) if i == axis else (0, 0) for i in range(2)], mode="edge")
            cs = np.cumsum(pad, axis=axis, dtype=np.float64)
            cs = np.concatenate([np.zeros_like(np.take(cs, [0], axis)), cs], axis)
            a = ((np.take(cs, range(k, cs.shape[axis]), axis) - np.take(cs, range(0, cs.shape[axis] - k), axis)) / k).astype(np.float32)
    return a


def decimate_copy(src, name, tris):
    ob = src.copy()
    ob.data = src.data.copy()
    ob.name = ob.data.name = name
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new("dec", "DECIMATE")
    mod.ratio = tris / len(src.data.polygons)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for name_ in ("frac", "rough", "fracture"):
        if name_ in ob.data.attributes:
            ob.data.attributes.remove(ob.data.attributes[name_])
    ob.data.materials.clear()
    return ob


def unwrap(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.004, area_weight=0.6,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    for poly in ob.data.polygons:
        poly.use_smooth = True


def export_glb(ob, path):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_image_format="WEBP", export_image_quality=88,
                              export_tangents=True, export_normals=True, export_texcoords=True,
                              export_materials="EXPORT", export_yup=True, export_apply=True,
                              export_cameras=False, export_lights=False, export_animations=False,
                              export_extras=False, export_attributes=False)
    print("wrote", path, path.stat().st_size)


def entry_face(chunk, ids, p_src, centre, scale):
    """Largest, flattest fracture face facing the desktop camera at the hero pose -> entry face."""
    cam = np.array(studio.CAMERAS["desktop"]["position"])
    rz = studio.CHUNK_ROTATION_Z
    Rz = np.array([[math.cos(rz), -math.sin(rz), 0], [math.sin(rz), math.cos(rz), 0], [0, 0, 1]])
    best = None
    for i, pl in enumerate(chunk.planes):
        sel = ids == 1 + i
        if sel.sum() < 200:
            continue
        pts = (p_src[sel] - centre) * scale
        c = pts.mean(0)
        facing = float((Rz @ pl["n"]) @ unit(cam - Rz @ c))
        score = sel.sum() * max(facing, 0) ** 2 * (1.5 if pl["flat"] else 1.0)
        if best is None or score > best[0]:
            best = (score, i, c, pl["n"], sel.sum())
    _, i, c, n, count = best
    return i, {"center": [round(float(x), 4) for x in studio.to_three(c)],
               "normal": [round(float(x), 4) for x in studio.to_three(n)],
               "note": "object space of the GLB (before chunkRotationY); centroid and outward normal of the fracture face the camera enters"}


def patch_object(high, ids, piece, p_norm, name):
    """Cut the high-res faces of one fracture piece out as its own mesh (entry close-up)."""
    keep = ids == piece
    ob = high.copy()
    ob.data = high.data.copy()
    ob.name = ob.data.name = name
    bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    # grow one ring into the neighbours so the bevel is included
    drop = [v for v in bm.verts if not keep[v.index] and not any(keep[o.index] for e in v.link_edges for o in e.verts)]
    bmesh.ops.delete(bm, geom=drop, context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def main():
    a = args()
    scene = studio.reset_scene()
    studio.setup_cycles(scene, samples=64)
    chunk = Chunk(a.seed)
    chunk.add_details()
    me, p_src = build_highres(chunk, a.subdiv)
    centre, scale = normalise(chunk, p_src)
    p = (p_src - centre) * scale
    me.vertices.foreach_set("co", p.ravel())
    me.update()
    ids = write_attributes(me, chunk, p_src, centre, scale)
    for poly in me.polygons:
        poly.use_smooth = True
    # exact surface normals (SDF gradient) instead of averaged face normals: no sawtooth on bevels
    me.normals_split_custom_set_from_vertices(unit(chunk.grad(p_src)).tolist())
    high = bpy.data.objects.new("chunk_high", me)
    scene.collection.objects.link(high)
    high.data.materials.append(highres_material())
    print(f"high-res: {len(me.polygons)} tris, dims {tuple(round(x, 3) for x in high.dimensions)}")

    if a.preview:
        preview(scene, high, a.preview)
        return

    OUT.mkdir(exist_ok=True)
    piece, entry = entry_face(chunk, ids, p_src, centre, scale)
    (OUT / "entry-face.json").write_text(json.dumps(entry, indent=2))

    variants = {}
    for k, res, tris in (("2k", 2048, 56000), ("1k", 1024, 22000)):   # 1K is a lighter LOD, own UVs + bake
        low = decimate_copy(high, f"silicon_chunk_{k}", tris)
        unwrap(low)
        low.data.materials.append(bpy.data.materials.new(f"bake_{k}"))
        n = bake(low, high, "NORMAL", new_image(f"normal_{k}", res), 16)
        r = bake(low, high, "ROUGHNESS", new_image(f"rough_{k}", res), 16)
        ao = blur(bake(low, None, "AO", new_image(f"ao_{k}", res), 128)[..., 0], res // 512)
        ao_soft = 1 - 0.5 * (1 - ao)            # subtle: only chips and steps darken
        orm = np.stack([ao_soft, r[..., 0], np.full_like(ao_soft, METALLIC), np.ones_like(ao_soft)], -1)
        low.data.materials.clear()
        low.data.materials.append(runtime_material(f"silicon_{k}", array_image(f"silicon_normal_{k}", n),
                                                   array_image(f"silicon_orm_{k}", orm)))
        export_glb(low, MODELS / f"silicon-chunk-{k}.glb")
        variants[k] = len(low.data.polygons)
        bpy.data.objects.remove(low)
    print("runtime tris", variants)

    patch = patch_object(high, ids, 1 + piece, p, "fracture_face")
    patch_low = decimate_copy(patch, "fracture_face_low", 24000)
    bpy.data.objects.remove(patch)
    unwrap(patch_low)
    patch_low.data.materials.append(bpy.data.materials.new("bake_tmp2"))
    pn = bake(patch_low, high, "NORMAL", new_image("pnormal", 2048), 16)
    pr = bake(patch_low, high, "ROUGHNESS", new_image("prough", 2048), 16)
    porm = np.stack([np.ones_like(pr[..., 0]), pr[..., 0], np.full_like(pr[..., 0], METALLIC), np.ones_like(pr[..., 0])], -1)
    patch_low.data.materials.clear()
    patch_low.data.materials.append(runtime_material("fracture_face", array_image("fracture_normal", pn),
                                                      array_image("fracture_orm", porm)))
    export_glb(patch_low, MODELS / "fracture-face.glb")
    print(f"fracture face: {len(patch_low.data.polygons)} tris")
    stats = {"seed": a.seed, "high_tris": len(me.polygons), "runtime_tris": variants,
             "patch_tris": len(patch_low.data.polygons), "entry_piece": int(piece)}
    (OUT / "chunk-stats.json").write_text(json.dumps(stats, indent=2))
    if a.blend:
        bpy.data.objects.remove(high)
        bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "src/silicon_chunk.blend"), compress=True)


def preview(scene, high, path):
    """Quick look at the source: 6 angles under the studio HDR, 512 px tiles."""
    import shutil
    import tempfile
    from mathutils import Vector
    tmp = pathlib.Path(tempfile.mkdtemp())
    studio.setup_cycles(scene, samples=64, res=(512, 512))
    studio.set_world_hdr(scene)
    cam = bpy.data.objects.new("qa", bpy.data.cameras.new("qa"))
    scene.collection.objects.link(cam)
    cam.data.angle_y = math.radians(30)
    scene.camera = cam
    tiles = []
    for yaw, elev in studio.QA_VIEWS:
        cam.location = studio.orbit(yaw, elev)
        cam.rotation_euler = (-Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
        t = tmp / f"{yaw}_{elev}.png"
        studio.render(scene, t)
        tiles.append(t)
    studio.compose("sheet", path, 3, "|".join(f"yaw{y} el{e}" for y, e in studio.QA_VIEWS), *tiles)
    shutil.rmtree(tmp)


if __name__ == "__main__":
    main()
