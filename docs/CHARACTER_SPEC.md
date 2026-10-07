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

## 10. Phase 1 result (7 Oct 2026): the morphable base, proved

**What exists.** `tools/character/build_body.py` turns the MPFB2 / MakeHuman data (CC0) into `apps/client/public/assets/characters/body_mpfb.glb` plus a morph pack. `#/body` is the slider page: 9 body controls (sex, age 18 to 70, height, weight, muscle, proportions, bust, two feature blends), 76 face and body sliders in four tabs, 12 skin tones, hair colour, a random button, face / full / back cameras and the same retargeted walk the game uses.

**What changed from the plan.**
- MPFB2 was used for its *data* (base mesh, targets, rig, weights), not as a Blender add-on: the add-on would not load headless, and a build script is repeatable and needs no Blender. The result is the same body.
- Morphs are **not glTF morph targets**. There are 173 of them; GPU morph targets would make every person on a street carry all of them. A person is made by adding up only the morphs their look needs, once, on the CPU (`lab/bodyMorph.ts`, 5 to 30 ms in headless software GL), after which they are an ordinary skinned mesh. The pack is gzipped sparse int16 (0.2 mm steps).
- Sex is handled exactly rather than as one slider: build, age, height, proportions and features are measured on a fully masculine and a fully feminine body and mixed by the sex value, which brought the error of mixed bodies from about 22 mm to about 1 mm (heavy plus muscular together is the worst case, about 6 mm on average). Detail sliders add up directly.
- The skeleton is MPFB's game-engine rig (same bone names as our UE-style skeleton): **53 bones with fingers**, plus two eye bones. Joints come from helper cubes that morph with the body, so every body gets its own fitted skeleton (bone positions and inverse binds are updated with the sliders). The existing retargeting (`lab/retarget.ts`) works on it unchanged, so all current clips play, and clips that use the same bone names as the UE skeleton (the Quaternius libraries) now also move the fingers.
- Eyes, eyebrows and eyelashes are fitted to the body with MakeHuman's proxy fitting, so they follow every slider. The modest base layer (shorts for everyone, a bandeau top for feminine bodies) is cut from the body itself; this is the prototype of how clothes will be made in Phase 3.

**Numbers.** Body 26,756 triangles (budget for a close-up body: 25,000; 7% over, to be trimmed in Phase 7 with the LOD set), whole figure 30,414 with eyes, brows, lashes and base layer in 7 draw calls, 55 bones. Download: glb 1.56 MB, morph pack 0.67 MB, slider list 15 KB gzipped, about 2.3 MB in all, once. Skin detail maps are 1024 px (2048 px for the creator close-up later).

**Not done yet (each has a place in the plan).** Hair and clothes (Phases 2 and 3). The face rig, teeth, tongue, blinking and talking (Phase 4). Lips look pale on dark skin and the iris is too red: the skin and eye shaders are Phase 4 work. Skin tone is one colour times a neutral detail map; undertones, freckles and marks come with the skin shader. The new body is not in the game yet: `lab/avatar.ts` still builds the old bodies, and moving the creator, the home, the street and the buildings onto `MorphBody` is the first step of Phase 2 so hair and clothes are fitted once, to the final body. The base-layer edges are rough where the cut crosses uneven rings of the mesh.

**Needs the owner:** nothing blocks; the open question from section 8 (underwear wording) is still assumed modest.

## 11. Phase 2 result (8 Oct 2026): the game now uses the new body, and hair grows on the real scalp

**Everything is on the new body.** The realistic look path of `lab/avatar.ts` builds a `MorphBody` (the creator stage, the profile, the home, the street and the buildings all go through `Avatar`). `Look` gained an optional `shape` (sex, age, height, build, muscle, proportions, bust, features, face and body sliders); older looks work unchanged, their shape is worked out from body, height and build (`lookShape`). Skin tone, eye colour (the brown eye picture recoloured on the iris only), brows and lashes follow the look. The modest base layer (shorts, and a bandeau top on feminine bodies) shows when nothing else is worn, and goes away under a garment. The stylised bodies are still there for the old Lab. The server keeps the shape with the life (`cleanLook` allows it, inside ranges, up to 100 sliders; look limit raised to 4 KB), so **the VPS needs the update** (`vps-setup.sh`, then restart) or it will strip the shape from saved looks.

