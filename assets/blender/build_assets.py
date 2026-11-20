"""Export reusable street modules and runners from a fresh Blender background session."""

from collections import defaultdict
from math import pi
from pathlib import Path
from random import Random

import bpy
from mathutils import Matrix, Vector


if not bpy.app.background or bpy.data.filepath:
    raise RuntimeError("Run with Blender --background --factory-startup --python assets/blender/build_assets.py")

LIBRARY = Path(__file__).resolve().parent
OUTPUT = LIBRARY.parents[1] / "public" / "scene"
OUTPUT.mkdir(parents=True, exist_ok=True)

scene = bpy.context.scene
scene.name = "Keychase · Street modules"
for obj in list(scene.objects):
    bpy.data.objects.remove(obj, do_unlink=True)


def group(name):
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    return collection


storefronts = {
    "cafe": "转角咖啡馆", "market": "市集", "arcade": "紫色高窄游戏厅",
    "rowhouse": "联排公寓", "bakery": "珊瑚烘焙铺", "florist": "柠檬黄花店",
    "post": "街区邮局", "bookshop": "青蓝书店", "studio": "橙色阶梯工作室",
    "metro": "宽体蓝色车站",
}

residential = {
    "cottage": {"coral-cottage": "珊瑚坡顶小院", "mint-gables": "薄荷蓝双坡小屋", "lemon-bungalow": "柠檬平顶小院"},
    "apartment": {"lavender-corner": "浅紫转角公寓", "ocean-terraces": "海蓝错层公寓", "brick-apartments": "砖红山墙公寓"},
    "villa": {"white-cantilever": "白石悬挑别墅", "terracotta-estate": "地中海红瓦庄园", "cedar-terraces": "山景玻璃叠墅"},
    "courtyard": {"huizhou-residence": "徽派白墙深宅", "jiangnan-water-court": "江南临水别院", "vermilion-courtyard": "朱门中式大宅"},
}

landmarks = {
    "great-wall": "万里长城", "mount-fuji": "富士山", "taj-mahal": "泰姬陵", "burj-khalifa": "哈利法塔",
    "eiffel-tower": "埃菲尔铁塔", "big-ben": "伊丽莎白塔", "colosseum": "罗马斗兽场", "giza-pyramids": "吉萨金字塔群",
    "chichen-itza": "奇琴伊察库库尔坎金字塔", "statue-of-liberty": "自由女神像",
    "christ-the-redeemer": "里约基督像", "sydney-opera-house": "悉尼歌剧院",
}

streetscape = {
    "sidewalk": "人行道模块",
    "broadleaf": "宽冠行道树", "talltree": "高冠行道树", "lamp": "街灯",
    "bench": "木长椅", "planter": "方形花箱", "hydrant": "消防栓",
    "mailbox": "蓝色邮筒", "bollard": "防撞柱", "traffic-signal": "交通信号灯",
}
module_groups = {"storefront": storefronts, **residential, "landmark": landmarks, "streetscape": streetscape}
asset_names = [name for group in module_groups.values() for name in group.values()]


def import_assets(prefixes):
    with bpy.data.libraries.load(str(LIBRARY / "street-kit.blend")) as (incoming, outgoing):
        names = {prefix: next(name for name in incoming.collections if name.startswith(f"{prefix} ·"))
                 for prefix in prefixes}
        outgoing.collections = list(names.values())
    return dict(zip(names, outgoing.collections))


assets = import_assets(asset_names)

rear_facades = {
    "珊瑚烘焙铺": (1.61, 1.00, (1.12, 2.98), "coral trim"),
    "宽体蓝色车站": (2.215, 2.16, (1.00, 2.68), "blue trim"),
    "转角咖啡馆": (1.75, 1.03, (1.10, 3.17), "coral trim"),
    "柠檬黄花店": (1.72, 1.04, (1.08, 3.12), "gold trim"),
    "青蓝书店": (1.925, 1.22, (1.04, 3.04, 5.09), "green trim"),
    "联排公寓": (1.87, 1.16, (1.00, 3.12, 5.12), "green trim"),
    "市集": (1.67, 1.14, (1.10, 3.39), "gold trim"),
    "街区邮局": (1.83, 1.20, (1.10, 3.19, 5.18), "blue trim"),
    "紫色高窄游戏厅": (1.915, .64, (1.3, 3.39, 5.58, 7.70), "violet trim"),
    "橙色阶梯工作室": (2.105, 1.55, (1.02, 3.25, 5.35), "gold trim"),
}


def rgba(hex_color):
    rgb = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb) + (1,)


