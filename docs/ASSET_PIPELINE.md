# Asset Pipeline

How 3D assets get from a third-party download to the game. Status: **Asset Lab v0** (Oct 2026).

## Sources and licences

Every third-party asset is CC0 (public domain). Credit is not required but is shown in the Lab and kept in `manifest.json`.

| Pack | Author | Licence | What we use |
|------|--------|---------|-------------|
| [Universal Base Characters (Standard)](https://quaternius.com/packs/universalbasecharacters.html) | Quaternius | CC0 1.0 | 2 rigged bodies (male/female), 5 hairstyles, beard, 2 eyebrow sets, skin + eye textures |
| [Universal Animation Library (Standard)](https://quaternius.com/packs/universalanimationlibrary.html) | Quaternius | CC0 1.0 | 43 animation clips on the same skeleton |
| [Modular Character Outfits - Fantasy (Standard)](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html) | Quaternius | CC0 1.0 | 2 outfits (Peasant, Ranger) × male/female: top, sleeves, bottom, shoes, hood, shoulder guards; shared textures |
| [Furniture Kit 2.0](https://kenney.nl/assets/furniture-kit) | Kenney | CC0 1.0 | 52 furniture/structure pieces |
| [Car Kit](https://kenney.nl/assets/car-kit) | Kenney | CC0 1.0 | 12 vehicles |
| [Poly Haven models](https://polyhaven.com/models) | Poly Haven contributors | CC0 1.0 | 60 realistic photoscanned furniture and props (sofas, chairs, tables, shelves, lamps, TV, radio, stove, fan...) |

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

## Realistic furniture (Poly Haven + code)

The cartoon Kenney furniture did not match the realistic characters, so the home is furnished with **60 photoscanned CC0 models from Poly Haven** plus **14 pieces built in code** where nothing suitable is free (fridge, toilet, basin, shower cabin, double bed with mattress and pillows, wardrobe, flat-screen TV, washing machine, kitchen units, floor lamp, rug, doormat).

- **Fetch:** `tools/assets/fetch_polyhaven.py` downloads the glTF + textures through the public Poly Haven API (the list is `REALISTIC` in `sources.mjs`). The Kenney furniture stays in the Lab (category "furniture") but is no longer used in the game.
- **Build:** meshopt-compressed, textures to WebP at 1024 px (colour, normal, roughness/metal packed), budget 7,000 triangles and 700 KB per piece (two heavier models were dropped). All 60 models, ~13 MB.
- **Fronts and size:** every model is normalised so its front faces +z, origin at the centre of its footprint on the floor, real-world size (the manifest records `sizeMetres`; a test fails if anything is absurdly big or small).
- **Procedural pieces** live in `apps/client/src/furniture/procedural.ts` with shared materials (`materials.ts`: enamel, steel, ceramic, glass, wood, fabric, Ankara print, granite...). They can have moving parts (the fridge door, the shower water).
- **Catalog:** `packages/game-core/src/catalog.ts` lists all 77 sellable pieces with a name, category, price in naira and the action they enable. The shop (later) sells from this list; today the showroom and the test house place them directly. A test checks every catalog item has a model and every model is sold.

### How furniture is used (no hand-tuned poses)

`apps/client/src/play/interactions.ts` works out how to use each placed piece from its **measured shape**:

- **Sitting:** a ray is cast down onto the seat to find its real height. The character's origin goes `0.331 m` in front of the seat centre and `seat height − 0.452 m` up (the two numbers are the hips' position in the library's `Sitting_Idle_Loop`), then plays the real `Sitting_Enter` clip; standing up plays `Sitting_Exit`. Sofas get one seat per cushion (`meta.slots`) and a tap picks the nearest.
- **Lying:** the pose is lowered onto the mattress using the lowest point of the posed sleeping body, measured from the skeleton at runtime.
- **Standing:** the character stands 55 cm in front of the piece (fridge, stove, basin, radio, bookshelf), facing it; the shower is stepped into.
- **Approach:** the nearest free, reachable spot in front of or beside it.

### Furniture animation

Moving parts react to the character using them: fridge door opens, oven door swings, ceiling fans spin (faster when used), shower water runs, TV glows (while someone watches from the sofa), radio pulses, lamps light up at night. Defined in `furniture/instance.ts` (models) and `furniture/procedural.ts` (built pieces).

### The showroom (`#/showroom`)

Every catalog piece on display with its price. **Run all tests** walks the character to each piece, uses it, and checks the right activity and animation started; ✓/✗ appear in the list. **Use** tries one piece, tap a name to look at it, Day/Night shows the lamps. Rules (needs, money) are switched off there.

## Clothing

- Parts come from the Quaternius outfits pack (same skeleton as the base characters) and are attached exactly like hair: re-bound to the body skeleton by bone name.
- **No poke-through:** when a garment is worn, the body triangles it covers (chosen by dominant bone: torso, hips/legs, feet, upper arms) are removed from the skin mesh at runtime.
- **Textures are shipped once per outfit**, not per part. Parts are exported without textures and the shared set is applied at runtime (base colour, normal, ORM).
- **Any colour:** each outfit also has a neutral (greyscale, brightened) base texture; Top / Bottom / Shoes can be tinted with 13 colours while keeping stitching and folds. Sleeves, hood and shoulder guards follow the top colour.
- The pack's bare-skin pieces (hands/forearms in a different skin texture) are dropped at build time; our own body shows there.
- Per-piece triangle budget is 10,000 (long sleeves and boots are detailed). A full outfit is ~15–20k triangles on top of a ~15k body, so crowds will need a lower-detail path (Stage 3).

## Procedural hair and clothing (made in code)

The free packs have no African hairstyles and no modern clothing, so these are generated at runtime from the body itself (`apps/client/src/lab/procedural/`). No download, no licence, a few KB of code.

- **Hair** (`hair.ts`): Low fade, Afro, Afro puffs, Cornrows, Box braids, Locs, Top bun, Head wrap. The cranium is measured from the body's own head vertices, so styles fit both bodies; hair is attached rigidly to the Head bone. Tinted by hair colour (the wrap takes any colour).
- **Garments** (`garments.ts`, `geometryClip.ts`): T-shirt, Tank top, Long sleeve, Kaftan, Shorts, Trousers, Sneakers. Each is cut out of the body mesh with clean straight plane cuts (hems, sleeve ends, round neckline), pushed outward a few mm, and shares the body's skeleton and skin weights, so it deforms and animates with the body.
- **Fabrics** (`fabrics.ts`): Plain, Stripes, Ankara print, Denim: tileable greyscale patterns tinted by the garment colour.
- Per-garment colour and fabric are independent for top and bottom.

Limits: garments are body-hugging plus a few mm (kaftan is looser but follows the legs, so it reads as a short dress); no skirts or long flowing garments (need cloth simulation or a skinned mesh made by an artist); braids/locs are rigid on the head, so they don't swing and may touch the shoulders; sneakers are a simple shell without a separate sole.

## Animation

- **Library clips (43, CC0):** idle, walk, jog, sprint, crouch, sit (enter/idle/talk/exit), talk, interact, pick up, fix (kneeling), push, drive, dance, jump, swim, combat, spell casting, death.
- **Everyday-life clips (made in code, `procedural/lifeClips.ts`):** `Life_Sleep_Loop` (lying on the back, legs straight, breathing), `Life_Eat_Loop` (seated), `Life_Eat_Standing_Loop`, `Life_Drink_Loop`, `Life_Type_Loop` (hands at a keyboard, alternating taps), `Life_Phone_Loop`, `Life_Wave_Loop`, `Life_Cook_Loop` (stirring).
- **How they're built:** start from an Idle or Sitting clip (keeps breathing and sway), then add or replace motion on a few joints. Joint axes differ between rigs, so each bend is chosen by posing the real skeleton and testing which local axis moves the hand toward a goal direction (forward, up). Works on both bodies.
- **Polish list:** the phone clip holds the hand near the chin rather than the ear; the wave is a raised-arm greeting without a convincing hand wobble; no hands/fingers poses; no facial expressions; no lying-down transitions (get in/out of bed); sit-down/stand-up now use the library's `Sitting_Enter`/`Sitting_Exit` on every chair, sofa and toilet (see "How furniture is used"); no get-in/out-of-bed transitions.

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
- **Free pack limits:** the Standard (free) base characters only include the two "Superhero" proportions and 5 hairstyles. No afro, braids, locs or wraps. The free outfits are only Peasant and Ranger.
- **sharp ignores call order:** libvips applies operations in its own fixed order, so a `normalise` after a `linear` undid the brightening. Use one explicit `linear` and verify the result with `sharp(...).stats()`.
- **The outfit atlas is dark (mean ~56/255)** and relies on scene lighting, so the neutral texture needs a ~3.3× lift for tints to read true.

## Known gaps / next assets

- **Modern / Nigerian clothing** — the free outfits are medieval-fantasy (tunic, trousers, boots). Colours help (a tunic reads as a casual shirt), but we still need T-shirts, shorts, dresses, skirts, agbada/kaftan, ankara prints, head wraps, trainers and sandals.
- **African hairstyles** (afro, braids, locs, twists, fades, head wraps).
- **Face variety** — one face shape per body today; add bone/shape variation.
- **Style match** — Kenney props/cars are cartoon low-poly while characters are semi-realistic. Decide on one direction (restyle props with a shared palette/material pass, or source a more realistic kit) before building the map.
- **Interiors/exteriors** for the map (Stage 3) — building kit for Nigerian architecture.
