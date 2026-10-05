# Development Log

Chronological record of decisions and changes. Newest first.

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
