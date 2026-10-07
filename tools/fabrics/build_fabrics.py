#!/usr/bin/env python3
"""Real cloth for the characters' clothes: Poly Haven fabric scans (CC0), made small and tintable.

Downloads the 1k diffuse, normal and roughness pictures of each fabric, shrinks them to 512 px (roughness 256 px, grey), and makes the diffuse
neutral so the garment's colour can be put on it: each picture is divided by its own average colour and scaled to 0.9 (so detail stays
under 1), the way the skin pictures are. Fabrics whose colour *is* the pattern (denim, gingham, brocade) are made grey first, so the
pattern stays but the colour is the wearer's. Writes apps/client/public/assets/fabrics/<id>_{d,n,r}.webp.

Usage: python3 build_fabrics.py   (needs Pillow and numpy)
"""
import io, json, os, sys, urllib.request
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "client", "public", "assets", "fabrics")
UA = {"User-Agent": "Mozilla/5.0"}
# our id -> (Poly Haven id, make grey first)
FABRICS = {
    "cotton": ("cotton_jersey", False),
    "poplin": ("stretch_poplin", False),
    "linen": ("rough_linen", False),
    "denim": ("denim_fabric_04", False),
    "knit": ("jersey_melange", False),
    "fleece": ("jogging_melange", False),
    "wool": ("wool_boucle", False),
    "satin": ("crepe_satin", False),
    "suiting": ("terlenka", False),
    "towel": ("terry_cloth", False),
    "pique": ("waffle_pique_cotton", False),
    "brocade": ("floral_jacquard", True),
    "check": ("gingham_check", True),
}


def get(url: str) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for ours, (ph, grey) in FABRICS.items():
        files = json.loads(get(f"https://api.polyhaven.com/files/{ph}"))
        pic = lambda key: Image.open(io.BytesIO(get(files[key]["1k"]["jpg"]["url"])))
        d = np.asarray(pic("Diffuse").convert("RGB").resize((512, 512), Image.LANCZOS), dtype=np.float64) / 255.0
        if grey:
            d = np.repeat(d.mean(axis=2, keepdims=True), 3, axis=2)
        d = d / d.reshape(-1, 3).mean(axis=0) * 0.9
        Image.fromarray((np.clip(d, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, f"{ours}_d.webp"), quality=86)
        pic("nor_gl").convert("RGB").resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, f"{ours}_n.webp"), quality=86)
        pic("Rough").convert("L").resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, f"{ours}_r.webp"), quality=80)
        print("ok", ours, ph)


if __name__ == "__main__":
    sys.exit(main())
