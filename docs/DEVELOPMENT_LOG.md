# Development Log

Chronological record of decisions and changes. Newest first.

## 2026-10-05 — Realistic characters, animation director, texture fix
- **Furniture textures:** the cause of slow and missing textures was memory, not file size: every model carried 1024 px colour, normal and roughness maps, 658 MB on the graphics card if all were loaded (phones fail and drop textures). Textures are now sized by object (all models 307 MB, the house 120 MB), a build budget enforces 10 MB per piece, textures are uploaded before play starts, and a model that fails to load is retried and replaced by a plain box instead of breaking the room.
- **New realistic characters:** found the Blender Foundation's CC0 Human Base Meshes, downloaded headless Blender, and wrote a rigging script (`tools/assets/blender/make_body.py`): realistic male and female bodies skinned to the existing 65-bone skeleton by copying weights from a posed Quaternius mesh, A-pose baked in as the bind pose, so all existing animations work. Added realistic skin, eyes with iris and pupil, eyebrows and blinking eyelids. Lab has Realistic/Stylised and Male/Female choices and a Face close-up. Looks saved before this move to the realistic bodies.
- **Fixes found while doing it:** garments assumed a T-pose (hands became part of the trousers; now cut by planes square to each arm); the neckline was ragged on the coarser mesh (signed-distance cut, and skin is hidden only where a garment wholly covers it); finger bones tore the relaxed hands (fingers fold into the hand bone); the asset build dropped texture coordinates and merged eye and brow materials (prune keeps attributes for skinned parts, distinct materials); seat height read from the lowest sample put people in sofa seams (median sample).
- **Animation:** eased acceleration and stopping with clip speed matched to ground speed, head tracking and idle glances, blinking, four new body-language clips (yawn, stretch, stomach rub, fidget) played from needs, and a real sit-on-the-edge then lie-back bed sequence with the reverse to get up.
- **Verification:** all 15 house interactions still pass (one expected "not hungry" refusal); sit, bed, toilet and bench checked visually on the new body; idle behaviours confirmed by state log (fidget triggered and ended); 46+ unit tests and typecheck pass. Frame rate in my headless browser dropped to about 1 fps late in the session (it did the same on the previous commit, so it is the test machine, not the code).
- **Limits:** bodies are 23k triangles (crowds will need a lower-detail version); no finger animation; fantasy outfits do not fit the realistic bodies; the male is 1.82 m; the new clips are approximate poses; I could not get a good look at hand and face animation at game camera distance on the slow test machine.

## 2026-10-05 — Splash, loading screen, device cache, update prompt
- **Launch sequence:** Alexion Studios splash (original animated mark, tap to skip), then a loading screen with the title, four rotating feature highlights and a progress bar, then a "Welcome" and into the game.
- **Cache on the device:** first launch downloads the 91 model files the game needs (21 MB incl. textures) with live "X of Y MB" progress; later launches only run "Finding your assets / Loading animations / Setting up your home". Browser test: first launch fetched 91 models over the network, second launch fetched 0. Offline start uses a stored copy of the asset list.
- **Updates without maintenance:** each build writes `version.json`; the running game compares it with its own build id (every 5 min and on tab focus) and shows "A new version of TheLife is ready, Reload". Tested by publishing a different id while the page was open.
- Bugs found in testing: the final fade-out timer was cancelled by a state change (screen stuck at "leaving"); the update banner was pushed off-screen because an animation overrode its centring transform.
- Limits: same-size changed assets are not re-downloaded (needs a per-asset revision); the browser may clear the cache under storage pressure; no service worker yet (comes with hosted build); the repeat-launch sequence is about 5 s long, which can be shortened if it feels slow.

