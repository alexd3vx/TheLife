"""
Rigs a realistic CC0 body (Blender Foundation "Human Base Meshes") to the game's 65-bone skeleton.

Run:  blender -b --python make_body.py -- <bundle.blend> <Quaternius SuperHero gltf> <male|female> <out.glb> [debug-render.png]

How it works
 1. Import the Quaternius skeleton + mesh (T-pose). The realistic body is in an A-pose, so the Quaternius skeleton is
    posed to match (arms lowered), and the realistic mesh is scaled and placed onto it.
 2. Skin weights are copied from the posed Quaternius mesh to the realistic mesh (nearest surface), cleaned to 4 bones
    per vertex and smoothed.
 3. The posed skeleton becomes the bind pose. Animations only set bone rotations, so every existing clip plays on the
    new body unchanged (bind pose and animation rest pose are allowed to differ).
 4. Exports a skinned glTF (body + eyes) that the asset build then compresses.
"""
import bpy, bmesh, sys, math, json
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:]
BLEND, QUAT_GLTF, SEX, OUT = argv[:4]
DEBUG = argv[4] if len(argv) > 4 else None

bpy.ops.wm.open_mainfile(filepath=BLEND)
col = bpy.data.collections[f"Body {SEX.capitalize()} - Realistic"]
src_body = next(o for o in col.all_objects if o.type == "MESH" and ".eye" not in o.name)
src_eyes = [o for o in col.all_objects if o.type == "MESH" and ".eye" in o.name]

def world_bounds(objs):
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            mn = Vector(min(mn[i], w[i]) for i in range(3)); mx = Vector(max(mx[i], w[i]) for i in range(3))
    return mn, mx

# ---- clean copies of the realistic body and eyes (no modifiers: the stored mesh is the game-resolution base level)
def clean_copy(obj, name):
    mesh = obj.data.copy()
    new = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(new)
    new.matrix_world = obj.matrix_world.copy()
    return new

body = clean_copy(src_body, "Body")
eyes = [clean_copy(e, "Eye." + ("L" if e.name.endswith(".L") else "R")) for e in src_eyes]

# ---- import the Quaternius skeleton
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=QUAT_GLTF)
imported = [o for o in bpy.data.objects if o not in before]
arm = next(o for o in imported if o.type == "ARMATURE")
quat_body = max((o for o in imported if o.type == "MESH" and o.parent == arm), key=lambda o: len(o.data.vertices))
for o in imported:
    if o not in (arm, quat_body): bpy.data.objects.remove(o, do_unlink=True)

# Hide every other object from the bundle.
keep = {body, arm, quat_body, *eyes}
for o in list(bpy.data.objects):
    if o not in keep: bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.update()

# ---- fit: scale and place the realistic body on the Quaternius skeleton
mn, mx = world_bounds([body])
qmn0, qmx0 = world_bounds([quat_body])
TARGET_HEIGHT = qmx0.z - qmn0.z  # match the skeleton exactly, so every animation (hip height, stride) fits without rescaling
scale = TARGET_HEIGHT / (mx.z - mn.z)
parts = [body] + eyes
for o in parts:
    o.data.transform(o.matrix_world)  # bake into the mesh
    o.matrix_world = Matrix.Identity(4)
    o.data.transform(Matrix.Scale(scale, 4))
mn, mx = world_bounds(parts)
qmn, qmx = world_bounds([quat_body])
# feet on the floor, centred on the skeleton, same depth centre as the Quaternius mesh
shift = Vector((-(mn.x + mx.x) / 2, ((qmn.y + qmx.y) / 2) - ((mn.y + mx.y) / 2), -mn.z))
for o in parts: o.data.transform(Matrix.Translation(shift))
bpy.context.view_layer.update()
mn, mx = world_bounds([body])
print("FIT scale", round(scale, 3), "height", round(mx.z - mn.z, 3), "quat height", round(qmx.z - qmn.z, 3))

# ---- A-pose: find where the realistic hands are and lower the Quaternius arms to match
verts = [body.data.vertices[i].co.copy() for i in range(len(body.data.vertices))]
side = max(v.x for v in verts)
hand_pts = [v for v in verts if v.x > side - 0.06]
hand_tip = sum(hand_pts, Vector()) / len(hand_pts)
shoulder_l = arm.matrix_world @ arm.data.bones["upperarm_l"].head_local
arm_dir = (hand_tip - shoulder_l)
# the arm hangs in the XZ plane; angle below horizontal
drop = math.atan2(-arm_dir.z, arm_dir.x)
print("ARM drop angle (deg)", round(math.degrees(drop), 1), "hand tip", tuple(round(x, 3) for x in hand_tip))

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for suffix, sign in (("l", 1), ("r", -1)):
    pb = arm.pose.bones[f"upperarm_{suffix}"]
    head = arm.matrix_world @ pb.head
    # rotate about the Y axis at the shoulder; left arm (+x) goes down (clockwise seen from front), right mirrors
    rot = Matrix.Rotation(sign * drop, 4, "Y")
    pb.matrix = Matrix.Translation(head) @ rot @ Matrix.Translation(-head) @ pb.matrix
    bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")

