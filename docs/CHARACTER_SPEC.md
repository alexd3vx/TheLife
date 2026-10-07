# Character spec: one person, fully customisable, the same everywhere

Draft 1, 7 Oct 2026. Written with the owner's decisions from `NEXT_STEPS.md` (Q21 "both, step by step", Q57 phone looks, Q67 clothes states, Q55 identity, Q74 verification) and `MASTER_PLAN.md` (realistic character, hair cards, clothing layers). Nothing in this file is built yet; it is the plan to approve before any art or code.

## 1. What "done" looks like

1. **One character.** The person you build in the creator is the same body, face, hair and clothes in the home, the street, every building, the profile, the arrival film, vehicles and the phone camera. One function builds it from one saved description (`Look`), and every screen calls that function.
2. **Fully customisable**, in the sense of the list in section 3: body and face by sliders, skin, hair (styles, length, colour, hairline), facial hair, make-up, eyes, clothes in layers with colours and patterns, accessories, and cultural dress (gele, agbada, buba and iro, kaftan, hijab, fila, ankara and adire prints).
3. **Looks real enough on a mid-range Android phone** at 30 FPS: semi-realistic people (not cartoon, not film-quality), believable hair and cloth, faces that can blink, talk and show mood.
4. **Moves well.** One animation set on one skeleton, picked by one state machine, so cooking looks like cooking and a bath looks like a bath, at home and outside.
5. **Cheap to store and send.** A look is a few hundred bytes of JSON; the server stores it with the life; other players and NPCs are rebuilt from it.

## 2. Where we are today (audit)

- **Bodies:** 2 realistic meshes (male, female) from the Blender Foundation's CC0 Human Base Meshes, about 23k triangles each, rigged to a 65-bone skeleton (copied weights, fingers folded into the hands, so **fingers do not animate**). Plus 2 stylised Quaternius bodies. Body shape is only scaled (height 0.92 to 1.08, build 0.88 to 1.2); there are **no morph targets**, so no face or proportion sliders.
- **Skin:** 12 tones, a colour tint plus a procedural pore texture. No undertones, freckles, scars, marks.
- **Hair:** 8 Quaternius hair meshes (3 render bald-topped and are hidden) plus procedural styles (fade, box braids, locs, head wrap...). Hair is coloured but has no hair-card textures, no shine model, no length control, no hairline or edges. This is the weakest part.
- **Clothes:** procedural modern clothes (tee, trousers, sneakers...) plus 20 low-poly fantasy pieces that do not fit the realistic bodies. Colours and four fabrics (plain, stripes, ankara, denim). No layers, no dirt, no towel or nightwear states, no cultural garments.
- **Animation:** 43 clips from the Universal Animation Library, KayKit packs and Mixamo files, retargeted at load (`lab/retarget.ts`), with procedural fall-backs. Mixed sources mean the home and the street do not always agree.
- **Rendering:** the 3D avatar is used in the home, street and interiors; the creator preview, profile preview and some films still use a **flat baked sprite** (`iso/StudioStage.tsx`, `arrival/filmCanvas.ts`). That is why the player "looks different" in places.
- **Look data (`lab/looks.ts`):** about 25 fields (body, skin, hair, beard, brows, eyes, 3 garments, 3 colours, 2 fabrics, accessory, height, build). Saved on the device and with the life; the street used to read the device copy (fixed 7 Oct).

## 3. The customisation model (Look v2)

All values are small numbers or ids, so a look is under 1 KB. Sliders run 0 to 1 unless stated; 0.5 is the base mesh.

**Body**
- Base: female, male, or a blend (a single "masculine to feminine" slider), so players are not locked to two meshes.
- Age (18 to 70): changes face and skin detail, hair greying.
- Height (150 to 200 cm), build (slim to heavy), muscle, shoulder width, chest or bust, waist, hips, glutes, arm length, leg length, hand size, foot size.
- Posture (relaxed, upright, slouched) used by the idle poses.

**Face (morph targets)**
- Head shape (round, oval, long, square), face width, forehead, cheekbones, cheeks, jaw width, jaw line, chin (size, forward, cleft).
- Nose: bridge height, bridge width, nostril width, tip (up, down, round), length.
- Lips: fullness upper and lower, width, cupid's bow.
- Eyes: size, spacing, tilt, depth, lid shape, eyebag.
- Brows: thickness, arch, spacing, style (from a set of 12).
- Ears: size, angle.
- Teeth: slight overbite, gap, straight.