**Creator.** New Face tab (Face, Eyes, Nose, Mouth, 49 sliders), a Shape section on the Body tab (looks-about age 18 to 70, height, build, muscle, bust, shoulders, chest, waist, belly, hips, glutes, arm muscle, thigh fat). Sliders rebuild the person; while a slider is moving only the newest look is built. The camera fits tall and short people.

**Hair.** The cap of every style is now cut from the body's own head triangles above a hairline curve (front at the forehead, side above the ears, back at the nape), so it follows the real skull, forehead, temples and any head slider. Short styles get a soft hairline, big styles (afro) are several nested shells with gaps (alpha-tested coils) pulled toward a round dome, strand styles root on the true scalp, fan out below the neck so they fall over the shoulders, and taper at the tips. Buns, puffs and knots are fuzzy shells, the ponytail is a bundle. New: a hijab (hood and drape) and a rebuilt gele; the durag has proper tails. Hair has a soft sheen. 19 styles in all.

**Honest gaps.** Hair is still "textured shells and tubes", not photographed hair cards: it looks right at game distance and in a close-up three-quarter view, but straight strand styles still look a little stiff and the hairline is a hard cut on the strand styles. Black hair is very dark in dim light. The street view is low resolution by design, so most of this is only seen in the creator, the profile and close camera places. Clothes are still the old procedural garments (tight, cut from the body); Phase 3 replaces them. Rebuilding a person on a slider release takes about 0.1 to 0.3 s in headless software GL, more on a phone, which is why the creator coalesces changes.

## 12. Phase 3 result (8 Oct 2026): clothes that are made of something and hang like clothes

**Real cloth.** The owner did not like the flat coloured cloth, so garments are now made of real fabric scans (Poly Haven, CC0; `tools/fabrics/build_fabrics.py`, 1.5 MB for 13 fabrics): cotton, poplin, linen, denim, knit, fleece, tweed, satin, suiting, towelling, piqué, brocade, gingham. Each has its own weave (normal map), how dull or shiny it is (roughness map; satin has a sheen), and takes any colour. Ankara (a wax print with ringed medallions, feather fans, dotted lattice and the fine cracks of wax-resist dye, its palette made from the chosen colour), adire (resist-dyed rings and stitching) and woven stripes are drawn in code over a poplin weave. Every garment has its own natural fabric (a tee is cotton, a polo piqué, a hoodie fleece, a kaftan linen, an agbada brocade, a gown satin, a wrapper ankara, jeans denim); the wearer can choose another from 12 (`Natural, Linen, Denim, Knit, Tweed, Satin, Suiting, Brocade, Check, Stripes, Ankara print, Adire`).

**Loose and long clothes hang.** `lab/procedural/loft.ts` measures the body's reach from its own axis at every height and angle and lofts a closed sleeve of cloth round it: it can hang from the chest or the hips (kaftans and agbada skip the waist), flare, fold, trail behind, and follows the legs part of the way (skin weights mix pelvis, thighs and calves). New and rebuilt garments: dress, gown, kaftan, agbada, buba, senator, skirt, long skirt, wrapper (iro). Long garments hide the bottom worn with them. Trousers got a cut (`legCut`): straight, bootcut jeans, tapered suit trousers, wide palazzo, loose shorts, capri, so they are no longer leggings. Necklines sit at the collarbones (the new body's neck joint is mid neck).

**States the game sets.** `Avatar.setOutfitState`: in the shower only the base layer (modest shorts, and a bandeau top on feminine bodies); a towel (terry cloth wrapped from the chest, hanging to mid-thigh); pyjamas (loose top and trousers) in bed. The home controller sets them from the action being done (`shower` and `sleep`); the look is untouched. These garments are not in the wardrobe.

