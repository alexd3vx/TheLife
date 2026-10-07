# Character builder

Builds the morphable body (`apps/client/public/assets/characters/body_mpfb.*`) from the MakeHuman / MPFB2 data. Everything it reads is CC0; the MPFB2 add-on's code (GPLv3) is not used. Blender is not needed.

## Get the data (once)

```
git clone --depth 1 https://github.com/makehumancommunity/mpfb2.git /tmp/mpfb2          # base mesh, targets, rigs, weights
curl -L -o /tmp/mh/assets.zip https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
unzip -q /tmp/mh/assets.zip 'eyes/*' 'eyebrows/eyebrow001/*' 'eyelashes/eyelashes01/*' 'skins/young_african_*/*' -d /tmp/mh/x
python3 -m venv /tmp/bv && /tmp/bv/bin/pip install numpy pillow
```

Paths can be changed with `MPFB_DATA` (default `/tmp/mpfb2/src/mpfb/data`) and `MH_ASSETS` (default `/tmp/mh/x`).

## Build

```
/tmp/bv/bin/python tools/character/build_body.py
```

Writes `body_mpfb.glb` (rest body, skeleton, skin weights, eyes, brows, lashes, a modest base layer), `body_mpfb.morphs.pack` (every morph as gzipped sparse int16 deltas) and `body_mpfb.morphs.json` (slider list, where each morph lives in the pack, how each morph moves the bones). It takes about five seconds.

## Files

- `mh.py`: readers for MakeHuman files (`.obj`, `.target`, `.mhclo` proxy fitting).
- `shapes.py`: the macro stack (sex, age, muscle, weight, height, proportions, race, bust) and the list of detail sliders. Add a slider by adding a line to `DETAILS`.
- `glb.py`: a small glTF writer.
- `build_body.py`: the build.

## How a person is made at run time

`apps/client/src/lab/bodyMorph.ts`: a `BodyShape` (sex, age, build, height, sliders) becomes a weight per morph (`shapeWeights`), and `MorphBody.apply` adds up the few deltas it needs on the CPU, fixes the normals, moves the bones and bone inverses to fit. After that the person is an ordinary skinned mesh. Test page: `#/body`.

## Why morphs are not glTF morph targets

About 170 morphs exist. glTF morph targets live on the GPU for every mesh instance, so a street full of people would each carry all of them. Adding up only the morphs a look needs, once, keeps a person a plain skinned mesh. The pack is stored gzipped under a non-`.gz` extension (`.pack`) because dev and production servers add `Content-Encoding` to `.gz` files, and a plain binary would not be compressed by the host.