**Skin**
- Tone: a continuous colour (not 12 steps) with an undertone (warm, neutral, cool).
- Detail: freckles, moles, acne, scars (a few preset places), vitiligo patches, stretch marks, tattoos (preset set, placed from a short list), body hair amount.
- Make-up: lipstick (colour, gloss), eyeshadow, eyeliner, lashes, blush, brow fill, nail colour and length.

**Hair (hair cards, textured)**
- Styles: a library of at least 40, grouped by hair type and culture: afro, low cut, fade, waves, twist-out, finger coils, locs (short, medium, long), box braids (short, long, with beads), cornrows (straight back, patterns), Ghana weaving, knotless braids, bantu knots, bun, ponytail, puff, wigs (straight, curly, bob, long), head wraps (gele in 5 folds, scarf, durag), hijab (3 styles), fila, caps.
- Controls: length, volume, hairline (shape, edges and baby hair), parting, colour (roots to tips), highlights (a second colour), shine, grey amount.
- Facial hair: stubble, moustache, goatee, full beard (5 lengths), sideburns, with the same colour tools.

**Clothes (layers)**
Layers draw in order: skin, underwear or base, socks, bottom, top, dress or one-piece, outerwear, shoes, accessories.
- Garments: at least 60 at launch: tees, shirts, buba, kaftan, agbada, senator, ankara tops and skirts, iro and buba, wrapper, gown, jeans, trousers, shorts, skirts, hoodies, jackets, suits, uniforms (school, police, nurse, football, hospital staff), pyjamas, towel, swimwear, sports kit, sandals, slippers, sneakers, heels, boots, formal shoes.
- Per garment: up to 3 colour zones, a pattern from a library (plain, stripes, check, ankara designs, adire, aso-oke, denim, camouflage, football kit), fit (tight, regular, loose), and a wear state (new, worn, dirty, wet).
- States the game sets, not the player: **towel, underwear and nightwear** for shower, toilet and bed (kept modest: no nudity, underwear is shown as plain shorts and a vest or bra).
- Accessories: glasses (10), hats and caps (10), earrings, necklaces, chains, bracelets, watch, rings, bags (backpack, handbag, tote), headphones, face mask.
- Dress codes (Q67): offices, churches and clubs read the garment tags and react.

**Identity data (not visual)**
Display name, voice pitch (cosmetic, for calls we only ever pass voice through, never analyse it: Q74), pronouns, chosen portrait or uploaded photo (Q73).

## 4. How it is built (technical design)

1. **Single build path.** `buildCharacter(look, quality)` returns one skinned object: body plus merged layers, ready to animate. Home, street, interiors, profile, creator, films, vehicle seats and NPCs all use it. The flat sprite and the 2D canvas films are retired in favour of this (Phase 0).
2. **Base body with shape keys.** Make the new base in Blender with **MPFB2** (open source Blender add-on; its assets are CC0, the add-on code is GPLv3 so the models it outputs are ours) or extend the current Blender Human Base Meshes: author the sliders above as shape keys on one topology, export glTF with the morph targets, and blend them in three.js (`morphTargetInfluences`). **Test first:** MPFB2's glTF export has to keep shape keys as morph targets; community reports say it needs simple PBR materials and the right export flags, so Phase 1 starts by proving this on one body.
3. **Skeleton.** Keep the 65-bone body skeleton (all current clips keep working) and add the **finger bones** (30 more) and a **face rig**: the 52 ARKit-style blendshapes (blink, jaw open, smile, brow raise, viseme shapes for talking and calls). Eyes get their own look-at.
4. **Clothes fit any body.** Each garment is modelled once on the base and carries the same shape keys, built by projecting the body morphs onto the garment (shrink-wrap plus offset, baked in Blender). Garments are rigged to the same skeleton. Cloth motion for long garments (gele ends, agbada, dresses) is baked into a few extra bones, not simulated live (mobile budget).
5. **Hair cards.** Hair is flat card strips with alpha-tested textures, two normal-mapped materials (base and a shine layer with an anisotropic highlight faked in the shader), 2,000 to 4,000 triangles per style, a few extra bones for bounce on long styles. Hairline and edges are separate small cards that blend into the skin.
6. **Skin shader.** Albedo from tone and undertone, a detail normal for pores, a cheap subsurface fake (a warm rim in the light), freckles and marks as small decal textures; no photographic textures, so skin tones stay free to change.
7. **Budgets.** LOD0 (close-up and creator) 25k triangles with a 2048 atlas; LOD1 (normal play) 9k with 1024; LOD2 (crowd, far NPCs) 2k with 256. One draw call per layer, merged into one skinned mesh per character after the look is fixed. Total for a character in play: under 14 draw calls.
8. **Look storage.** `Look` becomes a versioned object (`v: 2`); a migration turns a v1 look into the nearest v2. Server stores it with the life; other players receive it in `PlayerView`; NPCs are generated from a seed.
9. **No uploaded faces.** The creator never reads a camera. The photo-verification badge (Q74) is a separate, human-reviewed flow.