# Evaluate the posed Quaternius mesh as the weight source.
quat_body.parent = arm
depsgraph = bpy.context.evaluated_depsgraph_get()
eval_obj = quat_body.evaluated_get(depsgraph)
ref_mesh = bpy.data.meshes.new_from_object(eval_obj)
ref = bpy.data.objects.new("Ref", ref_mesh)
bpy.context.scene.collection.objects.link(ref)
ref.matrix_world = Matrix.Identity(4)
bone_names = [b.name for b in arm.data.bones]
# vertex groups on the reference come from the source mesh
for name in bone_names:
    if name not in ref.vertex_groups: ref.vertex_groups.new(name=name)
print("REF verts", len(ref_mesh.vertices), "groups", len(ref.vertex_groups))


# ---- stage 2: copy skin weights from the posed Quaternius mesh onto the realistic body
for name in bone_names:
    if name not in body.vertex_groups: body.vertex_groups.new(name=name)
bpy.context.view_layer.objects.active = body
for o in bpy.data.objects: o.select_set(False)
body.select_set(True)
mod = body.modifiers.new("transfer", "DATA_TRANSFER")
mod.object = ref
mod.use_vert_data = True
mod.data_types_verts = {"VGROUP_WEIGHTS"}
mod.vert_mapping = "POLYINTERP_NEAREST"
mod.layers_vgroup_select_src = "ALL"
mod.layers_vgroup_select_dst = "NAME"
bpy.ops.object.modifier_apply(modifier=mod.name)

