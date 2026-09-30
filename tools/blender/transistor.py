"""Didactic planar MOSFET cross-section (chapter 02): GLB, camera JSON, posters, contact sheet.

Simplified model, not to scale. Blender coordinates (Z up, the cut face looks at -Y); glTF /
Three.js is Y up: (x, y, z)_blender -> (x, z, -y)_three. Reuses the hero studio (studio.py):
same HDR, same Cycles settings, same view transform and exposure.

  blender -b --factory-startup -P tools/blender/transistor.py -- glb      # GLB + transistor-camera.json
  blender -b --factory-startup -P tools/blender/transistor.py -- posters  # posters OFF/ON, desktop/mobile
  blender -b --factory-startup -P tools/blender/transistor.py -- sheet    # docs/qa/assets/transistor-sheet.webp
  blender -b --factory-startup -P tools/blender/transistor.py -- all
"""
import json
import math
import pathlib
import shutil
import sys
import tempfile

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import studio  # noqa: E402  (hero studio rig, Cycles setup, HDR world, compose helper)

ROOT = studio.ROOT
GLB = ROOT / "src/assets/models/transistor.glb"
CAMERA_JSON = ROOT / "src/assets/models/transistor-camera.json"
POSTER_DIR = ROOT / "src/assets/posters"
SHEET = ROOT / "docs/qa/assets/transistor-sheet.webp"

FRONT = -0.35          # the section plane (cut face), y in Blender
PROUD = 0.001          # regions that sit in the substrate are 1 mm proud of the cut face (no z-fighting)
ENV_INTENSITY_THREE = 1.25   # Three.js has no interreflection; matched to the poster by eye, then by pixels

# name: (x0, x1, y0, y1, z0, z1, material, small bevel)
PARTS = {
    "substrate": (-0.80, 0.80, FRONT, 0.35, -0.42, 0.0, "p_si", 0.004),
    "sti_left": (-0.80, -0.68, FRONT - PROUD, 0.35, -0.15, PROUD, "field_oxide", 0.002),
    "sti_right": (0.68, 0.80, FRONT - PROUD, 0.35, -0.15, PROUD, "field_oxide", 0.002),
    "source": (-0.62, -0.18, FRONT - PROUD, 0.35, -0.15, PROUD, "n_si", 0.002),
    "drain": (0.18, 0.62, FRONT - PROUD, 0.35, -0.15, PROUD, "n_si", 0.002),
    "channel": (-0.18, 0.18, FRONT - 2 * PROUD, 0.35, -0.036, 0.0, "channel", 0.0),
    "gate_oxide": (-0.24, 0.24, FRONT, 0.35, 0.0, 0.028, "gate_oxide", 0.002),
    "gate": (-0.21, 0.21, FRONT, 0.35, 0.028, 0.19, "gate", 0.006),
    "source_plug": (-0.49, -0.37, FRONT, -0.14, PROUD, 0.30, "plug", 0.004),
    "drain_plug": (0.37, 0.49, FRONT, -0.14, PROUD, 0.30, "plug", 0.004),
    "gate_plug": (-0.06, 0.06, FRONT, -0.14, 0.19, 0.30, "plug", 0.004),
    "source_pad": (-0.54, -0.32, FRONT, -0.08, 0.30, 0.335, "pad", 0.004),
    "drain_pad": (0.32, 0.54, FRONT, -0.08, 0.30, 0.335, "pad", 0.004),
    "gate_pad": (-0.11, 0.11, FRONT, -0.08, 0.30, 0.335, "pad", 0.004),
}
ROUND_BOTTOM = {"source": 0.07, "drain": 0.07}   # diffusion-like rounded well bottoms in the section

