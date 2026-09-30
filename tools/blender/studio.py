"""Studio rig, hero cameras, HDR, posters and QA contact sheet for the silicon chunk.

Blender coordinates here (Z up). glTF / Three.js is Y up: (x, y, z)_blender -> (x, z, -y)_three.

  blender -b --factory-startup -P tools/blender/studio.py -- hdr       # src/assets/env/studio-1k.hdr
  blender -b --factory-startup -P tools/blender/studio.py -- camera    # src/assets/models/hero-camera.json
  blender -b --factory-startup -P tools/blender/studio.py -- posters   # src/assets/posters/hero-*.webp
  blender -b --factory-startup -P tools/blender/studio.py -- sheet     # docs/qa/assets/chunk-turntable.webp
  blender -b --factory-startup -P tools/blender/studio.py -- rigcheck  # QA: rig planes vs HDR world, same camera
"""
import json
import math
import pathlib
import shutil
import subprocess
import sys
import tempfile

import bpy
from mathutils import Vector

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
HDR_PATH = ROOT / "src/assets/env/studio-1k.hdr"
GLB_2K = ROOT / "src/assets/models/silicon-chunk-2k.glb"
CAMERA_JSON = ROOT / "src/assets/models/hero-camera.json"
POSTER_DIR = ROOT / "src/assets/posters"
SHEET_PATH = ROOT / "docs/qa/assets/chunk-turntable.webp"
COMPOSE = HERE / "compose.py"

BG_HEX = "#0b0e12"
EXPOSURE_EV = 0.25         # Blender film exposure; Three.js toneMappingExposure = 2 ** EXPOSURE_EV
VIEW_TRANSFORM = "Khronos PBR Neutral"   # Three.js: THREE.NeutralToneMapping
# Three.js has no interreflection: the concave scoops only see the dark studio, not the lit lump,
# so the runtime lifts the environment to match the poster's mean chunk luminance (measured with
# tests/screens.py handover: 1.0 -> 63.6 vs 75.4, 1.25 -> 71.9, 1.45 -> 77.9). Highlights stay aligned.
ENV_INTENSITY_THREE = 1.35
CHUNK_ROTATION_Z = math.radians(180)     # hero pose at progress 0 (= Three.js rotation.y), picked with `poses`

# Softboxes: direction from the chunk (Blender coords, camera sits on -Y), distance, size (w, h),
# linear colour, emission radiance. These planes are what studio-1k.hdr captures.
RIG = [
    dict(name="key", type="key", dir=(-0.62, -0.45, 0.64), dist=5.0, size=(5.0, 3.4),
         color=(0.95, 0.97, 1.00), strength=16.0),
    dict(name="fill", type="fill", dir=(0.95, -0.28, 0.05), dist=5.0, size=(5.0, 5.0),
         color=(0.80, 0.87, 1.00), strength=2.2),
    dict(name="rim", type="rim", dir=(0.80, 0.58, 0.12), dist=5.0, size=(0.13, 2.2),
         color=(1.00, 0.58, 0.26), strength=6.0),
    dict(name="top", type="key", dir=(0.05, 0.25, 1.0), dist=5.0, size=(5.0, 0.35),
         color=(0.92, 0.96, 1.00), strength=4.0),
    dict(name="kick", type="fill", dir=(-0.85, 0.45, -0.1), dist=5.0, size=(0.4, 4.0),
         color=(0.85, 0.9, 1.00), strength=4.0),
]
WORLD_COLOR = (0.006, 0.007, 0.009)      # graphite surroundings seen in reflections
WORLD_SKY = 4.0                           # upper hemisphere this many times brighter (dim ceiling)

# Hero framing. fov is vertical. Object right of centre on desktop, low-centre on mobile.
CAMERAS = {
    "desktop": dict(fov=42.0, res=(1600, 1000), position=(-0.42, -1.80, 0.16), target=(-0.42, 0.0, -0.02)),
    "mobile": dict(fov=50.0, res=(900, 1400), position=(0.0, -2.05, 0.36), target=(0.0, 0.0, 0.30)),
}
GLOW = {  # faint cool glow behind the object, composited in display space (reproduce in CSS)
    "desktop": dict(center=(0.685, 0.50), radius=0.36, color="#5a7896", alpha=0.16),
    "mobile": dict(center=(0.50, 0.66), radius=0.50, color="#5a7896", alpha=0.16),
}