## 2026-10-05 — Realistic furniture, priced catalog, showroom
- **Realistic furniture replaces the cartoon set in the house:** 60 CC0 Poly Haven models (sofas, chairs, tables, shelves, lamps, TV, radio, stove, fan...) fetched and compressed by the asset pipeline (`fetch_polyhaven.py`), plus 14 pieces built in code (fridge, toilet, basin, shower cabin, bed, wardrobe, flat TV, washer, kitchen units, lamp, rug, doormat). Image-based lighting makes metal, glass and wood read as real.
- **Catalog (game-core):** 77 pieces with name, category, naira price and the action they enable. Players will buy these in a shop later; for now the house and showroom place them directly. Tests check every item has a model and every model is sold.
- **Interactions derived from shape, not hand-tuned:** seat height by ray, hips offset measured from `Sitting_Idle_Loop`, real `Sitting_Enter`/`Sitting_Exit`, lying pose lowered onto the mattress using the measured sleeping body, approach spots found by search. Sofas have one seat per cushion.
- **Furniture animation:** fridge and oven doors open, fans spin, shower water runs, TV glows when watched, radio pulses, lamps light at night; ceilings are cut away like other life sims.
- **Showroom (`#/showroom`):** every catalog item on display with its price; "Run all tests" uses each piece. Headless run: all 33 usable pieces start the right activity and animation; the 15 house interactions pass (one refusal was the game rule "You're not hungry").
- Bugs found by looking at screenshots: seat height was read off a pillow on the big sofa (now the lowest of a sample grid); lying body floated above the mattress (3rd-percentile body height instead of the lowest vertex); dining chairs tucked under the table had no approach spot (ring search).
- Limits: in headless software rendering each test is slow, frame rates there are not representative; mattress contact and sofa cushion depth are approximate; ceiling fans are hidden in the game view (no ceilings yet); some pieces' look (e.g. black coffee table) may be swapped later.

## 2026-10-05 — Playable day: needs, time, money, more furniture, polish
- **game-core** (`packages/game-core`, 24 tests): five needs with mood/performance, a double-entry ledger (total always 0, no overdrafts, tampered saves rejected), data-driven actions (12 activities), weekly rent with late fee and eviction warning, skills, groceries/cooking/eating inventory, collapse from exhaustion, accidents, and offline catch-up with a "While you were away" summary. Full spec: `docs/GAMEPLAY_SYSTEMS.md`.
- **Prototype is now a game:** HUD (clock, money, need bars, mood, inventory, rent, skills), action banner with progress, toasts, away panel, day/night lighting with house lights, saved on the device. Tired characters walk slower; collapsing puts the character on the floor.
- **More furniture (30 new asset types, 140 assets / 7.8 MB total) and a bigger house:** bathroom (toilet, shower with a see-through stall, sink, cabinet, washer), bedroom (bed, nightstands, wardrobe, bookshelf), living room (TV, coffee table, sofa, side table, lamp, radio), 4-seat dining set, entrance (doormat, coat rack), kitchen (cabinets, hood, toaster, microwave, bin). "Rest on top of" placement. 14 interactions, several pieces per action (tap the desk, monitor, keyboard or laptop to work).
- **New animations:** wash, brush teeth, read (plus dancing to the radio using the library clip).
- **Polish from testing:** toilet and sink facing, seat setback and sofa height, see-through shower, tap queueing during sit/stand transitions, phone top bar and plural text fixes, mirror removed (looked like a floating plank).
- **Verification:** all 14 interactions driven end to end in a browser (tap, walk, perform, needs change, return to idle); collapse, night lighting, away panel, groceries and low-money notice checked; 60 random rapid taps leave the game in a valid state (ledger sums to 0, needs within 0-100, no errors, no stuck states); 10 layout data-integrity tests (assets, actions, clips, reachability from the front door). 46 tests in total.
- **Limits:** the cartoon furniture doesn't match the realistic characters; sit/lie offsets are tuned by eye; one lot; no other characters; no sound; clips for brushing and washing are approximate; frame rate figures in my tests come from software rendering.

## 2026-10-05 — Tap-to-walk prototype (`#/play`)
- Pathfinding in `packages/shared/src/nav.ts` (grid A*, no corner cutting, string-pulling) with 6 unit tests. Shared package so the server can validate moves later.
- Prototype house as data (`play/layout.ts`): walls with a front door and a partition doorway, 24 furniture items from the Kenney kit at real-world scale, 7 interactions (fridge, stove, dining, sofa/TV, desk, bed). Camera orbit/zoom/pan with follow; walls fade when the camera is outside; hover highlight; target marker.
- Controller: smooth turning, walk/jog, sit/lie tweens onto seats and the mattress, stand-action timers, getting up before walking off. The character uses the look saved from the Lab.
- Verified in a browser (software WebGL): walks through the doorway into the bedroom, sleeps in the bed, switches to the sofa, snacks at the fridge, works at the desk, walks out of the front door; real mouse clicks and phone touch taps start walks; a drag does not count as a tap.
- Bugs found and fixed: (1) nav cells touched by a wall were all blocked, which closed 1.2 m doorways (fixed with 12.5 cm cells and 1.4 m doors); (2) only the chair was tappable at the desk (now desk, monitor, laptop, table, TV, sink and nightstand also work).
- Limits: one lot only; no collision between characters; pose offsets (sit/lie) are tuned by eye and will need per-furniture tuning; furniture is cartoon-styled; no sounds; the frame rate in my tests (about 10 fps) is software rendering, not real hardware.

