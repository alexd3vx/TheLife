"""A very small glTF 2.0 binary writer: meshes, skins, nodes, materials and embedded images. No dependencies beyond numpy."""
from __future__ import annotations

import json
import struct

import numpy as np

ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963
F32, U16, U32, U8 = 5126, 5123, 5125, 5121


class Glb:
    def __init__(self) -> None:
        self.bin = bytearray()
        self.j: dict = {"asset": {"version": "2.0", "generator": "TheLife tools/character/build_body.py"}, "scene": 0, "scenes": [{"nodes": []}], "nodes": [], "buffers": [{}], "bufferViews": [], "accessors": [], "meshes": [], "skins": [], "materials": [], "images": [], "textures": [], "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]}

    def _view(self, data: bytes, target: int | None = None) -> int:
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin += data
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            v["target"] = target
        self.j["bufferViews"].append(v)
        return len(self.j["bufferViews"]) - 1

    def accessor(self, arr: np.ndarray, kind: str, target: int | None = None, minmax: bool = False, normalized: bool = False) -> int:
        ctype = {np.dtype("float32"): F32, np.dtype("uint16"): U16, np.dtype("uint32"): U32, np.dtype("uint8"): U8}[arr.dtype]
        count = arr.shape[0]
        a = {"bufferView": self._view(np.ascontiguousarray(arr).tobytes(), target), "componentType": ctype, "count": count, "type": kind}
        if normalized:
            a["normalized"] = True
        if minmax:
            a["min"] = [float(x) for x in np.atleast_1d(arr.min(axis=0))]
            a["max"] = [float(x) for x in np.atleast_1d(arr.max(axis=0))]
        self.j["accessors"].append(a)
        return len(self.j["accessors"]) - 1

    def image(self, data: bytes, mime: str, name: str) -> int:
        self.j["images"].append({"bufferView": self._view(data), "mimeType": mime, "name": name})
        self.j["textures"].append({"source": len(self.j["images"]) - 1, "sampler": 0})
        return len(self.j["textures"]) - 1

    def material(self, m: dict) -> int:
        self.j["materials"].append(m)
        return len(self.j["materials"]) - 1

    def node(self, n: dict, root: bool = False) -> int:
        self.j["nodes"].append(n)
        i = len(self.j["nodes"]) - 1
        if root:
            self.j["scenes"][0]["nodes"].append(i)
        return i

    def mesh(self, name: str, prim: dict, extras: dict | None = None) -> int:
        m = {"name": name, "primitives": [prim]}
        if extras:
            m["extras"] = extras
        self.j["meshes"].append(m)
        return len(self.j["meshes"]) - 1

    def write(self, path: str) -> int:
        self.j["buffers"][0] = {"byteLength": len(self.bin)}
        js = json.dumps(self.j, separators=(",", ":")).encode()
        js += b" " * ((4 - len(js) % 4) % 4)
        bn = bytes(self.bin) + b"\0" * ((4 - len(self.bin) % 4) % 4)
        total = 12 + 8 + len(js) + 8 + len(bn)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, total))
            f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
            f.write(struct.pack("<II", len(bn), 0x004E4942) + bn)
        return total
