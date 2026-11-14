"""Genera los modelos GLB de los experimentos de combustión (FLEX, BASS, Saffire, SAME).

Uso, desde la raíz del repositorio:

    blender -b -P scripts/build_experiment_models.py
    # o, con el módulo bpy instalado (pip install bpy):
    python scripts/build_experiment_models.py [--render]

Los modelos se escriben en dist/assets/experimentos/ en metros y a escala real
cuando NASA publica la dimensión. Cada GLB trae una animación "Ensayo" que sigue
la secuencia del experimento. --render genera además una miniatura PNG por modelo.
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "dist", "assets", "experimentos")
FPS = 24
RENDER = "--render" in sys.argv

# ----------------------------------------------------------------------------
# Utilidades de escena
# ----------------------------------------------------------------------------

_materials = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _materials.clear()
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.unit_settings.system = "METRIC"


def mat(name, color, metal=0.0, rough=0.5, alpha=1.0, emit=None, strength=0.0, transmission=0.0):
    key = name
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1.0)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    p.inputs["Alpha"].default_value = alpha
    p.inputs["Transmission Weight"].default_value = transmission
    if emit:
        p.inputs["Emission Color"].default_value = (*emit, 1.0)
        p.inputs["Emission Strength"].default_value = strength
    if alpha < 1.0:
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = False
    _materials[key] = m
    return m


def _finish(obj, name, material, parent):
    obj.name = name
    obj.data.name = name
    if material is not None:
        obj.data.materials.append(material)
    if parent is not None:
        obj.parent = parent
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def box(name, size, loc, material, parent=None, origin_min_x=False):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.data.transform(__import__("mathutils").Matrix.Diagonal((*size, 1)))
    if origin_min_x:
        o.data.transform(__import__("mathutils").Matrix.Translation((size[0] / 2, 0, 0)))
    o.location = loc
    return _finish(o, name, material, parent)


def cyl(name, r, depth, loc, material, parent=None, rot=(0, 0, 0), verts=32):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts)
    o = bpy.context.object
    o.location, o.rotation_euler = loc, rot
    return _finish(o, name, material, parent)


def sphere(name, r, loc, material, parent=None, seg=32, ring=16, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=ring)
    o = bpy.context.object
    o.location = loc
    _finish(o, name, material, parent)
    if smooth:
        for poly in o.data.polygons:
            poly.use_smooth = True
    return o


def torus(name, R, r, loc, material, parent=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=16, minor_segments=6)
    o = bpy.context.object
    o.location, o.rotation_euler = loc, rot
    _finish(o, name, material, parent)
    for poly in o.data.polygons:
        poly.use_smooth = True
    return o


def empty(name, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.parent = parent
    return o


def arrow(name, start, length, material, parent=None, r=0.004):
    """Flecha a lo largo de +X."""
    g = empty(name, parent, start)
    cyl(name + "_cuerpo", r, length * 0.75, (length * 0.375, 0, 0), material, g, rot=(0, math.pi / 2, 0), verts=12)
    bpy.ops.mesh.primitive_cone_add(radius1=r * 2.6, depth=length * 0.25, vertices=12)
    c = bpy.context.object
    c.location, c.rotation_euler = (length * 0.875, 0, 0), (0, math.pi / 2, 0)
    _finish(c, name + "_punta", material, g)
    return g


def tube(name, p1, p2, r, material, parent=None):
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    o = cyl(name, r, d.length, (p1 + p2) / 2, material, parent, verts=10)
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return o


def key(obj, frame, scale=None, loc=None, rot=None):
    if scale is not None:
        obj.scale = scale if isinstance(scale, (tuple, list)) else (scale,) * 3
        obj.keyframe_insert("scale", frame=frame)
    if loc is not None:
        obj.location = loc
        obj.keyframe_insert("location", frame=frame)
    if rot is not None:
        obj.rotation_euler = rot
        obj.keyframe_insert("rotation_euler", frame=frame)


def linear_keys():
    for ob in bpy.data.objects:
        ad = ob.animation_data
        if not ad or not ad.action:
            continue
        for fc in _fcurves(ad.action):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"


def _fcurves(action):
    if hasattr(action, "fcurves") and len(getattr(action, "fcurves", [])):
        return action.fcurves
    out = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


def glb_pos(obj):
    """Posición mundial en coordenadas glTF (Y arriba)."""
    v = obj.matrix_world.translation
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


def export(slug, frames, meta):
    os.makedirs(OUT, exist_ok=True)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 0, frames
    linear_keys()
    sc.frame_set(0)
    path = os.path.join(OUT, slug + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_animations=True,
        export_animation_mode="SCENE",
        export_nla_strips_merged_animation_name="Ensayo",
        export_optimize_animation_size=True,
        export_draco_mesh_compression_enable=False,
        export_cameras=False,
        export_lights=False,
    )
    merge_animations(path, "Ensayo")
    meta["archivo"] = f"assets/experimentos/{slug}.glb"
    meta["bytes"] = os.path.getsize(path)
    meta["duracion_s"] = round(frames / FPS, 2)
    if RENDER:
        render_thumb(slug, meta.pop("_render_frame", frames // 2))
    meta.pop("_render_frame", None)
    if os.path.exists(os.path.join(OUT, slug + ".webp")):
        meta["poster"] = f"assets/experimentos/{slug}.webp"
    print(f"  {slug}.glb  {meta['bytes'] / 1024:.0f} KB")
    return meta


def merge_animations(path, name):
    """Une todos los clips del GLB en uno solo.

    El exportador de Blender crea un clip por objeto animado y los visores web
    reproducen un clip a la vez; así toda la secuencia corre sincronizada.
    """
    import struct

    with open(path, "rb") as f:
        data = f.read()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    jlen, _ = struct.unpack_from("<II", data, 12)
    gltf = json.loads(data[20:20 + jlen])
    rest = data[20 + jlen:]
    anims = gltf.get("animations", [])
    if len(anims) <= 1:
        if anims:
            anims[0]["name"] = name
    else:
        merged = {"name": name, "channels": [], "samplers": []}
        for a in anims:
            base = len(merged["samplers"])
            merged["samplers"].extend(a["samplers"])
            for ch in a["channels"]:
                ch = dict(ch)
                ch["sampler"] += base
                merged["channels"].append(ch)
        gltf["animations"] = [merged]
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + len(rest)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", magic, version, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(rest)


def render_thumb(slug, frame):
    sc = bpy.context.scene
    sc.frame_set(frame)
    objs = [o for o in sc.objects if o.type == "MESH"]
    lo = Vector((min(min((o.matrix_world @ Vector(c))[i] for c in o.bound_box) for o in objs) for i in range(3)))
    hi = Vector((max(max((o.matrix_world @ Vector(c))[i] for c in o.bound_box) for o in objs) for i in range(3)))
    center, size = (lo + hi) / 2, (hi - lo).length
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 50
    cam_data.clip_start = size / 1000
    cam_data.clip_end = size * 20
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    direction = Vector((0.95, -1.25, 0.75)).normalized()
    cam.location = center + direction * size * 1.45
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.016, 0.03, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    sc.world = world
    for i, (d, e) in enumerate([((-0.5, -0.6, 1), 3.0), ((0.8, 0.4, 0.5), 1.2)]):
        ld = bpy.data.lights.new(f"sun{i}", "SUN")
        ld.energy = e
        lo_ = bpy.data.objects.new(f"sun{i}", ld)
        sc.collection.objects.link(lo_)
        lo_.rotation_euler = Vector(d).to_track_quat("Z", "Y").to_euler()
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    sc.cycles.device = "CPU"
    sc.render.resolution_x, sc.render.resolution_y = 960, 640
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.render.image_settings.file_format = "WEBP"
    sc.render.image_settings.quality = 82
    sc.render.filepath = os.path.join(OUT, slug + ".webp")
    bpy.ops.render.render(write_still=True)


# Paleta compartida
def palette():
    return {
        "aluminio": mat("Aluminio anodizado", (0.55, 0.57, 0.6), metal=0.9, rough=0.35),
        "oscuro": mat("Óxido negro", (0.04, 0.04, 0.045), metal=0.6, rough=0.55),
        "acero": mat("Acero inoxidable", (0.72, 0.72, 0.74), metal=1.0, rough=0.25),
        "vidrio": mat("Ventana óptica", (0.75, 0.88, 1.0), rough=0.05, alpha=0.18),
        "lexan": mat("Lexan", (0.8, 0.9, 1.0), rough=0.1, alpha=0.22),
        "flujo": mat("Flujo de aire", (0.2, 0.8, 1.0), rough=0.5, alpha=0.55, emit=(0.15, 0.6, 0.9), strength=0.6),
        "llama_azul": mat("Llama azul", (0.12, 0.3, 1.0), alpha=0.32, emit=(0.1, 0.3, 1.0), strength=2.2),
        "llama_amarilla": mat("Llama luminosa (hollín)", (1.0, 0.45, 0.06), alpha=0.6, emit=(1.0, 0.38, 0.04), strength=3.0),
        "brasa": mat("Hilo incandescente", (1.0, 0.3, 0.04), emit=(1.0, 0.25, 0.03), strength=5.0),
        "kanthal": mat("Hilo Kanthal", (0.45, 0.42, 0.4), metal=0.9, rough=0.4),
        "sibal": mat("Tela SIBAL (algodón 75 % / fibra de vidrio 25 %)", (0.86, 0.82, 0.72), rough=0.9),
        "char": mat("Residuo carbonizado", (0.05, 0.045, 0.04), rough=0.95),
        "panel": mat("Panel de aviónica", (0.18, 0.2, 0.24), metal=0.3, rough=0.6),
        "escala": mat("Regla de escala", (0.95, 0.95, 0.95), rough=0.6, emit=(0.9, 0.9, 0.9), strength=0.4),
    }


def scale_bar(parent, length, loc, ticks, P, thickness):
    g = empty("Escala", parent, loc)
    box("Escala_barra", (length, thickness, thickness), (length / 2, 0, 0), P["escala"], g)
    for i in range(ticks + 1):
        box(f"Escala_marca_{i}", (thickness, thickness, thickness * 3), (length * i / ticks, 0, thickness), P["escala"], g)
    return g


# ----------------------------------------------------------------------------
# FLEX: gota en la cámara del MDCA (primer plano a escala real)
# ----------------------------------------------------------------------------

def build_flex():
    reset()
    P = palette()
    heptano = mat("Gota de n-heptano", (0.95, 0.75, 0.35), rough=0.05, alpha=0.85, transmission=0.6)
    hollin = mat("Capa de hollín", (0.9, 0.38, 0.08), alpha=0.22, emit=(0.95, 0.35, 0.05), strength=1.2)
    root = empty("FLEX_MDCA")
    root["fuente"] = "NASA FLEX/MDCA; DOI 10.60555/mbq8-0451"
    root["escala"] = "1 unidad = 1 m; gota inicial de 3 mm"

    d0 = 0.003
    r0 = d0 / 2
    gota = sphere("Gota_combustible", r0, (0, 0, 0), heptano, root)

    # Agujas opuestas que forman el puente líquido y se retraen.
    agujas = []
    for s in (-1, 1):
        a = empty(f"Aguja_{'izq' if s < 0 else 'der'}", root)
        cyl("Aguja_tubo", 0.0002, 0.02, (s * 0.01, 0, 0), P["acero"], a, rot=(0, math.pi / 2, 0), verts=12)
        cyl("Aguja_soporte", 0.0012, 0.006, (s * 0.023, 0, 0), P["oscuro"], a, rot=(0, math.pi / 2, 0), verts=16)
        agujas.append((a, s))

    # Ignitores de hilo caliente a ambos lados, en el eje Y.
    ignitores = []
    for s in (-1, 1):
        ig = empty(f"Ignitor_{'frente' if s < 0 else 'fondo'}", root)
        for k in range(4):
            torus(f"Ignitor_espira_{k}", 0.0007, 0.00012, (0, s * (0.005 + k * 0.0005), 0), P["kanthal"], ig, rot=(math.pi / 2, 0, 0))
        glow = empty("Ignitor_brillo", ig)
        for k in range(4):
            torus(f"Ignitor_brillo_{k}", 0.0007, 0.00016, (0, s * (0.005 + k * 0.0005), 0), P["brasa"], glow, rot=(math.pi / 2, 0, 0))
        cyl("Ignitor_brazo", 0.0003, 0.02, (0, s * 0.017, 0), P["acero"], ig, rot=(math.pi / 2, 0, 0), verts=8)
        ignitores.append((ig, glow, s))

    llama = sphere("Llama_esferica", 1.0, (0, 0, 0), P["llama_azul"], root, seg=48, ring=24)
    hollin_s = sphere("Capa_hollin", 1.0, (0, 0, 0), hollin, root, seg=40, ring=20)
    scale_bar(root, 0.01, (-0.005, -0.012, -0.012), 10, P, 0.0002)

    # Secuencia (24 fps): despliegue 0-24, retracción 24-36, ignición 36-48,
    # combustión con ley d² hasta la extinción radiativa (f 156), y la gota
    # sigue evaporándose sin llama visible (régimen de llama fría, f 240).
    for a, s in agujas:
        key(a, 0, loc=(s * -0.0085, 0, 0))
        key(a, 24, loc=(0, 0, 0))
        key(a, 36, loc=(s * 0.012, 0, 0))
    key(gota, 0, scale=0.25)
    key(gota, 24, scale=1.0)
    for ig, glow, s in ignitores:
        key(ig, 30, loc=(0, s * 0.01, 0))
        key(ig, 38, loc=(0, 0, 0))
        key(ig, 44, loc=(0, 0, 0))
        key(ig, 52, loc=(0, s * 0.012, 0))
        key(glow, 37, scale=0.0001)
        key(glow, 39, scale=1.0)
        key(glow, 45, scale=1.0)
        key(glow, 47, scale=0.0001)

    t_ign, t_ext, t_end = 44, 156, 240
    key(llama, 0, scale=0.0001)
    key(llama, t_ign, scale=0.0001)
    key(hollin_s, 0, scale=0.0001)
    key(hollin_s, t_ign, scale=0.0001)
    tb = 230  # tiempo de consumo total si la llama no se extinguiera
    for f in range(t_ign, t_end + 1, 8):
        frac = max(0.0, 1 - (f - t_ign) / tb)
        d = d0 * math.sqrt(frac)
        key(gota, f, scale=max(d / d0, 0.05))
        if f <= t_ext:
            growth = 1 - math.exp(-(f - t_ign) / 18)
            r_llama = r0 * (1 + 6.5 * growth) * (0.55 + 0.45 * math.sqrt(frac))
            key(llama, f, scale=max(r_llama, 1e-6))
            key(hollin_s, f, scale=max(r_llama * 0.6, 1e-6))
    key(llama, t_ext + 6, scale=0.0001)
    key(hollin_s, t_ext + 3, scale=0.0001)

    meta = {
        "id": "flex",
        "titulo": "FLEX · gota en microgravedad",
        "experimento": "Flame Extinguishment Experiment (FLEX)",
        "lugar": "Multi-user Droplet Combustion Apparatus dentro del Combustion Integrated Rack, módulo Destiny, EEI",
        "escala": "Primer plano a escala real: gota inicial de 3 mm; la regla mide 10 mm.",
        "resumen": "Dos agujas opuestas forman la gota y se retiran. Dos ignitores de hilo caliente la encienden y se apartan. Sin flotabilidad, la llama es una esfera azul alrededor de la gota. El diámetro de la gota decrece según la ley d² y la llama se extingue por radiación antes de consumir el combustible; la gota sigue evaporándose, que es la señal de las llamas frías que FLEX descubrió con heptano.",
        "datos": [
            ["Cámara de combustión", "100 L; Ø interior 40 cm × 90 cm"],
            ["Gotas típicas", "1–5 mm (aquí 3 mm)"],
            ["Combustibles", "n-heptano, metanol, mezclas"],
            ["Periodo", "marzo 2009 – diciembre 2011"],
        ],
        "hotspots": [
            {"nombre": "Gota_combustible", "titulo": "Gota de combustible", "texto": "Queda libre, sin soporte, tras retirar las agujas."},
            {"nombre": "Llama_esferica", "titulo": "Llama esférica", "texto": "Sin convección natural la llama rodea la gota de forma simétrica.", "offset": [0, 0.008, 0]},
            {"nombre": "Aguja_der", "titulo": "Aguja de despliegue", "texto": "Dos agujas forman un puente líquido y se retraen.", "offset": [0.012, 0, 0]},
            {"nombre": "Ignitor_fondo", "titulo": "Ignitor de hilo caliente", "texto": "Se energiza y se retira de inmediato para no perturbar la llama.", "offset": [0, 0, -0.006]},
        ],
        "fases": [[0, "Despliegue de la gota"], [1.5, "Ignición"], [1.9, "Combustión (ley d²)"], [6.5, "Extinción radiativa"], [7.0, "Evaporación sin llama visible"]],
        "fuentes": [
            ["FLEX en NASA PSI", "https://doi.org/10.60555/mbq8-0451"],
            ["Resultados FLEX 2009–2011 (NTRS)", "https://ntrs.nasa.gov/citations/20150023456"],
            ["CIR y MDCA (O'Malley y Myhre)", "https://ntrs.nasa.gov/api/citations/20030032248/downloads/20030032248.pdf"],
        ],
        "_render_frame": 100,
    }
    return _hotspot_positions(meta), 240


# ----------------------------------------------------------------------------
# BASS: túnel de flujo en la Microgravity Science Glovebox
# ----------------------------------------------------------------------------

def build_bass():
    reset()
    P = palette()
    root = empty("BASS_ducto")
    root["fuente"] = "NASA BASS / BASS-II; DOI 10.60555/58h4-dy80, 10.60555/4qc4-de67"
    W = H = 0.076
    L = 0.20
    t = 0.004
    duct = empty("Ducto_de_flujo", root)
    box("Pared_inferior", (L, W + 2 * t, t), (0, 0, -H / 2 - t / 2), P["aluminio"], duct)
    box("Pared_trasera", (L, t, H), (0, W / 2 + t / 2, 0), P["oscuro"], duct)
    box("Ventana_superior", (L, W + 2 * t, t), (0, 0, H / 2 + t / 2), P["vidrio"], duct)
    box("Ventana_frontal", (L, t, H), (0, -W / 2 - t / 2, 0), P["vidrio"], duct)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box("Larguero", (L, t, t), (0, sy * (W / 2 + t / 2), sx * (H / 2 + t / 2)), P["aluminio"], duct)

    # Entrada con panal enderezador de flujo.
    entrada = empty("Entrada_panal", root, (-L / 2 - 0.006, 0, 0))
    for i in range(7):
        c = -W / 2 + i * W / 6
        box(f"Panal_v{i}", (0.012, 0.0008, H), (0, c, 0), P["oscuro"], entrada)
        box(f"Panal_h{i}", (0.012, W, 0.0008), (0, 0, c), P["oscuro"], entrada)

    # Sección del ventilador aguas abajo.
    fan_sec = empty("Seccion_ventilador", root, (L / 2 + 0.03, 0, 0))
    for sy in (-1, 1):
        box("Carcasa_lado", (0.06, t, H + 2 * t), (0, sy * (W / 2 + t / 2), 0), P["panel"], fan_sec)
        box("Carcasa_tapa", (0.06, W + 2 * t, t), (0, 0, sy * (H / 2 + t / 2)), P["panel"], fan_sec)
    rotor = empty("Ventilador", fan_sec, (0.01, 0, 0))
    cyl("Ventilador_cubo", 0.008, 0.012, (0, 0, 0), P["oscuro"], rotor, rot=(0, math.pi / 2, 0))
    for k in range(5):
        a = k * 2 * math.pi / 5
        b = box(f"Aspa_{k}", (0.003, 0.012, 0.03), (0, 0.018 * math.sin(a), 0.018 * math.cos(a)), P["aluminio"], rotor)
        b.rotation_euler = (-a, 0.35, 0)

    # Portamuestras de acero con muestra plana de SIBAL (10 × 2,2 cm).
    sl, sw = 0.10, 0.022
    x0 = -0.06
    holder = empty("Portamuestras", root)
    for sz in (-1, 1):
        box("Marco_largo", (sl + 0.02, 0.006, 0.0012), (x0 + sl / 2, sz * (sw / 2 + 0.003), 0), P["oscuro"], holder)
    box("Marco_entrada", (0.01, sw + 0.012, 0.0012), (x0 - 0.005, 0, 0), P["oscuro"], holder)
    box("Marco_salida", (0.01, sw + 0.012, 0.0012), (x0 + sl + 0.005, 0, 0), P["oscuro"], holder)
    muestra = box("Muestra_SIBAL", (sl, sw, 0.00033), (x0, 0, 0), P["sibal"], root, origin_min_x=True)
    char = box("Zona_carbonizada", (sl, sw, 0.0005), (x0, 0, 0), P["char"], root, origin_min_x=True)
    ign = empty("Ignitor", root, (x0 + 0.004, 0, 0))
    cyl("Ignitor_hilo", 0.0004, sw + 0.01, (0, 0, 0.0008), P["kanthal"], ign, rot=(math.pi / 2, 0, 0), verts=8)
    ig_glow = cyl("Ignitor_brillo", 0.0006, sw + 0.01, (0, 0, 0.0008), P["brasa"], ign, rot=(math.pi / 2, 0, 0), verts=8)

    # Llama de flujo concurrente: base azul anclada en la zona de pirólisis,
    # cola amarilla aguas abajo, en ambas caras de la muestra.
    llama = empty("Llama_concurrente", root, (x0, 0, 0))
    for sz, side in ((1, "sup"), (-1, "inf")):
        b = sphere(f"Llama_base_{side}", 1, (0.006, 0, sz * 0.003), P["llama_azul"], llama, seg=24, ring=12)
        b.scale = (0.008, sw * 0.62, 0.0035)
        y = sphere(f"Llama_cola_{side}", 1, (0.022, 0, sz * 0.005), P["llama_amarilla"], llama, seg=24, ring=12)
        y.scale = (0.02, sw * 0.5, 0.004)
    for i, yy in enumerate((-0.022, 0.022)):
        for zz in (-0.022, 0.022):
            arrow(f"Flujo_{i}_{'a' if zz > 0 else 'b'}", (-L / 2 + 0.005, yy, zz), 0.045, P["flujo"], root, r=0.0012)
    scale_bar(root, 0.05, (-0.05, -W / 2 - t - 0.008, -H / 2 - t), 5, P, 0.0008)

    # Secuencia: ventilador a 10 cm/s, ignición 12-36, la llama avanza
    # con el flujo y deja carbonizado detrás, se apaga al consumir la muestra.
    key(rotor, 0, rot=(0, 0, 0))
    key(rotor, 288, rot=(40 * math.pi, 0, 0))
    key(ig_glow, 0, scale=0.0001)
    key(ig_glow, 12, scale=1)
    key(ig_glow, 36, scale=1)
    key(ig_glow, 40, scale=0.0001)
    key(llama, 0, scale=0.0001, loc=(x0, 0, 0))
    key(llama, 30, scale=0.0001, loc=(x0, 0, 0))
    key(llama, 48, scale=1, loc=(x0 + 0.004, 0, 0))
    key(llama, 230, scale=1, loc=(x0 + sl - 0.03, 0, 0))
    key(llama, 270, scale=0.0001, loc=(x0 + sl - 0.012, 0, 0))
    key(char, 0, scale=(0.0001, 1, 1))
    key(char, 40, scale=(0.0001, 1, 1))
    key(char, 240, scale=(0.82, 1, 1))
    key(char, 270, scale=(1, 1, 1))
    key(muestra, 0, scale=1)

    meta = {
        "id": "bass",
        "titulo": "BASS · llama sobre tela en flujo",
        "experimento": "Burning and Suppression of Solids (BASS y BASS-II)",
        "lugar": "Microgravity Science Glovebox, módulo Destiny, EEI",
        "escala": "Escala real: ducto de 7,6 × 7,6 × 20 cm; muestra de 10 × 2,2 cm; regla de 5 cm.",
        "resumen": "Un ventilador impone un flujo lento a lo largo del ducto. El hilo caliente enciende la muestra de SIBAL en su extremo de entrada y la llama avanza en el mismo sentido que el aire (flujo concurrente), con base azul y cola luminosa por hollín. Si el flujo baja demasiado, la llama se apaga por enfriamiento radiativo.",
        "datos": [
            ["Sección del ducto", "7,6 × 7,6 cm"],
            ["Velocidad del aire", "1 a 55 cm/s"],
            ["Muestras", "telas finas, PMMA, esferas, varillas y velas"],
            ["Ensayos", "BASS: 41 muestras, 115 quemas"],
        ],
        "hotspots": [
            {"nombre": "Llama_concurrente", "titulo": "Llama concurrente", "texto": "Avanza con el aire; su longitud crece con la velocidad del flujo.", "offset": [0.02, 0, 0.012]},
            {"nombre": "Muestra_SIBAL", "titulo": "Muestra SIBAL", "texto": "Tela de 0,33 mm: 75 % algodón y 25 % fibra de vidrio.", "offset": [0.07, 0, 0]},
            {"nombre": "Ignitor", "titulo": "Ignitor", "texto": "Hilo de Kanthal en el borde de entrada de la muestra."},
            {"nombre": "Ventilador", "titulo": "Ventilador", "texto": "Arrastra el aire a velocidad controlada."},
            {"nombre": "Ventana_superior", "titulo": "Ventana superior", "texto": "La cámara digital fotografía la llama desde arriba."},
        ],
        "fases": [[0, "Flujo establecido"], [0.5, "Ignición"], [2.0, "Propagación concurrente"], [10.0, "Combustión completa"]],
        "fuentes": [
            ["BASS en NASA PSI", "https://doi.org/10.60555/58h4-dy80"],
            ["BASS-II en NASA PSI", "https://doi.org/10.60555/4qc4-de67"],
            ["Resultados BASS-II (NTRS)", "https://ntrs.nasa.gov/citations/20160000593"],
        ],
        "_render_frame": 140,
    }
    return _hotspot_positions(meta), 288


# ----------------------------------------------------------------------------
# Saffire: unidad de flujo en la nave Cygnus
# ----------------------------------------------------------------------------

SAFFIRE_II_MATERIALS = [
    ("Silicona", (0.75, 0.3, 0.25)),
    ("SIBAL", (0.86, 0.82, 0.72)),
    ("PMMA a Nomex", (0.7, 0.75, 0.85)),
    ("PMMA estructurado", (0.85, 0.9, 0.95)),
    ("PMMA plano", (0.8, 0.88, 0.95)),
    ("Nomex", (0.92, 0.85, 0.35)),
    ("Silicona opuesta", (0.7, 0.28, 0.22)),
    ("SIBAL 2", (0.86, 0.82, 0.72)),
    ("Algodón", (0.95, 0.94, 0.9)),
]


def build_saffire(variant="I"):
    reset()
    P = palette()
    root = empty(f"Saffire_{variant}")
    root["fuente"] = "NASA Saffire; DOI 10.60555/0t15-1z43, 10.60555/2chp-m469, 10.60555/040q-4h36"
    L, Wd, Hd = 1.3, 0.46, 0.51
    bay = 0.42
    t = 0.012
    duct = empty("Ducto_de_flujo", root)
    box("Piso", (L, Wd + bay + 2 * t, t), (0, bay / 2, -Hd / 2 - t / 2), P["aluminio"], duct)
    box("Pared_lateral", (L, t, Hd), (0, -Wd / 2 - t / 2, 0), P["vidrio"], duct)
    box("Techo_corte", (L, Wd + bay + 2 * t, t), (0, bay / 2, Hd / 2 + t / 2), P["vidrio"], duct)
    box("Pared_Lexan", (L, 0.008, Hd), (0, Wd / 2, 0), P["lexan"], duct)
    box("Pared_bahia", (L, t, Hd), (0, Wd / 2 + bay + t / 2, 0), P["panel"], duct)
    for sy in (-Wd / 2 - t / 2, Wd / 2 + bay + t / 2):
        for sz in (-1, 1):
            box("Larguero", (L, 0.03, 0.03), (0, sy, sz * (Hd / 2 + t / 2)), P["aluminio"], duct)
    for sx in (-1, 1):
        box("Marco_extremo", (0.02, Wd + bay + 2 * t, 0.03), (sx * L / 2, bay / 2, Hd / 2 + t), P["aluminio"], duct)
        box("Marco_extremo_inf", (0.02, Wd + bay + 2 * t, 0.03), (sx * L / 2, bay / 2, -Hd / 2 - t), P["aluminio"], duct)

    entrada = empty("Rejilla_entrada", root, (-L / 2 + 0.02, 0, 0))
    for i in range(9):
        box(f"Rejilla_v{i}", (0.01, 0.004, Hd), (0, -Wd / 2 + (i + 0.5) * Wd / 9, 0), P["oscuro"], entrada)
    fans = []
    for k, sz in enumerate((-0.12, 0.12)):
        f = empty(f"Ventilador_{k + 1}", root, (L / 2 - 0.05, 0, sz))
        cyl("Carcasa", 0.1, 0.05, (0, 0, 0), P["panel"], f, rot=(0, math.pi / 2, 0))
        rot = empty("Rotor", f)
        cyl("Cubo", 0.03, 0.06, (0, 0, 0), P["oscuro"], rot, rot=(0, math.pi / 2, 0))
        for j in range(7):
            a = j * 2 * math.pi / 7
            b = box(f"Aspa_{j}", (0.008, 0.03, 0.07), (0.01, 0.055 * math.sin(a), 0.055 * math.cos(a)), P["aluminio"], rot)
            b.rotation_euler = (-a, 0.4, 0)
        fans.append(rot)

    # Bahía de aviónica: dos cámaras ven la muestra a través del Lexan.
    av = empty("Bahia_avionica", root, (0, Wd / 2 + bay / 2, 0))
    box("Caja_control", (0.5, 0.25, 0.18), (0.25, 0.05, -0.15), P["panel"], av)
    box("Fuente_alimentacion", (0.3, 0.25, 0.14), (-0.35, 0.05, -0.17), P["panel"], av)
    for k, cx in enumerate((-0.24, 0.24)):
        c = empty(f"Camara_{k + 1}", av, (cx, -0.1, 0.06))
        box("Cuerpo", (0.08, 0.12, 0.08), (0, 0.04, 0), P["oscuro"], c)
        cyl("Objetivo", 0.025, 0.04, (0, -0.04, 0), P["acero"], c, rot=(math.pi / 2, 0, 0))
    for k, (rx, rz) in enumerate(((-0.4, 0.15), (-0.1, 0.18), (0.15, 0.18), (0.42, 0.15))):
        cyl(f"Radiometro_{k + 1}", 0.015, 0.05, (rx, -0.15, rz), P["acero"], av, rot=(math.pi / 2, 0, 0), verts=16)

    burning = []
    if variant == "I":
        sl, sh = 0.94, 0.406
        x0 = -sl / 2
        frame = empty("Marco_muestra", root)
        for sz in (-1, 1):
            box("Marco_h", (sl + 0.04, 0.012, 0.02), (0, 0, sz * (sh / 2 + 0.01)), P["acero"], frame)
        for sx in (-1, 1):
            box("Marco_v", (0.02, 0.012, sh + 0.04), (sx * (sl / 2 + 0.01), 0, 0), P["acero"], frame)
        box("Muestra_SIBAL", (sl, 0.0004, sh), (x0, 0, 0), P["sibal"], root, origin_min_x=True)
        char = box("Zona_carbonizada", (sl, 0.0008, sh), (x0, 0, 0), P["char"], root, origin_min_x=True)
        ign = empty("Ignitor", root, (x0 + 0.01, 0, 0))
        cyl("Ignitor_hilo", 0.002, sh, (0, 0, 0), P["kanthal"], ign, verts=8)
        ig_glow = cyl("Ignitor_brillo", 0.003, sh, (0, 0, 0), P["brasa"], ign, verts=8)
        llama = empty("Frente_de_llama", root, (x0, 0, 0))
        for sy, side in ((1, "a"), (-1, "b")):
            b = sphere(f"Llama_base_{side}", 1, (0.012, sy * 0.008, 0), P["llama_azul"], llama, seg=24, ring=16)
            b.scale = (0.02, 0.008, sh * 0.5)
            y = sphere(f"Llama_cola_{side}", 1, (0.05, sy * 0.016, 0), P["llama_amarilla"], llama, seg=24, ring=16)
            y.scale = (0.05, 0.012, sh * 0.47)
        burning = [(llama, char, ig_glow, x0, sl)]
    else:
        sl, sh = 0.30, 0.05
        for i, (name, color) in enumerate(SAFFIRE_II_MATERIALS):
            col, row = i % 3, i // 3
            cx = -0.36 + col * 0.36
            cz = 0.13 - row * 0.13
            m = mat(f"Muestra {name}", color, rough=0.8)
            box(f"Muestra_{i + 1}_{name.replace(' ', '_')}", (sl, 0.002, sh), (cx - sl / 2, 0, cz), m, root, origin_min_x=True)
            box(f"Marco_{i + 1}", (sl + 0.02, 0.006, 0.006), (cx, 0, cz - sh / 2 - 0.006), P["acero"], root)
        # La muestra SIBAL (posición 2) arde en el ciclo de demostración.
        cx, cz = 0.0, 0.13
        x0 = cx - sl / 2
        char = box("Zona_carbonizada", (sl, 0.003, sh), (x0, 0, cz), P["char"], root, origin_min_x=True)
        ign = empty("Ignitor", root, (x0 + 0.005, 0, cz))
        ig_glow = cyl("Ignitor_brillo", 0.002, sh, (0, 0, 0), P["brasa"], ign, verts=8)
        llama = empty("Frente_de_llama", root, (x0, 0, cz))
        for sy, side in ((1, "a"), (-1, "b")):
            b = sphere(f"Llama_base_{side}", 1, (0.006, sy * 0.005, 0), P["llama_azul"], llama, seg=20, ring=12)
            b.scale = (0.01, 0.005, sh * 0.6)
            y = sphere(f"Llama_cola_{side}", 1, (0.03, sy * 0.008, 0), P["llama_amarilla"], llama, seg=20, ring=12)
            y.scale = (0.03, 0.007, sh * 0.5)
        burning = [(llama, char, ig_glow, x0, sl)]

    for i, (yy, zz) in enumerate(((-0.15, 0.15), (-0.15, -0.15), (0.15, 0.15), (0.15, -0.15))):
        arrow(f"Flujo_{i}", (-L / 2 + 0.04, yy, zz), 0.22, P["flujo"], root, r=0.005)
    scale_bar(root, 0.5, (-L / 2, -Wd / 2 - t - 0.04, -Hd / 2 - t), 5, P, 0.006)

    end = 312
    for r in fans:
        key(r, 0, rot=(0, 0, 0))
        key(r, end, rot=(60 * math.pi, 0, 0))
    for llama, char, ig_glow, x0, sl in burning:
        cz = llama.location.z
        key(ig_glow, 0, scale=0.0001)
        key(ig_glow, 12, scale=1)
        key(ig_glow, 40, scale=1)
        key(ig_glow, 44, scale=0.0001)
        key(llama, 0, scale=0.0001, loc=(x0, 0, cz))
        key(llama, 32, scale=0.0001, loc=(x0, 0, cz))
        key(llama, 60, scale=1, loc=(x0 + 0.01 * sl, 0, cz))
        key(llama, 260, scale=1, loc=(x0 + 0.86 * sl, 0, cz))
        key(llama, 296, scale=0.0001, loc=(x0 + 0.97 * sl, 0, cz))
        key(char, 0, scale=(0.0001, 1, 1))
        key(char, 44, scale=(0.0001, 1, 1))
        key(char, 270, scale=(0.85, 1, 1))
        key(char, 300, scale=(1, 1, 1))

    if variant == "I":
        meta = {
            "id": "saffire-i",
            "titulo": "Saffire-I · incendio a escala de nave",
            "experimento": "Spacecraft Fire Safety Experiment (Saffire-I y III)",
            "lugar": "Unidad de flujo dentro de la nave de carga Cygnus, tras desacoplarse de la EEI",
            "escala": "Escala real: unidad de ~1,3 × 1,0 × 0,5 m; ducto de 46 × 51 cm; muestra de 94 × 40,6 cm; regla de 50 cm.",
            "resumen": "La muestra de SIBAL, un orden de magnitud mayor que cualquier ensayo previo, está en el centro de un túnel de viento. Los ventiladores del extremo arrastran aire a 20 cm/s. El ignitor del borde de entrada la enciende y el frente de llama recorre la tela dejando residuo carbonizado. Dos cámaras miran a través de la pared de Lexan y cuatro radiómetros registran el calor.",
            "datos": [
                ["Muestra", "SIBAL 94 × 40,6 cm (52 g algodón + 17 g fibra de vidrio)"],
                ["Flujo de aire", "20 cm/s (Saffire-I); mayor en Saffire-III"],
                ["Sección del ducto", "46 × 51 cm"],
                ["Fechas", "Saffire-I: junio 2016"],
            ],
            "hotspots": [
                {"nombre": "Frente_de_llama", "titulo": "Frente de llama", "texto": "Se propaga con el aire y deja tela carbonizada detrás.", "offset": [0.05, 0, 0.22]},
                {"nombre": "Muestra_SIBAL", "titulo": "Muestra de 94 × 40,6 cm", "texto": "Antes de Saffire, las muestras no superaban 10 cm.", "offset": [0.75, 0, -0.1]},
                {"nombre": "Pared_Lexan", "titulo": "Pared de Lexan", "texto": "Separa el ducto de la bahía de aviónica y deja ver la llama."},
                {"nombre": "Camara_1", "titulo": "Cámaras", "texto": "Cada una cubre algo más de la mitad de la muestra."},
                {"nombre": "Ventilador_1", "titulo": "Ventiladores", "texto": "Aspiran el aire a través del ducto."},
            ],
            "fases": [[0, "Flujo establecido"], [0.5, "Ignición"], [2.5, "Propagación concurrente"], [12.0, "Extinción al final de la muestra"]],
            "fuentes": [
                ["Saffire-I en NASA PSI", "https://doi.org/10.60555/0t15-1z43"],
                ["Saffire-III en NASA PSI", "https://doi.org/10.60555/040q-4h36"],
                ["Ferkul et al., The Saffire Experiment (2017)", "https://discovery-pp.ucl.ac.uk/id/eprint/10069823/8/Ferkul_The_Saffire_Experiment_2017_US_National_Meeting_Final.pdf"],
                ["Ficha NASA Saffire", "https://www.nasa.gov/wp-content/uploads/2025/07/spacecraft-fire-safety-demonstration-saffire.pdf"],
            ],
            "_render_frame": 160,
        }
    else:
        meta = {
            "id": "saffire-ii",
            "titulo": "Saffire-II · nueve materiales",
            "experimento": "Spacecraft Fire Safety Experiment (Saffire-II)",
            "lugar": "Unidad de flujo dentro de la nave de carga Cygnus",
            "escala": "Escala real: mismas dimensiones de unidad que Saffire-I; nueve muestras de 30 × 5 cm. La distribución de materiales por posición es ilustrativa.",
            "resumen": "La misma unidad de flujo lleva nueve muestras pequeñas de materiales de cabina (SIBAL, Nomex, PMMA plano y estructurado, silicona) para comparar su inflamabilidad. Cada una se enciende por separado; la animación muestra una.",
            "datos": [
                ["Muestras", "9 de 5 × 30 cm"],
                ["Materiales", "SIBAL, Nomex, PMMA, silicona, transición PMMA–Nomex"],
                ["Flujo de aire", "20–30 cm/s según la muestra"],
                ["Fecha", "noviembre 2016"],
            ],
            "hotspots": [
                {"nombre": "Frente_de_llama", "titulo": "Muestra encendida", "texto": "Cada muestra tiene su propio ignitor.", "offset": [0.03, 0, 0.05]},
                {"nombre": "Pared_Lexan", "titulo": "Pared de Lexan", "texto": "Las cámaras ven las nueve muestras a la vez."},
                {"nombre": "Ventilador_1", "titulo": "Ventiladores", "texto": "Regulan la velocidad del aire."},
            ],
            "fases": [[0, "Flujo establecido"], [0.5, "Ignición"], [2.5, "Propagación"], [12.0, "Extinción"]],
            "fuentes": [
                ["Saffire-II en NASA PSI", "https://doi.org/10.60555/2chp-m469"],
                ["Diseño de muestras Saffire II (NTRS)", "https://ntrs.nasa.gov/api/citations/20150000894/downloads/20150000894.pdf"],
            ],
            "_render_frame": 160,
        }
    return _hotspot_positions(meta), end


# ----------------------------------------------------------------------------
# SAME: carrusel de muestras y detectores de humo (esquema conceptual)
# ----------------------------------------------------------------------------

SAME_MATERIALS = [
    ("Celulosa (mecha de algodón)", (0.95, 0.93, 0.85)),
    ("Kapton", (0.85, 0.45, 0.08)),
    ("Caucho de silicona", (0.6, 0.15, 0.12)),
    ("Teflón", (0.97, 0.97, 0.97)),
    ("Pyrell (espuma de poliuretano)", (0.95, 0.85, 0.35)),
]


def build_same():
    reset()
    P = palette()
    humo = mat("Humo", (0.75, 0.75, 0.78), rough=1.0, alpha=0.45)
    root = empty("SAME")
    root["fuente"] = "NASA/NIST SAME; DOI 10.60555/gd4k-8h62, 10.60555/2np7-jv14"
    root["nota"] = "Disposición conceptual: NASA no publica planos acotados del conjunto."

    base = box("Placa_base", (0.62, 0.3, 0.01), (0.1, 0, -0.005), P["aluminio"], root)
    car = empty("Carrusel", root, (-0.12, 0, 0.05))
    cyl("Carrusel_disco", 0.07, 0.01, (0, 0, 0), P["aluminio"], car, verts=48)
    cyl("Carrusel_eje", 0.01, 0.05, (0, 0, -0.025), P["acero"], car, verts=16)
    heaters = []
    for i, (name, color) in enumerate(SAME_MATERIALS):
        a = i * 2 * math.pi / 5
        pos = (0.05 * math.cos(a), 0.05 * math.sin(a), 0.02)
        s = empty(f"Muestra_{i + 1}", car, pos)
        cyl(f"Material_{name.split(' ')[0]}", 0.006, 0.025, (0, 0, 0), mat(name, color, rough=0.7), s, verts=16)
        for k in range(6):
            torus(f"Espira_{k}", 0.0068, 0.0006, (0, 0, -0.01 + k * 0.004), P["kanthal"], s)
        g = empty("Calentamiento", s)
        for k in range(6):
            torus(f"Espira_caliente_{k}", 0.0069, 0.0008, (0, 0, -0.01 + k * 0.004), P["brasa"], g)
        heaters.append(g)
    tapa = cyl("Campana_carrusel", 0.085, 0.06, (-0.12, 0, 0.06), P["vidrio"], root, verts=48)

    # Cámara de envejecimiento y colector hacia los seis instrumentos.
    cyl("Conducto_humo", 0.008, 0.1, (-0.04, 0, 0.06), P["acero"], root, rot=(0, math.pi / 2, 0), verts=16)
    cam = cyl("Camara_envejecimiento", 0.045, 0.16, (0.08, 0, 0.06), P["vidrio"], root, rot=(0, math.pi / 2, 0), verts=40)
    nube = empty("Humo_envejecido", root, (0.08, 0, 0.06))
    import random

    random.seed(7)
    for k in range(70):
        r = 0.035 * random.random() ** 0.5
        a = random.random() * 2 * math.pi
        sphere(f"Particula_{k}", 0.0015 + 0.002 * random.random(), (random.uniform(-0.07, 0.07), r * math.cos(a), r * math.sin(a)), humo, nube, seg=6, ring=4, smooth=False)
    det_names = [
        ("Colector_TEM", "Colector para microscopía electrónica"),
        ("Contador_particulas", "Contador de partículas"),
        ("Monitor_masa", "Monitor de concentración másica"),
        ("Detector_superficie", "Medidor de área superficial"),
        ("Detector_ionizacion", "Detector de ionización (transbordador)"),
        ("Detector_fotoelectrico", "Detector fotoeléctrico (EEI)"),
    ]
    dets = empty("Instrumentos", root)
    salida = Vector((0.17, 0, 0.06))
    cyl("Colector", 0.012, 0.03, (0.175, 0, 0.06), P["acero"], dets, rot=(0, math.pi / 2, 0), verts=16)
    for i, (n, _) in enumerate(det_names):
        x = 0.26 + (i % 3) * 0.065
        y = -0.075 if i < 3 else 0.075
        d = empty(n, dets, (x, y, 0.03))
        box("Caja", (0.05, 0.06, 0.06), (0, 0, 0), P["panel"] if i < 4 else mat("Detector", (0.85, 0.85, 0.82), rough=0.5), d)
        cyl("LED", 0.003, 0.002, (0, 0, 0.031), P["brasa"] if i >= 4 else P["flujo"], d, verts=8)
        tube(f"Tubo_{n}", salida + Vector((0.015, 0, 0)), (x, y * 0.55, 0.06), 0.0025, P["acero"], dets)
        tube(f"Tubo_{n}_b", (x, y * 0.55, 0.06), (x, y, 0.06), 0.0025, P["acero"], dets)
    scale_bar(root, 0.1, (-0.2, -0.13, 0), 10, P, 0.0015)

    end = 300
    step = end // 5
    for i, g in enumerate(heaters):
        key(g, 0, scale=0.0001)
        key(g, i * step + 4, scale=0.0001)
        key(g, i * step + 10, scale=1)
        key(g, i * step + 40, scale=1)
        key(g, i * step + 46, scale=0.0001)
    for i in range(6):
        key(car, i * step, rot=(0, 0, -i * 2 * math.pi / 5))
        if i < 5:
            key(car, i * step + 4, rot=(0, 0, -i * 2 * math.pi / 5))
    for i in range(5):
        key(nube, i * step, scale=0.2)
        key(nube, i * step + 20, scale=0.7)
        key(nube, i * step + 55, scale=1.0)

    meta = {
        "id": "same",
        "titulo": "SAME · medir el humo en microgravedad",
        "experimento": "Smoke Aerosol Measurement Experiment (SAME y SAME-R)",
        "lugar": "Microgravity Science Glovebox, EEI (2007–2008 y 2010–2011)",
        "escala": "Esquema conceptual: la disposición y las medidas son ilustrativas; la regla mide 10 cm.",
        "resumen": "Cinco materiales de cabina se envuelven en un hilo calefactor y se montan en un carrusel giratorio. Al calentarse producen humo sin llama, que envejece en una cámara antes de pasar a seis instrumentos. El hallazgo clave: el detector fotoeléctrico de la EEI captaba bien el humo de celulosa, silicona y Pyrell, pero fallaba a menudo con las partículas finas de Teflón y Kapton, muy usados en electrónica.",
        "datos": [
            ["Materiales", "celulosa, Kapton, silicona, Teflón, Pyrell"],
            ["Variables", "velocidad de calentamiento, flujo de aire, edad del humo"],
            ["Instrumentos", "6 por ensayo, incluidos 2 detectores de nave"],
            ["Socio", "NIST"],
        ],
        "hotspots": [
            {"nombre": "Carrusel", "titulo": "Carrusel de muestras", "texto": "Gira para colocar cada material en posición de calentamiento.", "offset": [0, 0, 0.04]},
            {"nombre": "Camara_envejecimiento", "titulo": "Cámara de envejecimiento", "texto": "El humo se retiene para simular el tiempo de acumulación en un incendio real."},
            {"nombre": "Detector_fotoelectrico", "titulo": "Detector fotoeléctrico de la EEI", "texto": "Fallaba con las partículas pequeñas de Teflón y Kapton."},
            {"nombre": "Detector_ionizacion", "titulo": "Detector de ionización", "texto": "Modelo del transbordador; solo algo mejor con Teflón."},
        ],
        "fases": [[0, "Celulosa"], [2.5, "Kapton"], [5.0, "Silicona"], [7.5, "Teflón"], [10.0, "Pyrell"]],
        "fuentes": [
            ["SAME en NASA PSI", "https://doi.org/10.60555/gd4k-8h62"],
            ["SAME-R en NASA PSI", "https://doi.org/10.60555/2np7-jv14"],
            ["Meyer et al., Fire Safety Journal 98 (2018)", "https://doi.org/10.1016/j.firesaf.2018.04.004"],
        ],
        "_render_frame": 130,
    }
    return _hotspot_positions(meta), end


def _hotspot_positions(meta):
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    for h in meta["hotspots"]:
        ob = bpy.data.objects[h["nombre"]]
        if ob.type == "MESH":
            pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
            c = sum(pts, Vector()) / 8
        else:
            c = ob.matrix_world.translation.copy()
        off = Vector(h.pop("offset", (0, 0, 0)))
        c = c + off
        h["posicion"] = [round(c.x, 4), round(c.z, 4), round(-c.y, 4)]
    return meta


def main():
    print("Generando modelos de experimentos en", OUT)
    manifest = []
    for builder in (build_flex, build_bass, lambda: build_saffire("I"), lambda: build_saffire("II"), build_same):
        meta, frames = builder()
        manifest.append(export(meta["id"], frames, meta))
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"modelos": manifest}, f, ensure_ascii=False, indent=2)
    print("Manifiesto:", os.path.join(OUT, "manifest.json"))


if __name__ == "__main__":
    main()