**Checked** on four bodies (slim tall woman, heavy man with belly, tall muscular man, older heavy woman) in six outfits each: nothing clips at rest.

**Honest gaps.** Colour is one colour per garment (ankara and adire follow it); separate colour zones (collar, cuffs, trim) are not done. Arms hanging at the hips can still touch a wide skirt, and the 2D isometric view has no sprites for the new garments. Shoes are still plain lumps cut from the foot. Weave detail is only visible up close (it is real, but a fine weave is smaller than a pixel on a full-body view). No cloth physics: hems follow the legs, they do not swing.

## 13. Phase 4 result (8 Oct 2026): a face that moves

**What exists.** 20 face units (FACS-style building blocks) from the MakeHuman expression targets, the African variants: blink left and right, eyes wide, eyes narrowed, brows down, up, inner up, outer up, left brow up, jaw open, smile, frown, upper lip raise, pucker, press, protrude, stretch, nose wrinkle, nostril flare, chin down. They are real GPU morph targets on the skin, brows, lashes, teeth and tongue (`MorphBody.enableFace`, built from the same morph pack), so an expression changes every frame without rebuilding the person. Teeth and tongue are the base mesh's own helper shapes, so the jaw moves them with the lips.

**`lab/face.ts` (`FaceRig`).** 12 moods (neutral, happy, laugh, sad, angry, surprised, scared, disgusted, tired, smirk, worried, kiss), 7 mouth shapes (rest, aa, ee, oh, oo, mm, ff), automatic blinking (a quick shut, a slower open, every 2 to 6.5 s), a wink, and speech: `speak(true)` moves the jaw and lips through syllables, or follows a loudness (0 to 1) when real speech drives it, so calls can use it later. The eyes follow the look target by themselves (up to about 30 degrees, a little ahead of the head) and flick about when nothing is looked at.

**In the game.** The player's own person shows how they are doing: the home controller sets the mood from their needs every two seconds (tired when energy is low, happy when well, worried or sad when low). Only the people looked at close up get a face rig (the player at home, in the street and in buildings, the creator, the profile, the film); a crowd keeps the cheap blinking eyelid, to save memory.

**Honest gaps.** No tongue or teeth shape changes beyond the jaw; the mouth shapes are approximations, not lip-synced to real audio yet (the loudness hook is there, the call feature is not built). Expressions are subtle in dim light and at street-view distance; they read in the creator, the profile and building interiors. Morphs do not move the shading normals, so a very big expression is lit a little flat. The eyes' iris is still too red.

## 14. Phase 5 result (8 Oct 2026): the life clips on the new body

Every everyday clip was captured at 15 / 50 / 85 % of its loop on a male and a female morphed body (tee, jeans, sneakers) with `#/hair` → `__hair.clipAt(name, frac)`.

- Works with no retarget changes: Idle, Walk, Jog, Talk, Phone, Wave, Cheer, Eat (standing and seated), Wash, Brush, Read, Dance, Sit, Sleep. The existing `lab/retarget.ts` maps all of them onto the per-body fitted skeleton, on both sexes.
- Acceptable but not great: `Life_Cook` (KK_Work_A) holds the arms wide, and `Life_Type` is still the Driving loop. Both are placeholders until a proper kitchen and desk clip is sourced.
- Cloth: tops are simulated while the avatar is close up. Right after a hard pose jump (what the capture does) the hem is ragged for a few frames, then settles. Continuous play in the game does not show this.
- Still missing clips (not on the new body, simply not in the library yet): open/close door, unlock, sit-in-vehicle, ATM, shower with water.

## 15. Phase 6 result (8 Oct 2026): a creator made for a phone

**Camera.** The stage camera glides to a focus per tab: whole person for Body and Clothes, head and shoulders for Skin, Hair and Extras, a face close-up for Face. The stage is taller on phones (46%) and the header is slim, so the person is no longer a small figure above a long list.

**Tabs.** Body, Face, Skin, Hair, Clothes, Extras. Skin holds skin tone, eye colour and beard (moved out of Body).

