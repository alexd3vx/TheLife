#!/usr/bin/env python3
"""Builds the morphable body for TheLife from MPFB2 / MakeHuman data (CC0 assets).

Writes three files into apps/client/public/assets/characters/:
  body_mpfb.glb          the rest body (adult, African features, neutral sex, 25 years), eyes, brows, lashes and a modest base layer,
                          one skeleton (the MPFB "game engine" rig: 53 bones with fingers, plus two eye bones), skin weights
  body_mpfb.morphs.pack  every morph as sparse int16 deltas (0.2 mm steps), one block per mesh space, gzipped
  body_mpfb.morphs.json  the slider list, where each target lives in the .bin, and how each target moves the bones

Usage: build_body.py [--out DIR]   (data directories come from MPFB_DATA and MH_ASSETS, see mh.py)
"""
from __future__ import annotations

import argparse
import io
import json
import os
import struct
import sys
import time

import numpy as np
from PIL import Image

import glb
import mh
import shapes

SC = 0.1  # decimetres to metres
STEP = 2e-4  # int16 delta step in metres (0.2 mm: far finer than a pixel at any camera distance; range +-6 m)


def log(*a):
    print(*a, flush=True)


# --------------------------------------------------------------------------------------------- geometry helpers
def face_normals_acc(P: np.ndarray, tris: np.ndarray) -> np.ndarray:
    n = np.zeros_like(P)
    a, b, c = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, tris[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return n / ln


def triangulate(faces: list[list[int]], uvfaces: list[list[int]], keep=None):
    tris, tuv = [], []
    for fi, (f, u) in enumerate(zip(faces, uvfaces)):
        if keep is not None and not keep[fi]:
            continue
        for k in range(1, len(f) - 1):
            tris.append((f[0], f[k], f[k + 1]))
            tuv.append((u[0], u[k], u[k + 1]))
    return np.array(tris, dtype=np.int64), np.array(tuv, dtype=np.int64)


def split_by_uv(tris: np.ndarray, tuv: np.ndarray):
    """One output vertex per (position, uv) pair. Returns (orig index per output vertex, uv index per vertex, triangle indices)."""
    key = {}
    orig, uvi = [], []
    out = np.zeros_like(tris)
    for t in range(len(tris)):
        for k in range(3):
            kk = (int(tris[t, k]), int(tuv[t, k]))
            i = key.get(kk)
            if i is None:
                i = len(orig)
                key[kk] = i
                orig.append(kk[0])
                uvi.append(kk[1])
            out[t, k] = i
    return np.array(orig, dtype=np.int64), np.array(uvi, dtype=np.int64), out


def components(n_verts: int, tris: np.ndarray) -> np.ndarray:
    parent = list(range(n_verts))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b, c in tris:
        ra, rb, rc = find(a), find(b), find(c)
        parent[rb] = ra
        parent[find(rc)] = find(ra)
    return np.array([find(i) for i in range(n_verts)])


# --------------------------------------------------------------------------------------------- textures
def jpeg(img: Image.Image, q=86) -> bytes:
    b = io.BytesIO()
    img.convert("RGB").save(b, "JPEG", quality=q, optimize=True)
    return b.getvalue()


def png(img: Image.Image) -> bytes:
    b = io.BytesIO()
    img.save(b, "PNG", optimize=True)
    return b.getvalue()


def skin_detail(path: str, size=1024) -> bytes:
    """A skin photo-scan made neutral: the picture divided by its own average colour, halved so highlights above 1 still fit in 8 bits.
    The game multiplies it by (tone * 2), so the same detail (lips, nails, veins, pores) works for every skin tone."""
    img = Image.open(path).convert("RGB").resize((size, size), Image.LANCZOS)
    a = np.asarray(img, dtype=np.float64) / 255.0
    lum = a.mean(axis=2)
    mask = lum > 0.06
    mean = a[mask].mean(axis=0)
    d = a / mean * 0.5
    return jpeg(Image.fromarray(np.clip(d * 255, 0, 255).astype(np.uint8)), 88)


# --------------------------------------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "..", "apps", "client", "public", "assets", "characters"))
    ap.add_argument("--only-check", action="store_true")
    args = ap.parse_args()
    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)
    t0 = time.time()

    D = mh.data_dir()
    A = mh.assets_dir()
    obj = mh.load_obj(os.path.join(D, "3dobjs", "base.obj"))
    n_base = len(obj.verts)
    log(f"base mesh: {n_base} vertices, {len(obj.faces)} faces")

    # ---- the rest body: African features, neutral sex, 25 years, average build
    P0 = shapes.macro_pose(obj.verts)
    ground_idx = np.array(obj.groups["joint-ground"])

    # ---- the body surface: the "body" group only (helper geometry, joint cubes, eyes and teeth helpers are left out)
    keep = [g == "body" for g in obj.face_group]
    tris, tuv = triangulate(obj.faces, obj.face_uvs, keep)
    orig, uvi, tri_out = split_by_uv(tris, tuv)
    body_verts = np.unique(tris)
    log(f"body: {len(body_verts)} vertices ({len(orig)} with uv seams), {len(tri_out)} triangles")

    # ---- morphs (every one is a delta from P0 in decimetres; stored in metres with the ground held still)
    morphs: list[dict] = []  # {id, label, group, kind, delta (n_base,3) dm}
    log("macros ...")
    rest = shapes.macro_pose(obj.verts)
    for name, params in shapes.MACROS.items():
        if name in ("masculine", "feminine"):
            d = shapes.macro_pose(obj.verts, **params) - rest
            morphs.append({"id": name, "label": name.title(), "group": "Macro", "delta": d})
            continue
        # everything else is measured on a fully masculine and a fully feminine body, so a mix of the two stays accurate
        for tag, gender in (("m", 1.0), ("f", 0.0)):
            d = shapes.macro_pose(obj.verts, gender=gender, **params) - shapes.macro_pose(obj.verts, gender=gender)
            morphs.append({"id": f"{name}@{tag}", "label": name.replace("_", " ").title() + f" ({tag})", "group": "Macro", "delta": d})
    for name, params in shapes.BUST.items():
        base_f = shapes.macro_pose(obj.verts, gender=0.0)
        d = shapes.macro_pose(obj.verts, **params) - base_f
        morphs.append({"id": name, "label": name.replace("_", " ").title(), "group": "Macro", "delta": d})
    log("details ...")
    sliders = []
    for sid, label, group, dec, inc in shapes.DETAILS:
        entry = {"id": sid, "label": label, "group": group, "inc": f"{sid}+", "dec": None}
        morphs.append({"id": f"{sid}+", "label": label + " +", "group": group, "delta": shapes.detail_delta(inc, n_base)})
        if dec:
            entry["dec"] = f"{sid}-"
            morphs.append({"id": f"{sid}-", "label": label + " -", "group": group, "delta": shapes.detail_delta(dec, n_base)})
        sliders.append(entry)
    for fid, parts in shapes.FACE_UNITS.items():
        morphs.append({"id": fid, "label": fid[3:], "group": "Expression", "delta": shapes.face_unit_delta(parts, n_base)})
    log(f"{len(morphs)} morphs in {time.time() - t0:.1f}s")

    # how well does a weighted sum of macros match the true combined body?
    by_id = {m["id"]: m for m in morphs}

    def mix(sex: float, **w):
        """sex 0..1 (0 feminine, 1 masculine); w maps macro name -> amount (0..1)."""
        acc = rest.copy()
        acc += by_id["masculine"]["delta"] * max(0.0, 2 * sex - 1) + by_id["feminine"]["delta"] * max(0.0, 1 - 2 * sex)
        for k, v in w.items():
            acc += v * (sex * by_id[f"{k}@m"]["delta"] + (1 - sex) * by_id[f"{k}@f"]["delta"])
        return acc

    for label, sex, kw, w in [
        ("male, heavy, muscular", 1.0, {"gender": 1.0, "weight": 1.0, "muscle": 1.0}, {"heavy": 1, "muscular": 1}),
        ("female, slim, older", 0.0, {"gender": 0.0, "weight": 0.0, "age": 0.846}, {"slim": 1, "older": 1}),
        ("male, tall, older", 1.0, {"gender": 1.0, "height": 1.0, "age": 0.846}, {"tall": 1, "older": 1}),
        ("mixed sex 0.5, heavy", 0.5, {"gender": 0.5, "weight": 1.0}, {"heavy": 1}),
        ("sex 0.8, tall, muscular", 0.8, {"gender": 0.8, "height": 1.0, "muscle": 1.0}, {"tall": 1, "muscular": 1}),
    ]:
        true = shapes.macro_pose(obj.verts, **kw)
        e = np.linalg.norm((true - mix(sex, **w))[body_verts], axis=1) * SC * 1000
        log(f"  mix error {label}: mean {e.mean():.1f} mm, max {e.max():.1f} mm")

    # ---- skeleton: joint positions come from the helper cubes, which morph with the body
    rig = json.load(open(os.path.join(D, "rigs", "standard", "rig.game_engine.json")))
    weights = json.load(open(os.path.join(D, "rigs", "standard", "weights.game_engine.json")))["weights"]
    rename = {"Root": "root", "head": "Head"}
    nm = lambda b: rename.get(b, b)
    bones: dict[str, dict] = {}
    for b, spec in rig.items():
        h = spec["head"]
        verts = h["vertex_indices"] if h["strategy"] == "MEAN" else obj.groups[h["cube_name"]]
        bones[nm(b)] = {"parent": nm(spec["parent"]) if spec["parent"] else None, "verts": np.array(verts)}
    # tip bones: the animation libraries carry tracks for them, and they mark where a finger or toe ends
    for side in ("l", "r"):
        for finger, fid in (("thumb", 1), ("index", 2), ("middle", 3), ("ring", 4), ("pinky", 5)):
            bones[f"{finger}_04_leaf_{side}"] = {"parent": f"{finger}_03_{side}", "verts": np.array(obj.groups[f"joint-{side}-finger-{fid}-4"])}
        bones[f"ball_leaf_{side}"] = {"parent": f"ball_{side}", "verts": np.array(obj.groups[f"joint-{side}-toe-2-4"])}
    bones["eye_l"] = {"parent": "Head", "verts": np.array(obj.groups["joint-l-eye"])}
    bones["eye_r"] = {"parent": "Head", "verts": np.array(obj.groups["joint-r-eye"])}
    order: list[str] = []
    todo = list(bones)
    while todo:
        for b in list(todo):
            p = bones[b]["parent"]
            if p is None or p in order:
                order.append(b)
                todo.remove(b)
    bidx = {b: i for i, b in enumerate(order)}
    g0 = P0[ground_idx].mean(0)
    jw = np.array([(P0[bones[b]["verts"]].mean(0) - g0) * SC for b in order])  # rest world positions, metres
    log(f"skeleton: {len(order)} bones, root at {jw[0]}")

    # per-morph: the ground shift (held still by subtracting it everywhere) and the joint deltas
    for m in morphs:
        d = m["delta"]
        gd = d[ground_idx].mean(0)
        m["ground"] = gd
        m["joint"] = np.array([(d[bones[b]["verts"]].mean(0) - gd) * SC for b in order])

    # ---- skin weights per base vertex (top four influences, renormalised)
    infl: list[list[tuple[int, float]]] = [[] for _ in range(n_base)]
    for b, lst in weights.items():
        bi = bidx.get(nm(b))
        if bi is None:
            continue
        for v, w in lst:
            if w > 1e-4:
                infl[v].append((bi, w))
    J = np.zeros((n_base, 4), dtype=np.uint8)
    W = np.zeros((n_base, 4), dtype=np.float32)
    for v in body_verts:
        top = sorted(infl[v], key=lambda t: -t[1])[:4]
        s = sum(w for _, w in top) or 1.0
        for k, (bi, w) in enumerate(top):
            J[v, k] = bi
            W[v, k] = w / s
        if not top:
            J[v, 0] = bidx["pelvis"]
            W[v, 0] = 1.0

    # ---- world-space rest positions and normals
    Pw = (P0 - g0) * SC
    nrm_t = np.array([t for t in tris])
    N0 = face_normals_acc(Pw, nrm_t)
    uv_all = obj.uvs.copy()
    uv_all[:, 1] = 1 - uv_all[:, 1]

    g = glb.Glb()
    # textures
    tex_skin_m = g.image(skin_detail(os.path.join(A, "skins", "young_african_male", "young_darkskinned_male_diffuse.png")), "image/jpeg", "skin_detail_male")
    tex_skin_f = g.image(skin_detail(os.path.join(A, "skins", "young_african_female", "young_darkskinned_female_diffuse.png")), "image/jpeg", "skin_detail_female")
    eye_img = Image.open(os.path.join(A, "eyes", "materials", "brown_eye.png")).convert("RGB").resize((512, 512), Image.LANCZOS)
    tex_eye = g.image(jpeg(eye_img, 88), "image/jpeg", "eye_brown")
    brow_img = Image.open(os.path.join(A, "eyebrows", "eyebrow001", "eyebrow001.png")).convert("RGBA")
    brow_img = brow_img.resize((min(512, brow_img.width), min(512, brow_img.height)), Image.LANCZOS)
    tex_brow = g.image(png(brow_img), "image/png", "brows")
    lash_img = Image.open(os.path.join(A, "eyelashes", "eyelashes01", "eyelashes01.png")).convert("RGBA")
    lash_img = lash_img.resize((min(512, lash_img.width), min(512, lash_img.height)), Image.LANCZOS)
    tex_lash = g.image(png(lash_img), "image/png", "lashes")

    mat_skin = g.material({"name": "skin", "pbrMetallicRoughness": {"baseColorTexture": {"index": tex_skin_m}, "baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.62}, "extras": {"skinDetailFemale": tex_skin_f}})
    mat_eye = g.material({"name": "eye", "pbrMetallicRoughness": {"baseColorTexture": {"index": tex_eye}, "metallicFactor": 0, "roughnessFactor": 0.12}})
    mat_brow = g.material({"name": "brows", "pbrMetallicRoughness": {"baseColorTexture": {"index": tex_brow}, "metallicFactor": 0, "roughnessFactor": 0.9}, "alphaMode": "MASK", "alphaCutoff": 0.2, "doubleSided": True})
    mat_lash = g.material({"name": "lashes", "pbrMetallicRoughness": {"baseColorTexture": {"index": tex_lash}, "metallicFactor": 0, "roughnessFactor": 0.9}, "alphaMode": "MASK", "alphaCutoff": 0.3, "doubleSided": True})
    mat_under = g.material({"name": "underwear", "pbrMetallicRoughness": {"baseColorFactor": [0.62, 0.64, 0.70, 1], "metallicFactor": 0, "roughnessFactor": 0.92}, "doubleSided": True})

    # ---- skeleton nodes
    arm = g.node({"name": "Armature", "children": []}, root=True)
    bone_nodes = {}
    for b in order:
        p = bones[b]["parent"]
        pos = jw[bidx[b]] - (jw[bidx[p]] if p else 0)
        bone_nodes[b] = g.node({"name": b, "translation": [float(x) for x in pos]})
        if p:
            g.j["nodes"][bone_nodes[p]].setdefault("children", []).append(bone_nodes[b])
    g.j["nodes"][arm]["children"].append(bone_nodes["root"])
    ibm = np.zeros((len(order), 16), dtype=np.float32)
    for i in range(len(order)):
        m = np.eye(4)
        m[:3, 3] = -jw[i]
        ibm[i] = m.T.reshape(16)  # glTF is column-major
    ibm_acc = g.accessor(ibm.reshape(-1, 16), "MAT4")
    g.j["skins"].append({"name": "Body", "joints": [bone_nodes[b] for b in order], "inverseBindMatrices": ibm_acc, "skeleton": bone_nodes["root"]})

    # ---- the meshes
    mesh_space: dict[str, dict] = {}  # name -> {space, orig}

    def add_mesh(name: str, pos: np.ndarray, nrm: np.ndarray, uv: np.ndarray, jnt: np.ndarray, wgt: np.ndarray, orig_ix: np.ndarray, tri: np.ndarray, material: int, space: str):
        attrs = {
            "POSITION": g.accessor(pos.astype(np.float32), "VEC3", glb.ARRAY_BUFFER, True),
            "NORMAL": g.accessor(nrm.astype(np.float32), "VEC3", glb.ARRAY_BUFFER),
            "TEXCOORD_0": g.accessor(uv.astype(np.float32), "VEC2", glb.ARRAY_BUFFER),
            "JOINTS_0": g.accessor(jnt.astype(np.uint8), "VEC4", glb.ARRAY_BUFFER),
            "WEIGHTS_0": g.accessor(wgt.astype(np.float32), "VEC4", glb.ARRAY_BUFFER),
            "_ORIG": g.accessor(orig_ix.astype(np.uint16), "SCALAR", glb.ARRAY_BUFFER),
        }
        ind = g.accessor(tri.reshape(-1).astype(np.uint16 if len(pos) < 65536 else np.uint32), "SCALAR", glb.ELEMENT_ARRAY_BUFFER)
        mi = g.mesh(name, {"attributes": attrs, "indices": ind, "material": material, "mode": 4})
        ni = g.node({"name": name, "mesh": mi, "skin": 0}, root=True)
        mesh_space[name] = {"space": space, "vertices": int(len(pos)), "triangles": int(len(tri))}
        return ni

    add_mesh("Body", Pw[orig], N0[orig], uv_all[uvi], J[orig], W[orig], orig, tri_out, mat_skin, "base")

    # ---- the modest base layer: shorts for everyone, a top for the feminine look (the client hides it by sex)
    dom = J[np.arange(n_base), W.argmax(axis=1)]
    dom_name = np.array([order[i] for i in dom])
    vsel_short = np.zeros(n_base, dtype=bool)
    vsel_top = np.zeros(n_base, dtype=bool)
    for side in ("l", "r"):
        hip, knee = jw[bidx[f"thigh_{side}"]], jw[bidx[f"calf_{side}"]]
        axis = knee - hip
        sel = dom_name == f"thigh_{side}"
        t = ((Pw - hip) @ axis) / (axis @ axis)
        vsel_short |= sel & (t < 0.44)
    for v in body_verts:
        y = Pw[v, 1]
        if dom_name[v] in ("pelvis", "spine_01") and 0.70 < y < 0.985:
            vsel_short[v] = True
        if dom_name[v] in ("spine_01", "spine_02", "spine_03") and 1.19 < y < 1.37 and abs(Pw[v, 0]) < 0.185 and Pw[v, 2] > -0.2:
            vsel_top[v] = True
    short_sel = vsel_short[tris].all(axis=1)
    top_sel = vsel_top[tris].all(axis=1)

    def layer(name: str, sel: np.ndarray, lift: float):
        t = tris[sel]
        tu = tuv[sel]
        o2, u2, ti = split_by_uv(t, tu)
        pos = Pw[o2] + N0[o2] * lift
        add_mesh(name, pos, N0[o2], uv_all[u2], J[o2], W[o2], o2, ti, mat_under, "base")
        log(f"  layer {name}: {len(ti)} triangles")

    # teeth and tongue: the base mesh's own helper shapes, so every face unit (the jaw above all) moves them with the lips
    mat_teeth = g.material({"name": "teeth", "pbrMetallicRoughness": {"baseColorFactor": [0.93, 0.9, 0.82, 1], "metallicFactor": 0, "roughnessFactor": 0.35}})
    mat_tongue = g.material({"name": "tongue", "pbrMetallicRoughness": {"baseColorFactor": [0.62, 0.22, 0.24, 1], "metallicFactor": 0, "roughnessFactor": 0.5}})

    def helper_mesh(name: str, groups: list[str], material: int):
        keep_h = [gn in groups for gn in obj.face_group]
        ht, htu = triangulate(obj.faces, obj.face_uvs, keep_h)
        o2, u2, ti = split_by_uv(ht, htu)
        nrm = face_normals_acc(Pw, ht)
        jj = np.zeros((len(o2), 4), dtype=np.uint8)
        ww = np.zeros((len(o2), 4), dtype=np.float32)
        jj[:, 0] = bidx["Head"]
        ww[:, 0] = 1
        add_mesh(name, Pw[o2], nrm[o2], uv_all[u2], jj, ww, o2, ti, material, "base")
        helper_verts.update(int(v) for v in np.unique(ht))
        log(f"  {name}: {len(ti)} triangles")

    helper_verts: set[int] = set()
    helper_mesh("Teeth", ["helper-upper-teeth", "helper-lower-teeth"], mat_teeth)
    helper_mesh("Tongue", ["helper-tongue"], mat_tongue)

    layer("Shorts", short_sel, 0.005)
    layer("Top", top_sel, 0.005)

    # ---- proxies: eyes, brows, lashes, fitted to the body so they follow every morph
    proxies: dict[str, dict] = {}

    def load_proxy(folder: str, stem: str):
        mc = mh.load_mhclo(os.path.join(A, folder, f"{stem}.mhclo"))
        ob = mh.load_obj(os.path.join(A, folder, mc.obj_file))
        return mc, ob

    def proxy_mesh(name: str, mc: mh.Mhclo, ob: mh.Obj, sel_verts: np.ndarray | None, bone_name: str | None, material: int, space: str, head_bone="Head"):
        pp = mh.proxy_positions(mc, P0)
        pw = (pp - g0) * SC
        ptris, ptuv = triangulate(ob.faces, ob.face_uvs)
        if sel_verts is not None:
            m = np.isin(ptris, sel_verts).all(axis=1)
            ptris, ptuv = ptris[m], ptuv[m]
        # a mirrored shell can arrive inside out (negative enclosed volume); turn it back so it is not culled and lights correctly
        if len(ptris) and bone_name in ("eye_l", "eye_r"):
            a_, b_, c_ = pw[ptris[:, 0]], pw[ptris[:, 1]], pw[ptris[:, 2]]
            vol = float((np.einsum("ij,ij->i", a_, np.cross(b_, c_)) / 6).sum())
            if vol < 0:
                ptris = ptris[:, ::-1].copy()
                ptuv = ptuv[:, ::-1].copy()
                log(f"  {name}: flipped winding")
        o2, u2, ti = split_by_uv(ptris, ptuv)
        n_ = face_normals_acc(pw, ptris)
        uvp = ob.uvs.copy()
        uvp[:, 1] = 1 - uvp[:, 1]
        jj = np.zeros((len(o2), 4), dtype=np.uint8)
        ww = np.zeros((len(o2), 4), dtype=np.float32)
        jj[:, 0] = bidx[bone_name or head_bone]
        ww[:, 0] = 1
        add_mesh(name, pw[o2], n_[o2], uvp[u2], jj, ww, o2, ti, material, space)
        proxies[space] = {"mhclo": mc, "n": len(ob.verts)}
        return pw

    mc_eye, ob_eye = load_proxy("eyes/high-poly", "high-poly")
    ptris, _ = triangulate(ob_eye.faces, ob_eye.face_uvs)
    comp = components(len(ob_eye.verts), ptris)
    pw_eye = (mh.proxy_positions(mc_eye, P0) - g0) * SC
    # each eye is two shells: the eyeball (iris and white) and a transparent cornea over it, whose texture is a blue dot; keep the eyeball
    used = np.unique(ptris)
    sizes = {r: int((comp[used] == r).sum()) for r in set(comp[used])}
    ball = max(sizes.values())
    balls = [r for r, n in sizes.items() if n == ball]
    sel_l = np.array([v for v in used if comp[v] in balls and pw_eye[v, 0] > 0])
    sel_r = np.array([v for v in used if comp[v] in balls and pw_eye[v, 0] < 0])
    log(f"eyes: {len(sel_l)} + {len(sel_r)} vertices kept")
    proxy_mesh("Eye_L", mc_eye, ob_eye, sel_l, "eye_l", mat_eye, "eyes")
    proxy_mesh("Eye_R", mc_eye, ob_eye, sel_r, "eye_r", mat_eye, "eyes")
    mc_b, ob_b = load_proxy("eyebrows/eyebrow001", "eyebrow001")
    proxy_mesh("Brows", mc_b, ob_b, None, None, mat_brow, "brows")
    mc_l, ob_l = load_proxy("eyelashes/eyelashes01", "eyelashes01")
    proxy_mesh("Lashes", mc_l, ob_l, None, None, mat_lash, "lashes")

    for ni in range(len(g.j["nodes"])):
        pass
    total = g.write(os.path.join(out_dir, "body_mpfb.glb"))
    log(f"body_mpfb.glb: {total / 1024:.0f} KB")

    # ---- the morph pack
    spaces = {"base": n_base, "eyes": len(ob_eye.verts), "brows": len(ob_b.verts), "lashes": len(ob_l.verts)}
    pmc = {"eyes": mc_eye, "brows": mc_b, "lashes": mc_l}
    used_base = np.zeros(n_base, dtype=bool)
    used_base[body_verts] = True
    used_base[list(helper_verts)] = True
    blob = bytearray()
    targets_meta = []
    bone_names = list(order)
    for m in morphs:
        d = m["delta"] * SC  # metres
        gd = m["ground"] * SC
        entry = {"id": m["id"], "label": m["label"], "group": m["group"], "blocks": {}}
        for space, n in spaces.items():
            if space == "base":
                dd = d.copy()
            else:
                dd = mh.proxy_deltas(pmc[space], m["delta"]) * SC
            dd = dd - gd
            q = np.round(dd / STEP).astype(np.int32)
            live = np.abs(q).max(axis=1) > 0
            if space == "base":
                live &= used_base  # helper geometry (skirt, joint cubes, ...) is never drawn
            nz = np.nonzero(live)[0]
            if len(nz) == 0:
                continue
            q = np.clip(q[nz], -32768, 32767).astype(np.int16)
            while len(blob) % 4:
                blob.append(0)
            entry["blocks"][space] = {"offset": len(blob), "count": int(len(nz))}
            # planar layout: index gaps, then all x, all y, all z (compresses about three times better than interleaved)
            blob += np.diff(nz, prepend=0).astype(np.uint16).tobytes()
            while len(blob) % 4:
                blob.append(0)
            blob += q[:, 0].tobytes() + q[:, 1].tobytes() + q[:, 2].tobytes()
        jd = m["joint"]
        mv = np.abs(jd).max(axis=1)
        sparse = {bone_names[i]: [round(float(x), 5) for x in jd[i]] for i in range(len(order)) if mv[i] > 2e-5}
        if sparse:
            entry["bones"] = sparse
        targets_meta.append(entry)
    import gzip

    with open(os.path.join(out_dir, "body_mpfb.morphs.pack"), "wb") as f:
        f.write(gzip.compress(bytes(blob), 9, mtime=0))
    for old in ("body_mpfb.morphs.bin", "body_mpfb.morphs.bin.gz"):
        if os.path.exists(os.path.join(out_dir, old)):
            os.remove(os.path.join(out_dir, old))
    meta = {
        "version": 1,
        "step": STEP,
        "spaces": spaces,
        "bones": bone_names,
        "restBones": {b: [round(float(x), 5) for x in jw[i]] for i, b in enumerate(order)},
        "sliders": sliders,
        "macros": [k for k in shapes.MACROS if k not in ("masculine", "feminine")],
        "targets": targets_meta,
        "meshes": mesh_space,
        "credits": "Base mesh, targets, rig and weights: MPFB2 / MakeHuman (CC0 assets). Skins, eyes, eyebrows, eyelashes: MakeHuman system assets (CC0).",
    }
    with open(os.path.join(out_dir, "body_mpfb.morphs.json"), "w") as f:
        json.dump(meta, f, separators=(",", ":"))
    log(f"morphs.pack: {os.path.getsize(os.path.join(out_dir, 'body_mpfb.morphs.pack')) / 1024:.0f} KB (raw {len(blob) / 1024:.0f} KB), morphs.json: {os.path.getsize(os.path.join(out_dir, 'body_mpfb.morphs.json')) / 1024:.0f} KB")
    # the slider list as code, so the creator does not have to download the whole morph list to draw its sliders
    ts = os.path.join(out_dir, "..", "..", "..", "src", "lab", "bodySliders.ts")
    if os.path.isdir(os.path.dirname(ts)):
        rows = ",\n".join(f'  {{ id: "{x["id"]}", label: "{x["label"]}", group: "{x["group"]}", oneWay: {"true" if not x["dec"] else "false"} }}' for x in sliders)
        with open(ts, "w") as f:
            f.write("// Generated by tools/character/build_body.py from the body morph list. Do not edit by hand.\n\n")
            f.write("export interface BodySlider {\n  id: string;\n  label: string;\n  group: string;\n  /** Only goes one way (0 to 1), such as a head shape. */\n  oneWay: boolean;\n}\n\n")
            f.write(f"export const BODY_SLIDERS: BodySlider[] = [\n{rows},\n];\n")
    log(f"done in {time.time() - t0:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