def argv():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def to_three(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def setup_cycles(scene, samples=128, res=(512, 512), denoise=True, transparent=True):
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = backend
            break
        except TypeError:
            continue
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != "CPU"
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = denoise
    scene.cycles.max_bounces = 8
    scene.cycles.glossy_bounces = 6
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.view_settings.view_transform = VIEW_TRANSFORM
    scene.view_settings.look = "None"
    scene.view_settings.exposure = EXPOSURE_EV
    scene.view_settings.gamma = 1.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"


def emission_material(name, color, strength):
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1.0)
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    # hot centre, dimmer edges (real softbox): the reflection has a shape instead of a flat white card
    uv = nt.nodes.new("ShaderNodeTexCoord")
    vec = nt.nodes.new("ShaderNodeVectorMath")
    vec.operation = "DISTANCE"
    vec.inputs[1].default_value = (0.5, 0.5, 0.0)
    nt.links.new(uv.outputs["UV"], vec.inputs[0])
    fall = nt.nodes.new("ShaderNodeMapRange")
    fall.inputs["From Min"].default_value, fall.inputs["From Max"].default_value = 0.0, 0.72
    fall.inputs["To Min"].default_value, fall.inputs["To Max"].default_value = strength * 1.25, strength * 0.35
    nt.links.new(vec.outputs["Value"], fall.inputs["Value"])
    nt.links.new(fall.outputs[0], em.inputs["Strength"])
    return mat


def set_world_color(scene, color, sky=1.0):
    """Graphite surroundings; `sky` > 1 brightens the upper hemisphere (dim studio ceiling) so faces
    that miss every softbox still read as dark grey, not a hole."""
    world = bpy.data.worlds.new("studio") if scene.world is None else scene.world
    scene.world = world
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Generated"], sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value, ramp.inputs["From Max"].default_value = -0.3, 1.0
    ramp.inputs["To Min"].default_value, ramp.inputs["To Max"].default_value = 1.0, sky
    nt.links.new(sep.outputs["Z"], ramp.inputs["Value"])
    mul = nt.nodes.new("ShaderNodeVectorMath")
    mul.operation = "SCALE"
    mul.inputs[0].default_value = color
    nt.links.new(ramp.outputs[0], mul.inputs["Scale"])
    nt.links.new(mul.outputs[0], bg.inputs["Color"])
    nt.links.new(bg.outputs[0], out.inputs[0])
    return bg


