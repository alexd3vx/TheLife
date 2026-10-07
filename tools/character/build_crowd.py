"""Builds the crowd bodies: a few hundred triangles each, for the people far enough away that a full character is a waste.

A real person is 30,000 triangles, 55 bones and a pile of garment meshes. A person ten metres away is about 40 pixels tall.
This script takes the neutral male and female body from the same MakeHuman data, thins them with Blender's decimator (bpy), and
tags every vertex with the part of the person it belongs to (skin, top, trousers, shoes, hair, sleeve, lower leg) and which limb it
swings with. The browser colours each zone per person and swings the limbs in the vertex shader, so one draw call holds a whole crowd
in which everybody has their own skin, clothes, hair, height and build.

    /tmp/bv/bin/python tools/character/build_crowd.py

Needs the same data as build_body.py, and `pip install bpy` (Blender as a module) in the same venv. Writes crowd.json.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import mh  # noqa: E402
import shapes  # noqa: E402
from build_body import SC, triangulate  # noqa: E402

LODS = {"mid": 1500, "far": 420}

# vertex zones, shared with apps/client/src/map/crowd.ts
SKIN, TOP, BOTTOM, SHOE, HAIR, FOREARM, LOWERLEG = range(7)


def decimate(P: np.ndarray, tris: np.ndarray, target: int):
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    used = np.unique(tris)
    remap = -np.ones(len(P), dtype=np.int64)
    remap[used] = np.arange(len(used))
    mesh = bpy.data.meshes.new("body")
    mesh.from_pydata([tuple(map(float, p)) for p in P[used]], [], [tuple(map(int, remap[t])) for t in tris])
    mesh.update()
    ob = bpy.data.objects.new("body", mesh)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new("d", "DECIMATE")
    m.ratio = min(1.0, target / len(tris))
    m.use_symmetry = True
    m.symmetry_axis = "X"
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    ev.calc_loop_triangles()
    V = np.array([tuple(v.co) for v in ev.vertices], dtype=np.float64)
    T = np.array([tuple(t.vertices) for t in ev.loop_triangles], dtype=np.int64)
    keep = np.unique(T)
    back = -np.ones(len(V), dtype=np.int64)
    back[keep] = np.arange(len(keep))
    return V[keep], back[T]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "..", "apps", "client", "public", "assets", "characters"))
    args = ap.parse_args()
    D = mh.data_dir()
    obj = mh.load_obj(os.path.join(D, "3dobjs", "base.obj"))
    keep = [g == "body" for g in obj.face_group]
    tris, _ = triangulate(obj.faces, obj.face_uvs, keep)
    ground = np.array(obj.groups["joint-ground"])
    rig = json.load(open(os.path.join(D, "rigs", "standard", "rig.game_engine.json")))
    weights = json.load(open(os.path.join(D, "rigs", "standard", "weights.game_engine.json")))["weights"]
    # dominant bone of every base vertex
    best = np.zeros(len(obj.verts))
    dom = np.array([""] * len(obj.verts), dtype=object)
    for b, lst in weights.items():
        for v, w in lst:
            if w > best[v]:
                best[v] = w
                dom[v] = b
    out: dict = {"zones": ["skin", "top", "bottom", "shoe", "hair", "forearm", "lowerleg"], "bodies": {}}
    for sex, gender in (("male", 1.0), ("female", 0.0)):
        P0 = shapes.macro_pose(obj.verts, gender=gender)
        g0 = P0[ground].mean(0)
        Pw = (P0 - g0) * SC

        def joint(name: str) -> np.ndarray:
            h = rig[name]["head"]
            vs = h["vertex_indices"] if h["strategy"] == "MEAN" else obj.groups[h["cube_name"]]
            return Pw[np.array(vs)].mean(0)

        piv = {"hip": joint("thigh_l"), "knee": joint("calf_l"), "shoulder": joint("upperarm_l"), "elbow": joint("lowerarm_l")}
        # which side is "l": +x or -x
        left_sign = 1.0 if piv["hip"][0] > 0 else -1.0
        entry: dict = {"height": float(Pw[np.unique(tris), 1].max()), "pivots": {k: [round(float(x), 4) for x in v] for k, v in piv.items()}, "lods": {}}
        for lod, target in LODS.items():
            V, T = decimate(Pw, tris, target)
            # carry each thinned vertex's identity over from the nearest original vertex
            body_v = np.unique(tris)
            d2 = ((V[:, None, :] - Pw[body_v][None, :, :]) ** 2).sum(-1)
            near = body_v[d2.argmin(1)]
            bone = dom[near]
            H = V[:, 1].max()
            kneeY, hipY = piv["knee"][1], piv["hip"][1]
            head = np.array([b == "head" for b in bone])
            zFront = V[head, 2].max()
            zone = np.zeros(len(V), dtype=np.int8)
            limb = np.zeros(len(V), dtype=np.int8)
            for i, b in enumerate(bone):
                x, y, z = V[i]
                side = 1 if (x > 0) == (left_sign > 0) else -1
                base = b.rsplit("_", 1)[0]
                if b == "head" or b.startswith("neck"):
                    zone[i] = HAIR if (b == "head" and y > H - 0.095 and (z < zFront - 0.055 or y > H - 0.04)) else SKIN
                elif base.startswith(("hand", "thumb", "index", "middle", "ring", "pinky")):
                    zone[i], limb[i] = SKIN, 2 * side
                elif base == "upperarm":
                    zone[i], limb[i] = TOP, 2 * side
                elif base == "lowerarm":
                    zone[i], limb[i] = FOREARM, 2 * side
                elif base.startswith("clavicle"):
                    zone[i] = TOP
                elif base in ("pelvis", "spine_01", "spine_02", "spine_03", "spine_04", "spine_05") or b in ("pelvis", "spine_01", "spine_02", "spine_03"):
                    if y > 0.82 * H and abs(x) < 0.06 and z > -0.02:
                        zone[i] = SKIN  # the neckline
                    else:
                        zone[i] = TOP if y > 0.535 * H else BOTTOM
                elif base == "thigh":
                    zone[i], limb[i] = BOTTOM, side
                elif base == "calf":
                    zone[i], limb[i] = LOWERLEG, side
                elif base in ("foot", "ball"):
                    zone[i], limb[i] = SHOE, side
                else:
                    zone[i] = TOP if y > 0.535 * H else BOTTOM
            entry["lods"][lod] = {
                "pos": np.round(V * 1000).astype(int).reshape(-1).tolist(),
                "tri": T.reshape(-1).tolist(),
                "zone": zone.tolist(),
                "limb": limb.tolist(),
            }
            print(f"{sex} {lod}: {len(V)} vertices, {len(T)} triangles, height {H:.2f} m")
        out["bodies"][sex] = entry
    path = os.path.join(os.path.abspath(args.out), "crowd.json")
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"crowd.json: {os.path.getsize(path) / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