# linear base colour, metallic, roughness
MATERIALS = {
    "p_si": ((0.013, 0.015, 0.018), 0.0, 0.68),          # p-type substrate: dark graphite, matte
    "n_si": ((0.058, 0.074, 0.100), 0.05, 0.48),         # n+ wells: lighter, faint cool tint
    "channel": ((0.020, 0.036, 0.066), 0.0, 0.42),       # inversion layer: drawn by emission at runtime
    "field_oxide": ((0.16, 0.17, 0.18), 0.0, 0.45),      # isolation oxide at the ends
    "gate_oxide": ((0.62, 0.65, 0.68), 0.0, 0.14),       # thin pale glassy layer (no transmission)
    "gate": ((0.36, 0.38, 0.41), 0.85, 0.34),            # gate electrode: satin metal
    "plug": ((0.62, 0.64, 0.66), 1.0, 0.30),             # aluminium/tungsten-like contacts
    "pad": ((0.66, 0.40, 0.26), 1.0, 0.28),              # copper pads (warm, small)
    "shadow": ((0.0, 0.0, 0.0), 0.0, 1.0),
}

# Conventional flow path on the cut face (Blender x, z), source pad -> well -> channel -> drain pad.
FLOW_Y = FRONT - 0.004
FLOW_PATH = [(-0.43, 0.335), (-0.43, -0.018), (0.43, -0.018), (0.43, 0.335)]
FLOW = dict(markers=16, queued=5, gap=0.042, radius=0.015, speed=0.16, barrierX=-0.205,
            on="#e0a45c", off="#6d8db0", onIntensity=2.2, offIntensity=0.9,
            channelOn="#dcd6ca", channelOnIntensity=1.4)

# Anchors for the DOM legend (Blender coords): label above the pads, channel label under the section.
ANCHORS = {"source": (-0.43, FRONT, 0.335), "gate": (0.0, FRONT, 0.335), "drain": (0.43, FRONT, 0.335),
           "channel": (0.0, FRONT, -0.42)}

# fov vertical. Desktop: device right of centre, clear of the copy; mobile: low, under the copy.
CAMERAS = {
    "desktop": dict(fov=30.0, res=(1600, 1000), yaw=-14.0, elev=17.0, dist=4.1, target=(-0.74, 0.0, -0.02)),
    "mobile": dict(fov=38.0, res=(900, 1400), yaw=-12.0, elev=18.0, dist=4.2, target=(0.0, 0.0, 0.26)),
}
ORBIT_DEG = 5.0   # runtime: yaw sweep across the chapter (-ORBIT/2 .. +ORBIT/2) around the target


def argv():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def srgb_to_linear(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def cam_position(spec):
    y, e = math.radians(spec["yaw"]), math.radians(spec["elev"])
    t = Vector(spec["target"])
    return t + Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e))) * spec["dist"]


# ---------------------------------------------------------------- geometry