## 5. Animation plan

One skeleton, one library, one state machine.

**Library (clips we need; ours today in brackets)**
- Locomotion: idle (relaxed, tired, happy, nervous, drunk), walk, jog, sprint, turns, stairs, slopes, start and stop steps. (walk, jog exist; stops and turns do not)
- Everyday life: sit (chair, sofa, bench, stool, floor), stand up, sleep (back, side), wake, eat (plate, hand, spoon, drink), cook (stir, chop, fry), wash hands, shower, brush teeth, toilet, laundry, sweep, phone (hold, tap, call at ear, selfie), type (laptop), read, TV watch, radio, pray (church kneel, mosque sujud), dance (8), exercise (push-up, squat, jog on spot), sit-and-talk, wave, point, shrug, laugh, cry, argue, hug, handshake, pay (hand money), carry bag.
- Doors and things: open and close door, lock door (turn key), open fridge, pull a chair, open ATM, queue.
- Vehicles: enter and exit (car, danfo, keke, okada), seated idle and steer, passenger idle, hold on.
- Reactions: sneeze, cough, stumble, hurt, faint, sick idle.
- Careers: football (jog, pass, shoot, tackle, celebrate, keeper dives), musician (sing, guitar, DJ), actor (poses), doctor, teacher at board, police at desk, shopkeeper counter, hawker carry.
- Face: all of the above carry a face track (blink, mouth for talk).

**Rules**
1. Every clip is retargeted once, offline, with a check image per clip, and shipped as a game-ready `animations.glb`, not retargeted at load (faster start, no surprises).
2. The state machine is shared code (`play/controller.ts`): the same walk speed curve, turn rate and clip choice in the home, street and buildings. Home and street no longer differ because they run the same controller.
3. Procedural layers on top: look-at (head and eyes), foot placement on slopes, hand placement on handles, lean into turns. Clothing states (towel, nightwear) are chosen before the clip plays.
4. Missing clip never shows another action (already true; keep).
5. Owner's animation editor (`#/anim`) keeps working: it maps game moves to clips and publishes the map.

**Sourcing animation:** Quaternius UAL1 and UAL2 (CC0), KayKit packs (CC0) and Mixamo (free, Adobe licence allows use in a game) for coverage; gaps (African dances, praying, owambe spray, football) are keyframed by us or recorded with a phone video pose estimator and cleaned by hand. Each clip is logged with its licence.

## 6. Where the assets come from, honestly

| Part | Plan | Licence | Risk |
|---|---|---|---|
| Base body and face shape keys | MPFB2 in Blender, or extend the current CC0 Human Base Meshes; the owner previews 3 to 4 candidates and picks | CC0 assets, GPL add-on (outputs are ours) | Medium: shape-key export must be proven |
| Skin textures | Procedural and CC0 detail maps (ambientCG) | CC0 | Low |
| Hair | We model hair cards in Blender; some CC0 packs for starting shapes; every style tested on an afro-textured head | Ours or CC0 | **High**: the hardest part to make look right |
| Clothes | We model garments in Blender on the base; cultural garments are modelled by hand; patterns drawn or from CC0 | Ours or CC0 | Medium: needs many pieces |
| Animation | UAL, KayKit, Mixamo plus our own | CC0 and Mixamo terms | Medium |
| Face rig | ARKit blendshapes authored on the base | Ours | Medium |

