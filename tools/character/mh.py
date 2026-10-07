"""Readers for the MakeHuman / MPFB2 data files the body builder needs (all CC0 assets; the MPFB2 add-on code is not used).

MakeHuman units are decimetres with y up and the figure facing +z; we scale to metres at the end and keep the same axes, which is
what three.js expects (a figure facing +z, its left side at +x).
"""
from __future__ import annotations

import gzip
import json
import os
from dataclasses import dataclass, field

import numpy as np


def _open(path: str):
    if path.endswith(".gz"):
        return gzip.open(path, "rt")
    return open(path, "r")


@dataclass
class Obj:
    verts: np.ndarray  # (n, 3)
    uvs: np.ndarray  # (m, 2)
    faces: list[list[int]] = field(default_factory=list)  # vertex indices per polygon
    face_uvs: list[list[int]] = field(default_factory=list)
    face_group: list[str] = field(default_factory=list)
    groups: dict[str, list[int]] = field(default_factory=dict)  # group name -> sorted vertex indices


def load_obj(path: str) -> Obj:
    v: list[list[float]] = []
    vt: list[list[float]] = []
    faces: list[list[int]] = []
    fuvs: list[list[int]] = []
    fgroup: list[str] = []
    cur = "default"
    with open(path) as f:
        for line in f:
            if line.startswith("v "):
                v.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("vt "):
                vt.append([float(x) for x in line.split()[1:3]])
            elif line.startswith("g ") or line.startswith("o "):
                cur = line.split()[1]
            elif line.startswith("f "):
                idx, uv = [], []
                for tok in line.split()[1:]:
                    p = tok.split("/")
                    idx.append(int(p[0]) - 1)
                    uv.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
                faces.append(idx)
                fuvs.append(uv)
                fgroup.append(cur)
    groups: dict[str, set[int]] = {}
    for fi, g in zip(faces, fgroup):
        groups.setdefault(g, set()).update(fi)
    return Obj(np.array(v, dtype=np.float64), np.array(vt, dtype=np.float64).reshape(-1, 2), faces, fuvs, fgroup, {k: sorted(s) for k, s in groups.items()})


def load_target(path: str) -> tuple[np.ndarray, np.ndarray]:
    """A MakeHuman target: sparse (vertex index, dx dy dz) lines."""
    idx: list[int] = []
    d: list[list[float]] = []
    with _open(path) as f:
        for line in f:
            if not line.strip() or line.startswith("#"):
                continue
            p = line.split()
            if len(p) < 4:
                continue
            idx.append(int(p[0]))
            d.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, dtype=np.int64), np.array(d, dtype=np.float64).reshape(-1, 3)


@dataclass
class Mhclo:
    """A proxy fitted to the base mesh: each vertex is a weighted triple of base vertices plus an offset in the base's own scale."""

    obj_file: str
    rows: list[tuple[list[int], list[float], list[float]]]
    scale: dict[str, tuple[int, int, float]]


def load_mhclo(path: str) -> Mhclo:
    obj_file = ""
    rows: list[tuple[list[int], list[float], list[float]]] = []
    scale: dict[str, tuple[int, int, float]] = {}
    in_verts = False
    with open(path) as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            p = s.split()
            if in_verts:
                if len(p) == 1:
                    rows.append(([int(p[0])], [1.0], [0.0, 0.0, 0.0]))
                elif len(p) >= 9:
                    rows.append(([int(p[0]), int(p[1]), int(p[2])], [float(p[3]), float(p[4]), float(p[5])], [float(p[6]), float(p[7]), float(p[8])]))
                continue
            if p[0] == "obj_file":
                obj_file = p[1]
            elif p[0] in ("x_scale", "y_scale", "z_scale"):
                scale[p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
            elif p[0] == "verts":
                in_verts = True
    return Mhclo(obj_file, rows, scale)


def fit_matrix(mhclo: Mhclo, n_base: int):
    """Linear map from base vertices to proxy vertices: returns (idx (m,3), w (m,3)) and per-axis offset data, so a base *delta* can be
    carried to the proxy as sum(w * delta[idx]) (the offsets are scaled by base proportions, which we leave at the rest value)."""
    m = len(mhclo.rows)
    idx = np.zeros((m, 3), dtype=np.int64)
    w = np.zeros((m, 3))
    off = np.zeros((m, 3))
    for i, (ix, wt, o) in enumerate(mhclo.rows):
        for k in range(3):
            idx[i, k] = ix[k] if k < len(ix) else ix[0]
            w[i, k] = wt[k] if k < len(wt) else 0.0
        off[i] = o
    return idx, w, off


def proxy_positions(mhclo: Mhclo, base: np.ndarray) -> np.ndarray:
    """Where the proxy's vertices sit on a given base mesh."""
    idx, w, off = fit_matrix(mhclo, len(base))
    pos = (base[idx] * w[:, :, None]).sum(axis=1)
    sc = np.ones(3)
    for axis, ax in zip("xyz", range(3)):
        if axis in mhclo.scale:
            a, b, ref = mhclo.scale[axis]
            sc[ax] = abs(base[a, ax] - base[b, ax]) / ref if ref else 1.0
    return pos + off * sc


def proxy_deltas(mhclo: Mhclo, base_delta: np.ndarray) -> np.ndarray:
    idx, w, _ = fit_matrix(mhclo, len(base_delta))
    return (base_delta[idx] * w[:, :, None]).sum(axis=1)


def data_dir() -> str:
    return os.environ.get("MPFB_DATA", "/tmp/mpfb2/src/mpfb/data")


def assets_dir() -> str:
    return os.environ.get("MH_ASSETS", "/tmp/mh/x")


def target_path(rel: str) -> str:
    """rel like 'head/head-oval' -> the target file, gz or not."""
    base = os.path.join(data_dir(), "targets", rel)
    for ext in (".target.gz", ".target"):
        if os.path.exists(base + ext):
            return base + ext
    raise FileNotFoundError(base)


def macro_config() -> dict:
    with open(os.path.join(data_dir(), "targets", "macrodetails", "macro.json")) as f:
        return json.load(f)["macrotargets"]