def principled(name, color, metallic, roughness):
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def box(name, x0, x1, y0, y1, z0, z1, mat, bevel, round_bottom=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((x0 if v.co.x < 0 else x1, y0 if v.co.y < 0 else y1, z0 if v.co.z < 0 else z1))
    if round_bottom:
        edges = [e for e in bm.edges if all(v.co.z == z0 for v in e.verts) and abs(e.verts[0].co.y - e.verts[1].co.y) > 1e-6]
        bmesh.ops.bevel(bm, geom=edges, offset=round_bottom, segments=8, profile=0.5, affect="EDGES", clamp_overlap=True)
    if bevel:
        sharp = [e for e in bm.edges if e.calc_face_angle(0) > math.radians(40)]
        bmesh.ops.bevel(bm, geom=sharp, offset=bevel, segments=3, profile=0.5, affect="EDGES", clamp_overlap=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    ob.select_set(False)
    return ob


def shadow_plane(mats):
    """Soft contact shadow under the block: black with a radial alpha texture (exported, 64 px)."""
    size = 64
    img = bpy.data.images.new("contact_shadow", size, size, alpha=True)
    px = []
    for j in range(size):
        for i in range(size):
            u, v = (i + 0.5) / size * 2 - 1, (j + 0.5) / size * 2 - 1
            # rounded-rectangle falloff matching the 1.6 x 0.7 footprint inside a 2.4 x 1.4 plane
            dx, dz = max(0.0, abs(u) - 0.55) / 0.45, max(0.0, abs(v) - 0.35) / 0.65
            a = max(0.0, 1 - math.hypot(dx, dz)) ** 2 * 0.72
            px += [0.0, 0.0, 0.0, a]
    img.pixels = px
    img.file_format = "PNG"
    img.pack()
    mat = mats["shadow"]
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    mat.surface_render_method = "BLENDED"
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, 0, -0.4215))
    ob = bpy.context.active_object
    ob.name = "contact_shadow"
    ob.scale = (2.4, 1.4, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(mat)
    ob.visible_shadow = False
    return ob


def build():
    mats = {k: principled(k, *v) for k, v in MATERIALS.items()}
    objs = [box(n, *spec[:6], mats[spec[6]], spec[7], ROUND_BOTTOM.get(n, 0.0)) for n, spec in PARTS.items()]
    objs.append(shadow_plane(mats))
    return objs, mats


# ---------------------------------------------------------------- flow (mirrors src/scripts/scenes/transistor.js)

def path_lengths():
    seg = [math.dist(a, b) for a, b in zip(FLOW_PATH, FLOW_PATH[1:])]
    return seg, sum(seg)


def point_at(s):
    seg, _ = path_lengths()
    for i, l in enumerate(seg):
        if s <= l or i == len(seg) - 1:
            a, b, k = FLOW_PATH[i], FLOW_PATH[i + 1], max(0.0, min(1.0, s / l))
            return a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k
        s -= l


def barrier_s():
    seg, _ = path_lengths()
    return seg[0] + (FLOW["barrierX"] - FLOW_PATH[1][0])


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def markers(mix, time=0.0):
    """[(x, z, scale)] for a given power mix (0 OFF, 1 ON) and ambient time: same rule as the runtime."""
    _, total = path_lengths()
    sb, out = barrier_s(), []
    phase = time * FLOW["speed"] / total
    for i in range(FLOW["markers"]):
        s_on = ((i / FLOW["markers"] + phase) % 1.0) * total
        queued = i < FLOW["queued"]
        s_off = sb - FLOW["gap"] * (i + 1) if queued else s_on
        s = s_off + (s_on - s_off) * mix
        scale = (1.0 if queued else mix) * smooth(0, 0.05, s) * smooth(total, total - 0.05, s)
        x, z = point_at(s)
        out.append((x, z, scale))
    return out


def emission_mat(name, hexstr, strength):
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*srgb_to_linear(hexstr), 1.0)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return mat


def power_state(mats, on):
    """Poster-only objects: markers (+ the barrier in OFF) and the channel emission. Not exported."""
    bsdf = mats["channel"].node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Emission Color"].default_value = (*srgb_to_linear(FLOW["channelOn"]), 1.0)
    bsdf.inputs["Emission Strength"].default_value = FLOW["channelOnIntensity"] if on else 0.0
    color, strength = (FLOW["on"], FLOW["onIntensity"]) if on else (FLOW["off"], FLOW["offIntensity"])
    mat = emission_mat("marker_on" if on else "marker_off", color, strength)
    extra = []
    for x, z, s in markers(1.0 if on else 0.0):
        if s < 0.02:
            continue
        bpy.ops.mesh.primitive_uv_sphere_add(radius=FLOW["radius"] * s, segments=16, ring_count=8, location=(x, FLOW_Y, z))
        ob = bpy.context.active_object
        ob.data.materials.append(mat)
        bpy.ops.object.shade_smooth()
        extra.append(ob)
    if not on:
        bx, bz = point_at(barrier_s())
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx + 0.012, FLOW_Y, bz))
        ob = bpy.context.active_object
        ob.scale = (0.008, 0.008, 0.075)
        ob.data.materials.append(mat)
        extra.append(ob)
    return extra


# ---------------------------------------------------------------- camera / export