## 2026-10-05 — Everyday-life animations (roadmap stage 2, first pass)
- Audit of the 43 CC0 clips: sitting, talking, interact, pick-up, driving, dancing already exist. Missing life-sim actions were authored in code: sleep, eat (seated + standing), drink, type, phone, wave, cook (8 clips, `procedural/lifeClips.ts`). 51 clips total, available in the Lab on both bodies.
- Method: base clip (Idle/Sitting) + keyframed joint offsets. First attempt assumed fixed hinge axes and posed elbows sideways; fixed by measuring on the posed skeleton which local axis moves the hand toward a goal direction.
- Verified in a browser: eat reaches the mouth, type puts hands at keyboard height, sleep lies flat with straight legs, cook works on the female body. Wave and phone are approximate (see polish list in `ASSET_PIPELINE.md`).
- Next: the map (district layout, lots, tap-to-move with pathfinding, interactions with objects).

## 2026-10-05 — African hairstyles and modern clothing (procedural)
- Hair generated in code and rigidly attached to the head: low fade, afro, afro puffs, cornrows, box braids, locs, top bun, head wrap. Fits both bodies by measuring the body's own head.
- Garments cut from the body mesh with plane clipping (`geometryClip.ts`): T-shirt, tank top, long sleeve, kaftan, shorts, trousers, sneakers. They share the body skeleton, so they animate correctly. Fabrics: plain, stripes, ankara print, denim, tinted by any of 13 colours.
- Bugs found and fixed through browser testing: bone-based selection gave ragged shoulder/sleeve edges (replaced by pure plane cuts); a flat neck cut tore the shoulders (now a round neckline); face triangles leaked into the garment under the chin (head slab removed).
- Known limits: no skirts/long flowing clothes, rigid braids, simple sneakers, wrap is a stylised fan. Still to do: Stage 2 (sit/sleep/eat animations), then the map.