**Rejected on purpose:** Unreal MetaHuman (licence limits use to Unreal), Ready Player Me (cloud dependency, limited hair and body options), paid character packs (cost, redistribution limits, none with the range we want). "GTA online" realism is beyond free tools on a phone; the target is **semi-realistic**, which is what the budgets allow.

I searched on 7 Oct for a free, CC0, realistic, African-featured base with morph targets and braids or locs and found none ready-made: paid options exist but are royalty-free rather than CC0, and none include the hair. So hair and the face morphs are ours to build. Sources: [MPFB2 licence and glTF notes](https://www.cgchannel.com/2025/03/check-out-open-source-blender-character-generation-plugin-mpfb-2), [free base mesh search results](https://www.artstation.com/marketplace/p/2VLLp/free-game-ready-female-character).

## 7. Phases (each ends with screenshots for the owner to approve)

**Phase 0: One character everywhere (1 to 2 days of work).** One `buildCharacter` path used by home, street, interiors, profile and creator; the profile and creator previews become the live 3D character; the arrival film uses the live character (the 2D canvas film is replaced); one controller feeds all animation. Exit: the same person, same animation, in six places, side by side.

**Phase 1: Morphable base, proved.** Make or convert one body with about 20 shape keys (height, build, shoulders, hips, face width, jaw, nose, lips, eyes) and prove: Blender to glTF to the browser, sliders in a test page, correct skinning, under budget. Exit: a slider page with the owner moving the sliders and seeing a believable range of people.

**Phase 2: Hair.** 12 styles first (afro, low cut, fade, locs, box braids, cornrows, bun, ponytail, puff, gele, durag, hijab) with cards, shine, colour, length, edges. Exit: a close-up and a mid-shot of each style on 3 skin tones, front, side and back.

**Phase 3: Clothes layers.** 15 garments on the morph body with colour zones and patterns, towel and nightwear states, fit follows body sliders. Exit: the same 15 garments on 4 different bodies with no clipping.

**Phase 4: Face and expression.** Blendshapes, blinking, talking (for calls), mood faces, look-at. Exit: a face sheet of 12 expressions.

**Phase 5: Animation v1.** Retarget and check the everyday-life list, plus doors, locks and vehicle seats. Exit: a contact sheet and a short capture of each clip on two bodies.

**Phase 6: Creator UI.** A tap-friendly creator (tabs: Body, Face, Skin, Hair, Clothes, Extras), randomise, save looks, preview in a room. Exit: a full creation walk-through on a phone.

**Phase 7: People at scale.** NPC variety from seeds, LOD, crowd budgets, 20 characters on screen on the reference phone at 30 FPS.

**Phase 8: More.** Careers uniforms, football kit, make-up, tattoos, more hair and garments, age sliders refined.

## 8. Decisions for the owner

1. **Base:** try MPFB2 first, or extend the current Human Base Meshes? (Recommendation: MPFB2 prototype first, because it already has many of the shape keys, and fall back to extending ours if the export fails.)
2. **How realistic:** semi-realistic like today's bodies but with better skin, hair and faces (recommended), or push for the most realistic faces we can fit in budget, at a cost to older phones?
3. **Body range:** allow a wide body range (slim to heavy, muscular to soft) from day one, or ship a narrower range first? (Recommendation: wide, since sliders cost little once the morphs exist.)
4. **Underwear and nudity:** keep it modest (plain shorts and vest or bra for the states, no nudity), as written above?
5. **Order after Phase 0:** hair first (the weakest part, the biggest visible win) or the morphable body first? (Recommendation: Phase 1 first, because hair and clothes must be fitted to the final body.)

## 9. Owner's answers (7 Oct)

1. **Base:** MPFB2 first, fall back to extending the current Human Base Meshes if the shape-key export fails.
2. **Realism:** semi-realistic with better skin and hair (30 FPS on a mid-range 2020 Android).
3. **Body range:** wide from day one (slim to heavy, soft to muscular, age 18 to 70, all garments fitting).
4. **Order after Phase 0:** the morphable body first; hair and clothes after, fitted to the final body.
5. **Still open:** underwear and nudity wording (section 8, item 4); assumed modest unless the owner says otherwise.