# Clean: at most 4 bones per vertex (glTF limit), a few smoothing passes so nothing tears, normalise.
bm = bmesh.new(); bm.from_mesh(body.data)
neighbours = [[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]
bm.free()
group_index = {g.name: g.index for g in body.vertex_groups}
index_name = {i: n for n, i in group_index.items()}
n = len(body.data.vertices)
weights = []
for v in body.data.vertices:
    w = {g.group: g.weight for g in v.groups if g.weight > 1e-4}
    weights.append(w)
def smooth(weights, factor=0.5):
    out = []
    for i, w in enumerate(weights):
        nb = neighbours[i]
        acc = {}
        for j in nb:
            for g, val in weights[j].items(): acc[g] = acc.get(g, 0.0) + val / max(1, len(nb))
        merged = {}
        for g in set(w) | set(acc):
            merged[g] = w.get(g, 0.0) * (1 - factor) + acc.get(g, 0.0) * factor
        out.append(merged)
    return out
# The realistic hands are modelled relaxed (fingers curled) but the skeleton's finger bones are bound straight, so
# finger animation would tear them apart. Fold every finger bone into its hand bone: the hand moves as one piece.
FINGER = ("index_", "middle_", "ring_", "pinky_", "thumb_")
for w in weights:
    for gid in list(w.keys()):
        name = index_name[gid]
        if name.startswith(FINGER):
            side = name[-1]
            w[group_index[f"hand_{side}"]] = w.get(group_index[f"hand_{side}"], 0.0) + w.pop(gid)
for _ in range(3): weights = smooth(weights)
for i, w in enumerate(weights):
    top = sorted(w.items(), key=lambda kv: -kv[1])[:4]
    total = sum(v for _, v in top) or 1.0
    weights[i] = {g: v / total for g, v in top}
body.vertex_groups.clear()
for name in bone_names: body.vertex_groups.new(name=name)
for i, w in enumerate(weights):
    for g, val in w.items(): body.vertex_groups[g].add([i], val, "REPLACE")
print("WEIGHTS done", n, "verts")

# ---- eyes: mark the iris and pupil in vertex colours (the game tints them with the chosen eye colour)
eye_centres = []
for e in eyes:
    pts = [v.co for v in e.data.vertices]
    centre = sum(pts, Vector()) / len(pts)
    eye_centres.append(centre)
    attr = e.data.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for v in e.data.vertices:
        d = (v.co - centre).normalized()
        cos = d.dot(Vector((0, -1, 0)))  # the face looks toward -Y
        iris = 1.0 if cos > math.cos(math.radians(36)) else 0.0
        pupil = 1.0 if cos > math.cos(math.radians(14)) else 0.0
        attr.data[v.index].color = (iris, pupil, 0.0, 1.0)
print("EYES at", [tuple(round(x, 3) for x in c) for c in eye_centres])

# ---- eyebrows: a thin arched ribbon over each eye, laid on the face surface
brow_verts, brow_faces = [], []
for centre in eye_centres:
    outward = 1 if centre.x > 0 else -1
    inner_x, outer_x = centre.x - outward * 0.026, centre.x + outward * 0.034
    profile = [(0.0, 0.028, 0.0018), (0.15, 0.031, 0.0030), (0.3, 0.034, 0.0038), (0.5, 0.036, 0.0042), (0.7, 0.036, 0.0040), (0.85, 0.033, 0.0030), (1.0, 0.028, 0.0016)]
    ring = []
    for t, dz, half in profile:
        x = inner_x + (outer_x - inner_x) * t
        z = centre.z + dz * (TARGET_HEIGHT / 1.78)
        hit, loc, nor, _ = body.ray_cast(Vector((x, centre.y - 0.25, z)), Vector((0, 1, 0)))
        if not hit: raise SystemExit("brow ray missed the face")
        base = loc + nor * 0.0015
        ring.append((base + Vector((0, 0, half)), base - Vector((0, 0, half))))
    start = len(brow_verts)
    for top, bottom in ring: brow_verts += [top, bottom]
    for i in range(len(ring) - 1):
        a = start + i * 2
        brow_faces += [(a, a + 1, a + 3, a + 2)] if outward < 0 else [(a, a + 2, a + 3, a + 1)]
brow_mesh = bpy.data.meshes.new("Brows"); brow_mesh.from_pydata([tuple(v) for v in brow_verts], [], brow_faces); brow_mesh.update()
brows = bpy.data.objects.new("Brows", brow_mesh); bpy.context.scene.collection.objects.link(brows)
vg = brows.vertex_groups.new(name="Head"); vg.add(list(range(len(brow_verts))), 1.0, "REPLACE")

# Eyes ride on the head bone.
for e in eyes:
    e.vertex_groups.clear()
    vg = e.vertex_groups.new(name="Head")
    vg.add(list(range(len(e.data.vertices))), 1.0, "REPLACE")

# ---- stage 3: bake the A-pose in as the bind pose, attach the meshes
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
bpy.ops.pose.select_all(action="SELECT")
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.data.objects.remove(quat_body, do_unlink=True)
bpy.data.objects.remove(ref, do_unlink=True)
for o in [body, brows] + eyes:
    o.parent = arm
    o.matrix_parent_inverse = Matrix.Identity(4)
    m = o.modifiers.new("Armature", "ARMATURE"); m.object = arm
    o.data.materials.clear()
def set_look(material, colour, roughness):
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = colour
    bsdf.inputs["Roughness"].default_value = roughness
# Distinct settings so the asset build does not merge them into one material.
mat = bpy.data.materials.new("Skin"); mat.use_nodes = True
set_look(mat, (0.8, 0.6, 0.5, 1), 0.62)
body.data.materials.append(mat)
emat = bpy.data.materials.new("Eye"); emat.use_nodes = True
set_look(emat, (1, 1, 1, 1), 0.12)
for e in eyes: e.data.materials.append(emat)
bmat = bpy.data.materials.new("Hair_Brows"); bmat.use_nodes = True
set_look(bmat, (0.1, 0.07, 0.05, 1), 0.9)
brows.data.materials.append(bmat)
for p in body.data.polygons: p.use_smooth = True

if DEBUG:
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.7, 0.5, 0.4, 1)
    sc = bpy.context.scene
    # a test pose: bend knees, elbows, a step forward
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    def rot(name, deg, axis="X"):
        pb = arm.pose.bones[name]; pb.rotation_mode = "XYZ"
        pb.rotation_euler = Matrix.Rotation(math.radians(deg), 3, axis).to_euler()
    rot("thigh_l", -50, "X"); rot("calf_l", 70, "X"); rot("thigh_r", 15, "X")
    rot("lowerarm_l", -90, "X"); rot("lowerarm_r", -60, "X"); rot("spine_01", 15, "X")
    bpy.ops.object.mode_set(mode="OBJECT")
    sc.render.engine = "CYCLES"; sc.cycles.samples = 16; sc.cycles.device = "CPU"
    sc.render.resolution_x = 1200; sc.render.resolution_y = 800
    cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 60; cam.location = (3.2, -4.6, 1.0); cam.rotation_euler = (math.radians(90), 0, math.radians(35))
    sun = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN")); sun.rotation_euler = (math.radians(55), 0, math.radians(25)); sun.data.energy = 3; sc.collection.objects.link(sun)
    w = bpy.data.worlds.new("w"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[1].default_value = 0.8; sc.world = w
    sc.render.filepath = DEBUG
    bpy.ops.render.render(write_still=True)
    arm.pose.bones["thigh_l"].rotation_euler = (0, 0, 0)
    for pb in arm.pose.bones: pb.rotation_euler = (0, 0, 0)

# ---- export
bpy.ops.object.select_all(action="DESELECT")
for o in [arm, body, brows] + eyes: o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=True, export_animations=False,
                          export_yup=True, export_apply=False, export_normals=True, export_texcoords=True, export_materials="EXPORT",
                          export_def_bones=False, export_image_format="NONE", export_vertex_color="ACTIVE")
print("EXPORTED", OUT)