## 2026-10-05 — Clothing in the Asset Lab
- Added the CC0 Quaternius "Modular Character Outfits - Fantasy" (Peasant, Ranger; male/female). Pipeline now builds 20 clothing parts + shared textures (108 assets, 7.6 MB, all in budget; clothing budget 10k tris/piece).
- Avatar: clothing attaches like hair (re-bound by bone name). Covered body triangles are removed at runtime so skin never pokes through. Sleeves follow the top; hood and shoulder guards optional.
- Colours: neutral greyscale textures let Top / Bottom / Shoes take any of 13 colours (plus the outfit's original colour sets). Randomise now includes outfits and colours.
- Verified in a browser on male and female characters (walk animation, recolouring). Fixed two bugs found while testing: textures stripped from the parts must be re-applied at runtime; sharp applies operations in its own order, which made the neutral texture far too dark.
- Honest limits: the outfits are medieval-fantasy shapes, not modern Nigerian fashion; female sleeve bracers show a little skin colour at the edges. Props restyle and more realistic vehicles are still to do.

## 2026-10-05 — Asset Lab v0 (roadmap stage 1)
- Chose "adapt free CC0 packs" for characters. Downloaded and verified licences: Quaternius Universal Base Characters + Universal Animation Library, Kenney Furniture Kit + Car Kit (all CC0).
- New `tools/assets` pipeline: reproducible fetch (`fetch-all.sh`, incl. itch.io free-download flow), `sources.mjs` (what we take + budgets), `build-assets.mjs` (optimise to compressed glTF, enforce budgets, write `manifest.json`). ~330 MB of raw packs become a 5.3 MB game library (78 assets, all in budget).
- New Asset Lab at `#/lab`: orbit viewer, lighting presets, wireframe, turntable, stats, PNG export; character composer (2 bodies, 7 skin tones, 5 hairstyles + 8 colours, beard, eyebrows, eye colours, 43 animations, randomise); prop and vehicle browsers; Pipeline report (budgets, licences, heaviest assets). Responsive with a collapsible panel on phones.
- Fixed a bug found in browser testing: hair rendered giant because meshopt quantization stores its scale in the skeleton's inverse-bind matrices. Skinned assets now skip quantization.
- Dependencies added: `@gltf-transform/{core,extensions,functions}`, `meshoptimizer`, `sharp` (dev tools only, `tools/assets`).
- Known gaps: no clothing, no African hairstyles, one face shape per body, Kenney props/cars are cartoon-styled vs semi-realistic people (see `ASSET_PIPELINE.md`).

## 2026-10-05 — Offline-first, real 3D, asset-first order
- Owner decisions: build the **offline single-player** game first and add multiplayer later; make the world **realistic** (true 3D); build **all asset models first** (faces, hair, props), then animation/rigging, then the map, then the main game.
- Replaced the planned PixiJS isometric renderer with **Three.js** (`apps/client/src/world3d/`): procedural textures, buildings, shopfronts, props (lamps, power poles, palms, billboard), cars and yellow minibuses, walking people, sky dome, sun shadows, fog, ACES tone mapping. Lazy-loaded; scene builds in ≈ 0.4 s on desktop; falls back to the SVG art without WebGL; lowers resolution on slow devices; honours reduced-motion.
- Added **"Play now"**: device save (`apps/client/src/save`, versioned), "Continue my life" / "Start a new life instead", optional account. The in-game placeholder shows the 3D street behind a card.
- Dependencies added: `three`, `@types/three` (3D rendering).
- Verified in a browser (software WebGL, so frame rate there is not representative): scene renders on desktop and phone widths, offline start, save persists across reload, continue, back to start, account sign-up all work.
- Docs updated: `TECH_ARCHITECTURE.md` (§5 rendering, new §5b offline-first), `GAME_VISION.md` (decisions 5, 20, 23–25), `ROADMAP.md` (new stage order and asset sourcing plan).
- Known caveat: procedural people/vehicles are placeholders; stage 1 replaces them with proper rigged glTF assets.

## 2026-10-05 — M0 (part 1): foundation + auth page
- Added pnpm monorepo (`apps/client`, `packages/shared`), strict TypeScript, Vitest.
- Client: React + Vite. Original auth page (log in / create account, 18+ confirmation, validation, responsive layout, animated isometric hero in SVG).
- Auth: `AuthService` interface with a Supabase implementation, plus a dev-only localStorage implementation used when no keys are set (disabled in production builds, which show "not available" instead).
- Validation rules live in `packages/shared` (unit-tested) so the server can reuse them.
- Dependencies added: react, react-dom, vite, @vitejs/plugin-react, @supabase/supabase-js (auth), typescript, vitest.
- Verified in a real browser (desktop + phone widths): validation, sign-up, reload persistence, log out, wrong password, log in. Production bundle ≈ 49 KB gzipped.
- Not done yet: Supabase project hookup, game server, CI, PWA manifest, isometric lot renderer (rest of M0).

## 2026-10-05 — Phase 0: planning and architecture
- Ran a 30-question planning Q&A with the project owner; results recorded in `GAME_VISION.md`.
- Reviewed the reference game (Lagos Life) via public sources only: browser multiplayer life sim, one shared city, weekly rent, jobs, dating, businesses, weekly governor election, wallet top-ups. Used for high-level inspiration only; nothing is copied.
- Wrote `TECH_ARCHITECTURE.md` (stack, systems, data model, multiplayer, world model, assets, responsive strategy, repo layout, risks) and `ROADMAP.md` (slice milestones M0–M7 and later phases).
- Key decisions: isometric 2.5D with PixiJS; React + Vite PWA; Node + Fastify + WebSocket authoritative server; Supabase for Postgres/Auth/Storage; double-entry ledger; instanced lots; storylet engine; AI text with cost caps and fallbacks.
- No game code written yet. Next: M0 — Foundation, after architecture approval.