def set_world_hdr(scene, rotation_z=0.0, strength=1.0):
    world = bpy.data.worlds.new("studio-hdr")
    scene.world = world
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(HDR_PATH), check_existing=True)
    env.interpolation = "Cubic"
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0, 0, rotation_z)
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs[0], env.inputs["Vector"])
    nt.links.new(env.outputs[0], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    nt.links.new(bg.outputs[0], out.inputs[0])


def build_rig(scene):
    """Emissive planes facing the origin, invisible to the camera (lights only via reflections/diffuse)."""
    objs = []
    for spec in RIG:
        d = Vector(spec["dir"]).normalized()
        bpy.ops.mesh.primitive_plane_add(size=1.0, location=d * spec["dist"])
        ob = bpy.context.active_object
        ob.name = f"rig_{spec['name']}"
        ob.scale = (spec["size"][0], spec["size"][1], 1.0)
        ob.rotation_euler = (-d).to_track_quat("Z", "Y").to_euler()
        ob.data.materials.append(emission_material(ob.name, spec["color"], spec["strength"]))
        ob.visible_camera = False
        objs.append(ob)
    set_world_color(scene, WORLD_COLOR, sky=WORLD_SKY)
    return objs


def add_camera(scene, variant):
    spec = CAMERAS[variant]
    cam = bpy.data.objects.new(f"cam_{variant}", bpy.data.cameras.new(f"cam_{variant}"))
    scene.collection.objects.link(cam)
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(spec["fov"])
    cam.data.clip_start = 0.01
    cam.location = spec["position"]
    look = Vector(spec["target"]) - Vector(spec["position"])
    cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = spec["res"]
    return cam


def import_chunk(path=GLB_2K):
    bpy.ops.import_scene.gltf(filepath=str(path))
    ob = [o for o in bpy.context.selected_objects if o.type == "MESH"][0]
    ob.rotation_mode = "XYZ"
    ob.rotation_euler = (0, 0, 0)   # importer converts Y-up back to Z-up on the mesh data
    return ob


def render(scene, path):
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def compose(*args):
    subprocess.run(["python3", str(COMPOSE), *map(str, args)], check=True)


# ---------------------------------------------------------------- commands

def cmd_hdr():
    scene = reset_scene()
    setup_cycles(scene, samples=64, res=(1024, 512), denoise=False, transparent=False)
    build_rig(scene)
    for ob in scene.objects:
        ob.visible_camera = True
    cam = bpy.data.objects.new("pano", bpy.data.cameras.new("pano"))
    scene.collection.objects.link(cam)
    cam.data.type = "PANO"
    cam.data.panorama_type = "EQUIRECTANGULAR"
    # Blender's own environment lookup puts +X at the image centre, +Z on top; this camera
    # orientation reproduces that mapping (checked with `rigcheck`).
    cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
    scene.camera = cam
    scene.view_settings.view_transform = "Standard"   # radiance must stay linear
    scene.view_settings.exposure = 0.0
    scene.render.image_settings.file_format = "HDR"
    scene.render.image_settings.color_mode = "RGB"
    HDR_PATH.parent.mkdir(parents=True, exist_ok=True)
    render(scene, HDR_PATH)
    print("wrote", HDR_PATH, HDR_PATH.stat().st_size)


def cmd_rigcheck():
    """Same camera, same chunk: left = emissive rig, right = studio-1k.hdr as world."""
    tmp = pathlib.Path(tempfile.mkdtemp())
    for mode in ("rig", "hdr"):
        scene = reset_scene()
        setup_cycles(scene, samples=96, res=(480, 300))
        import_chunk()
        bpy.context.object.rotation_euler.z = CHUNK_ROTATION_Z
        add_camera(scene, "desktop")
        scene.render.resolution_x, scene.render.resolution_y = 480, 300
        if mode == "rig":
            build_rig(scene)
        else:
            set_world_hdr(scene)
        render(scene, tmp / f"{mode}.png")
    out = ROOT / "tools/blender/out/rigcheck.webp"
    out.parent.mkdir(exist_ok=True)
    compose("sheet", out, 2, "rig planes|hdr world", tmp / "rig.png", tmp / "hdr.png")
    shutil.rmtree(tmp)


def camera_record(variant):
    spec = CAMERAS[variant]
    return {"fov": spec["fov"], "aspect": round(spec["res"][0] / spec["res"][1], 4),
            "position": to_three(spec["position"]), "target": to_three(spec["target"]),
            "posterSize": list(spec["res"]),
            "glow": {**GLOW[variant], "center": list(GLOW[variant]["center"])}}


def cmd_camera():
    import numpy as np
    entry = json.loads((ROOT / "tools/blender/out/entry-face.json").read_text())
    lights = []
    for spec in RIG:
        d = Vector(spec["dir"]).normalized() * spec["dist"]
        lights.append({"type": spec["type"], "name": spec["name"], "position": to_three(d),
                       "color": "#%02x%02x%02x" % tuple(round(255 * c ** (1 / 2.2)) for c in spec["color"]),
                       "intensity": spec["strength"], "size": list(spec["size"]),
                       "unit": "emitted radiance of an area softbox facing the origin (W/sr/m2 scale, Cycles)"})
    desktop = camera_record("desktop")
    data = {
        "fov": desktop["fov"], "position": desktop["position"], "target": desktop["target"],
        "desktop": desktop, "mobile": camera_record("mobile"),
        "lights": lights,
        "lightsNote": "All four softboxes are baked into studio-1k.hdr. The posters are lit by that HDR "
                      "alone (no punctual lights), so for an exact match use scene.environment = HDR, "
                      "envMapIntensity 1 and do not add these as extra lights.",
        "environment": "src/assets/env/studio-1k.hdr",
        "background": BG_HEX,
        "toneMapping": "NeutralToneMapping",
        "viewTransform": VIEW_TRANSFORM,
        "exposure": round(2 ** EXPOSURE_EV, 4),
        "environmentIntensity": ENV_INTENSITY_THREE,
        "exposureNote": f"Blender film exposure {EXPOSURE_EV:+.2f} EV = renderer.toneMappingExposure (linear, "
                        "applied before tone mapping in both); Blender 'Khronos PBR Neutral' = THREE.NeutralToneMapping",
        "outputColorSpace": "srgb",
        "chunkRotationY": round(CHUNK_ROTATION_Z, 5),
        "chunkRotationNote": "radians about the Three.js Y axis, applied to the GLB root at hero progress 0",
        "entryFace": entry,
        "units": "metres, glTF Y-up, chunk centred at origin, longest dimension 1.0",
    }
    CAMERA_JSON.write_text(json.dumps(data, indent=2) + "\n")
    print("wrote", CAMERA_JSON)


def cmd_posters():
    tmp = pathlib.Path(tempfile.mkdtemp())
    for variant in ("desktop", "mobile"):
        scene = reset_scene()
        setup_cycles(scene, samples=384)
        import_chunk()
        bpy.context.object.rotation_euler.z = CHUNK_ROTATION_Z
        add_camera(scene, variant)
        set_world_hdr(scene)
        render(scene, tmp / f"{variant}.png")
        g = GLOW[variant]
        compose("poster", tmp / f"{variant}.png", POSTER_DIR / f"hero-{variant}.webp", BG_HEX,
                g["center"][0], g["center"][1], g["radius"], g["color"], g["alpha"])
    shutil.rmtree(tmp)


def light_setup(scene, which):
    if which == "studio":
        set_world_hdr(scene)
    elif which == "studio-rot":
        set_world_hdr(scene, rotation_z=math.radians(140))
    else:  # raking: one small hard light, grazing, reveals faceting and normal errors
        set_world_color(scene, (0.004, 0.0045, 0.005))
        light = bpy.data.lights.new("rake", "AREA")
        light.size = 0.25
        light.energy = 900
        ob = bpy.data.objects.new("rake", light)
        scene.collection.objects.link(ob)
        ob.location = (2.6, -1.2, -0.35)
        ob.rotation_euler = (-Vector(ob.location)).to_track_quat("-Z", "Y").to_euler()


QA_VIEWS = [(0, 12), (90, 12), (180, 12), (270, 12), (45, 70), (225, -60)]   # yaw, elevation (deg)


def orbit(yaw, elev, r=2.3):
    y, e = math.radians(yaw), math.radians(elev)
    return (-r * math.cos(e) * math.sin(y), -r * math.cos(e) * math.cos(y), r * math.sin(e))


def cmd_sheet(glb=GLB_2K, out=SHEET_PATH, tile=400, samples=128):
    """6 angles x 3 light setups of the runtime GLB (what ships), one row per light setup."""
    views = QA_VIEWS
    lights = ["studio", "studio-rot", "raking"]
    tmp = pathlib.Path(tempfile.mkdtemp())
    tiles = []
    scene = reset_scene()
    setup_cycles(scene, samples=samples, res=(tile, tile))
    import_chunk(glb)
    cam = bpy.data.objects.new("qa", bpy.data.cameras.new("qa"))
    scene.collection.objects.link(cam)
    cam.data.angle_y = math.radians(30)
    scene.camera = cam
    for li in lights:
        for o in [o for o in scene.objects if o.type == "LIGHT"]:
            bpy.data.objects.remove(o)
        light_setup(scene, li)
        for yaw, elev in views:
            cam.location = orbit(yaw, elev)
            cam.rotation_euler = (-Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
            p = tmp / f"{li}_{yaw}_{elev}.png"
            render(scene, p)
            tiles.append(p)
    labels = "|".join(f"{li} yaw{y} el{e}" for li in lights for y, e in views)
    compose("sheet", out, len(views), labels, *tiles)
    shutil.rmtree(tmp)


def cmd_poses():
    """QA: the desktop hero camera at 12 chunk rotations, to choose CHUNK_ROTATION_Z."""
    tmp = pathlib.Path(tempfile.mkdtemp())
    scene = reset_scene()
    setup_cycles(scene, samples=64)
    ob = import_chunk()
    add_camera(scene, "desktop")
    scene.render.resolution_x, scene.render.resolution_y = 480, 300
    set_world_hdr(scene)
    tiles = []
    for deg in range(0, 360, 30):
        ob.rotation_euler.z = math.radians(deg)
        render(scene, tmp / f"{deg}.png")
        tiles.append(tmp / f"{deg}.png")
    out = HERE / "out/poses.webp"
    compose("sheet", out, 4, "|".join(f"rotY {d}" for d in range(0, 360, 30)), *tiles)
    shutil.rmtree(tmp)


if __name__ == "__main__":
    cmd = argv()[0] if argv() else ""
    {"hdr": cmd_hdr, "camera": cmd_camera, "posters": cmd_posters, "sheet": cmd_sheet,
     "rigcheck": cmd_rigcheck, "poses": cmd_poses}[cmd]()