def add_camera(scene, variant):
    spec = CAMERAS[variant]
    cam = bpy.data.objects.new(f"cam_{variant}", bpy.data.cameras.new(f"cam_{variant}"))
    scene.collection.objects.link(cam)
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(spec["fov"])
    cam.data.clip_start = 0.01
    cam.location = cam_position(spec)
    cam.rotation_euler = (Vector(spec["target"]) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = spec["res"]
    return cam


def poster_anchors(scene, cam):
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update()
    out = {}
    for name, p in ANCHORS.items():
        c = world_to_camera_view(scene, cam, Vector(p))
        out[name] = [round(c.x, 4), round(1 - c.y, 4)]   # poster uv, v from the top
    return out


def cmd_glb():
    scene = studio.reset_scene()
    objs, _ = build()
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB", use_selection=True, export_apply=True,
                              export_tangents=False, export_yup=True, export_image_format="AUTO")
    tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in objs)
    cams = {}
    for variant, spec in CAMERAS.items():
        cam = add_camera(scene, variant)
        cams[variant] = {"fov": spec["fov"], "aspect": round(spec["res"][0] / spec["res"][1], 4),
                         "position": studio.to_three(cam.location), "target": studio.to_three(spec["target"]),
                         "posterSize": list(spec["res"]), "anchors": poster_anchors(scene, cam)}
    data = {
        "fov": cams["desktop"]["fov"], "position": cams["desktop"]["position"], "target": cams["desktop"]["target"],
        "desktop": cams["desktop"], "mobile": cams["mobile"],
        "orbitDeg": ORBIT_DEG,
        "environment": "src/assets/env/studio-1k.hdr",
        "lightsNote": "Lit by studio-1k.hdr alone, like the hero (see hero-camera.json); no punctual lights.",
        "toneMapping": "NeutralToneMapping", "viewTransform": studio.VIEW_TRANSFORM,
        "exposure": round(2 ** studio.EXPOSURE_EV, 4), "environmentIntensity": ENV_INTENSITY_THREE,
        "outputColorSpace": "srgb",
        "anchors": {k: studio.to_three(v) for k, v in ANCHORS.items()},
        "flow": {**FLOW, "path": [studio.to_three((x, FLOW_Y, z)) for x, z in FLOW_PATH]},
        "triangles": tris,
        "units": "metres, glTF Y-up, device centred at x = 0, cut face at z = +0.35 (Three.js), not to scale",
    }
    CAMERA_JSON.write_text(json.dumps(data, indent=2) + "\n")
    print("wrote", GLB, GLB.stat().st_size, "bytes,", tris, "triangles;", CAMERA_JSON)


def render_state(variant, on, path, samples=256, res=None):
    scene = studio.reset_scene()
    studio.setup_cycles(scene, samples=samples)
    _, mats = build()
    power_state(mats, on)
    add_camera(scene, variant)
    if res:
        scene.render.resolution_x, scene.render.resolution_y = res
    studio.set_world_hdr(scene)
    studio.render(scene, path)


def cmd_posters():
    tmp = pathlib.Path(tempfile.mkdtemp())
    for variant in CAMERAS:
        for on in (False, True):
            png = tmp / f"{variant}-{on}.png"
            render_state(variant, on, png)
            name = f"transistor{'-on' if on else ''}-{variant}.webp"
            studio.compose("alpha", png, POSTER_DIR / name)
    shutil.rmtree(tmp)


QA_VIEWS = {  # centred on the device, independent of the page framing
    "front-left": dict(fov=30.0, res=(640, 420), yaw=-24.0, elev=21.0, dist=4.3, target=(0.0, 0.0, -0.05)),
    "right-high": dict(fov=30.0, res=(640, 420), yaw=34.0, elev=36.0, dist=4.3, target=(0.0, 0.0, -0.05)),
    "low": dict(fov=30.0, res=(640, 420), yaw=-6.0, elev=4.0, dist=4.3, target=(0.0, 0.0, -0.05)),
}


def cmd_sheet():
    """OFF / ON rows x 3 angles of the exported parts, same studio HDR as the posters."""
    CAMERAS.update(QA_VIEWS)
    tmp = pathlib.Path(tempfile.mkdtemp())
    tiles = []
    for on in (False, True):
        for view in QA_VIEWS:
            p = tmp / f"{view}-{on}.png"
            render_state(view, on, p, samples=128)
            tiles.append(p)
    labels = "|".join(f"{'ON' if on else 'OFF'} {v}" for on in (False, True) for v in QA_VIEWS)
    SHEET.parent.mkdir(parents=True, exist_ok=True)
    studio.compose("sheet", SHEET, 3, labels, *tiles)
    shutil.rmtree(tmp)


if __name__ == "__main__":
    cmd = argv()[0] if argv() else "all"
    steps = {"glb": [cmd_glb], "posters": [cmd_posters], "sheet": [cmd_sheet], "all": [cmd_glb, cmd_posters, cmd_sheet]}[cmd]
    for step in steps:
        step()