def material(name, hex_color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = rgba(hex_color)
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Roughness"].default_value = .88
    return mat


rear_finishes = {
    "coral trim": "F09E6A", "green trim": "91BAA7", "gold trim": "EBC580",
    "blue trim": "A4CCDB", "violet trim": "B5A2D9",
    "rear window": "23475B", "rear glass": "4E7C91", "rear glint": "A5D2CC",
}
surfaces = {key: material(f"Demo · {key}", value) for key, value in {
    "asphalt": "738997", "patched asphalt": "8195A0", "asphalt specks": "617984",
    "sand": "E1D0A9", "courtyard": "BAD2B1", "stripe": "FFF1C7",
    **rear_finishes,
}.items()}

corners = ((-1,-1,0), (1,-1,0), (1,1,0), (-1,1,0), (-1,-1,1), (1,-1,1), (1,1,1), (-1,1,1))
faces = ((3,2,1,0), (4,5,6,7), (0,1,5,4), (1,2,6,5), (2,3,7,6), (3,0,4,7))
road_boxes = defaultdict(lambda: ([], []))


def block(x, y, z, w, d, h, tone):
    points, quads = road_boxes[tone]
    index = len(points)
    points.extend((x + dx * w / 2, y + dy * d / 2, z + dz * h) for dx, dy, dz in corners)
    quads.extend(tuple(index + vertex for vertex in face) for face in faces)


def rear_windows(name, center_x, center_y, scale):
    depth, spacing, floors, trim = rear_facades[name]
    back_y = center_y - depth * scale - .035
    window_scale = .74 if name == "紫色高窄游戏厅" else 1
    for x in (center_x - spacing * scale, center_x + spacing * scale):
        for floor in floors:
            z = .219 + floor * scale
            block(x, back_y + .071, z, .83 * window_scale, .31, 1.13, trim)
            block(x, back_y - .085, z + .105, .65 * window_scale, .048, .88, "rear window")
            block(x, back_y - .111, z + .165, .53 * window_scale, .028, .75, "rear glass")
            block(x - .162 * window_scale, back_y - .129, z + .48, .058, .012, .36, "rear glint")
            block(x, back_y - .133, z + .55, .61 * window_scale, .034, .055, trim)
            block(x, back_y - .088, z - .025, .99 * window_scale, .29, .10, trim)


def mesh(name, vertices, polygons, mat, collection):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, (), polygons)
    data.update()
    data.materials.append(mat)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    return obj


def load_actor(filename, description, root_name):
    with bpy.data.libraries.load(str(LIBRARY / filename)) as (incoming, outgoing):
        outgoing.collections = [next(name for name in incoming.collections if description in name)]
    actor_collection = outgoing.collections[0]
    scene.collection.children.link(actor_collection)
    root = actor_collection.objects[root_name]
    root.location = (0, 0, 0)
    root.rotation_euler.z = 0
    return root


def select_only(objects):
    for item in bpy.context.selected_objects:
        item.select_set(False)
    for item in objects:
        item.select_set(True)


def export(name, objects, *, compress=False, extras=False):
    select_only(objects)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / f"{name}.glb"), export_format='GLB',
                              use_selection=True, export_animations=False, export_extras=extras,
                              export_meshopt_compression_enable=compress)


merged = {}


def add_surface(obj, transform):
    indices = defaultdict(dict)
    for poly in obj.data.polygons:
        mat = obj.data.materials[poly.material_index]
        points, polygons = merged.setdefault(mat, ([], []))
        remap = indices[mat]
        for vertex in poly.vertices:
            if vertex not in remap:
                remap[vertex] = len(points)
                points.append(tuple(transform @ obj.data.vertices[vertex].co))
        polygons.append(tuple(remap[vertex] for vertex in poly.vertices))



for key, filename, description, root_name in (
    ("thief", "thief.blend", "THIEF - Character", "Thief"),
    ("police", "police.blend", "POLICE - Character", "Police"),
):
    actor = load_actor(filename, description, root_name)
    bpy.context.view_layer.update()
    export(key, [actor, *actor.children_recursive])


def library_root(key):
    root = bpy.data.objects.new(key, None)
    library.objects.link(root)
    modules.append(root)
    return root


def pack_module(root):
    for mat, (vertices, polygons) in merged.items():
        part = mesh(f"{root.name} · {mat.name}", vertices, polygons, mat, library)
        part.parent = root
        modules.append(part)
    merged.clear()


library = group("Modular browser assets")
modules = []
for role, names in module_groups.items():
    for key, name in names.items():
        root = library_root(key)
        root["streetRole"] = role
        for item in assets[name].all_objects:
            if item.type == 'MESH':
                add_surface(item, item.matrix_local)
        if name in rear_facades:
            road_boxes.clear()
            rear_windows(name, 0, 0, 1)
            turn = Matrix.Rotation(pi, 4, 'Z')
            for tone, (points, polygons) in road_boxes.items():
                vertices, faces_out = merged.setdefault(surfaces[tone], ([], []))
                start = len(vertices)
                vertices.extend(turn @ Vector((x, y, z - .219)) for x, y, z in points)
                faces_out.extend(tuple(start + vertex for vertex in face) for face in polygons)
        pack_module(root)


def pack_paving(key):
    root = library_root(key)
    for tone, (points, polygons) in road_boxes.items():
        merged[surfaces[tone]] = (points, polygons)
    pack_module(root)
    road_boxes.clear()


road_boxes.clear()
street_half_depth = 24
sidewalk_edge = 5.726
courtyard_depth = street_half_depth - sidewalk_edge
block(0, 0, -.25, 40, 2 * street_half_depth, .24, "sand")
block(0, 0, -.017, 40, 7.04, .045, "asphalt")
for side in (-1, 1):
    block(0, side * (sidewalk_edge + courtyard_depth / 2), -.009, 40, courtyard_depth, .226, "courtyard")
for x in range(-19, 20, 2):
    block(x, 0, .028, .94, .073, .012, "stripe")
random = Random(406)
for _ in range(260):
    x, y = random.uniform(-19.8, 19.8), random.uniform(-3.36, 3.36)
    if abs(y) > .16:
        block(x, y, .03, random.uniform(.054, .224), .075, .004,
              "asphalt specks" if random.random() < .54 else "patched asphalt")
pack_paving("road")

block(0, 0, .030, 1.12, 6.94, .014, "asphalt")
for line in range(9):
    block(0, -3.02 + line * .755, .045, .92, .283, .014, "stripe")
pack_paving("crosswalk")
export("modules", modules, compress=True, extras=True)

print(f"Exported {len(asset_names) + 2} street modules and both runners")