**Randomise.** A dice button per tab re-rolls only that tab (`creator/randomise.ts`; sliders stay inside their ranges, a male gets no bust); "Surprise me" rolls all six.

**Undo / redo.** `creator/history.ts`: a burst of slider changes is one step, 40 steps deep, a new change clears redo.

**My looks.** Up to 8 looks saved on the device (`creator/savedLooks.ts`, localStorage) with a small picture taken from the stage; tap to wear, × to delete. Nothing is sent to the server.

**Preview in a place.** Studio, Home (a room with window, rug, sofa, lamp) or Street (road, pavement, buildings), plus the Walk toggle.

**Honest gaps.** No skin undertone or freckles/marks yet (needs the skin shader). The Home and Street backdrops are simple blocks, enough to judge colours in different light, not the real places. Saved looks live in the browser only; they are not tied to the account.

## 16. Phase 7 result (8 Oct 2026): people at scale

**The street crowd is no longer blocks.** The old street people were boxes with swinging limbs. Everybody is now a seeded person (`lab/npcSpec.ts`: the same seed always gives the same look, sex, age, build, face sliders, hair and clothes) and is drawn at one of three levels:

| Level | Distance | What it is | Cost |
|---|---|---|---|
| Real character | under 30 m (5 to 9 of them, from a pool) | the full body, hair, cloth, walking animation | about 42,000 triangles each, about 14 draw calls |
| Crowd, mid | 30 to 48 m | thinned body, 1,500 triangles | one instance |
| Crowd, far | 48 to 85 m | thinned body, 420 triangles | one instance |

**Crowd bodies** (`tools/character/build_crowd.py`, uses Blender's decimator as a module): the neutral male and female MakeHuman bodies thinned to 1,500 and 420 triangles, each vertex tagged with a zone (skin, top, trousers, shoes, hair, sleeve, lower leg) and a limb. `map/crowd.ts` draws every person with their own colours per zone, hair standing off the scalp by their hairstyle's volume (an afro, a fade, a bald head), height and build, and a walk (legs, knees, arms) all in the vertex shader. Sixty people: 90,000 triangles in 3 draw calls, 0.2 ms to submit. Sixty real characters would be about 2.5 million triangles in about 800 draw calls. `crowd.json` is 74 KB.

**Variety from a small pool.** A person who takes a real body keeps that body's look when they step back into the crowd (no pop). When a real body goes back to the pool it is repainted at once (new skin, hair and clothes colours, 3 ms), and every 45 s one piece (hair, top, trousers or shoes) is swapped (80 to 200 ms on a laptop, so it is rare). Changing a body's shape or any garment costs 80 to 200 ms; colours cost nothing, which is why the repaint is colours only.

**Honest gaps.** The 20-people-at-30-FPS target could only be checked by counting, not on a real phone: 20 mid-level crowd people are 30,000 triangles and one draw call, and the 5 to 9 real characters are the heavy part (about 250 to 380 thousand triangles). If a low phone struggles, the settings page can lower the real-character count (the pool size is one argument). The real characters are still full 42,000-triangle figures; a decimated skinned LOD for them (so 20 could be real at once) needs the morph pack mapped to a thinned mesh and was not done. Long garments (kaftans, gowns) are a single colour on the crowd bodies, with no flowing hem. Crowd people always walk; there are no standing, chatting or sitting crowd people yet.

**Dev page** `#/crowd` (dev or admin): sixty seeded people at street distance, a close view, real characters of the same seeds beside them, triangle and draw-call readout (`window.__crowd`).

**Height fix (8 Oct, owner: "the limbs are too long").** The body model's "average" is 1.82 m for a man and 1.68 m for a woman (African MakeHuman average), tall for Lagos, and the random NPCs went up to about 2 m, which reads as lanky with a small head. Seeded people now run about 1.60 to 1.78 m (men) and 1.52 to 1.68 m (women), the crowd bodies are scaled to match and a little sturdier, and a new person in the creator starts at about 1.70 m (height slider -0.35). The sliders still go from 1.46 m to 2.5 m for anyone who wants it.
