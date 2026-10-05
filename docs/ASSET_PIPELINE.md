# Asset Pipeline

How 3D assets get from a third-party download to the game. Status: **Asset Lab v0** (Oct 2026).

## Sources and licences

Every third-party asset is CC0 (public domain). Credit is not required but is shown in the Lab and kept in `manifest.json`.

| Pack | Author | Licence | What we use |
|------|--------|---------|-------------|
| [Universal Base Characters (Standard)](https://quaternius.com/packs/universalbasecharacters.html) | Quaternius | CC0 1.0 | 2 rigged bodies (male/female), 5 hairstyles, beard, 2 eyebrow sets, skin + eye textures |
| [Universal Animation Library (Standard)](https://quaternius.com/packs/universalanimationlibrary.html) | Quaternius | CC0 1.0 | 43 animation clips on the same skeleton |
| [Furniture Kit 2.0](https://kenney.nl/assets/furniture-kit) | Kenney | CC0 1.0 | 52 furniture/structure pieces |
| [Car Kit](https://kenney.nl/assets/car-kit) | Kenney | CC0 1.0 | 12 vehicles |

Rule: nothing goes in without its licence recorded in `tools/assets/sources.mjs` (`CREDITS`).

## Pipeline

```
tools/assets/fetch-all.sh      download + unzip packs into assets-src/   (not committed, ~330 MB)
tools/assets/sources.mjs       what we take from each pack, labels, groups, budgets
tools/assets/build-assets.mjs  optimise -> apps/client/public/assets/ + manifest.json   (committed, ~5 MB)
apps/client/src/lab/           the Asset Lab (open  #/lab )
```

Run:

```bash
bash tools/assets/fetch-all.sh
pnpm --filter @thelife/asset-tools build     # fails (exit 1) if any asset is over budget
pnpm dev                                     # then open http://localhost:5173/#/lab
```

What the build does to each model: dedupe/prune, textures → WebP (1024 px for people, 512 px for props), meshopt compression, and (for people/hair) **no position quantization** — see "Gotchas".

## Budgets (enforced by the build)

| Type | Max triangles | Max size |
|------|---------------|----------|
| character | 20,000 | 1.8 MB |
| hair | 6,000 | 0.9 MB |
| furniture | 4,000 | 120 KB |
| vehicle | 8,000 | 250 KB |
| animation set | — | 6 MB |

Current library: 78 assets, ~5.3 MB total, all within budget.

## Character system

One shared 65-bone skeleton. A person is assembled from parts that are all bound to the body's skeleton **by bone name** at runtime (`apps/client/src/lab/avatar.ts`):

- Body (male/female) with built-in eyes and eyebrows
- Hair, facial hair, replacement eyebrows (separate meshes re-bound to the body skeleton)
- Skin tone: dark map as shipped, or the light map multiplied by a tint (7 tones)
- Hair and eye colour: tint multiplied on the texture
- Any animation clip from the library plays on any combination

## Add a new asset

1. Put the source in `assets-src/` (or add a fetch line to `fetch-all.sh`).
2. Add an entry in `tools/assets/sources.mjs` (id, label, group) and its credit if it's a new pack.
3. `pnpm --filter @thelife/asset-tools build` and check it in the Lab → Pipeline tab.

## Gotchas learned

- **Skinned meshes + quantization:** glTF-Transform's quantization hides its decompression scale in the skeleton's inverse-bind matrices. Re-binding hair to the body's skeleton lost that, making hair giant. People/hair are therefore compressed without quantization.
- **Missing textures in the pack:** the Quaternius glTF files reference `T_Hair_1_Normal_png.png` / `T_Eye_Normal_png.png`, which the pack doesn't ship. The build aliases them.
- **Free pack limits:** the Standard (free) base characters only include the two "Superhero" proportions and 5 hairstyles. No afro, braids, locs or wraps, and no clothes — those are the next assets to create (see below).

## Known gaps / next assets

- **Clothing** (tops, bottoms, dresses, shoes, Nigerian fashion) — none in the free pack.
- **African hairstyles** (afro, braids, locs, twists, fades, head wraps).
- **Face variety** — one face shape per body today; add bone/shape variation.
- **Style match** — Kenney props/cars are cartoon low-poly while characters are semi-realistic. Decide on one direction (restyle props with a shared palette/material pass, or source a more realistic kit) before building the map.
- **Interiors/exteriors** for the map (Stage 3) — building kit for Nigerian architecture.
