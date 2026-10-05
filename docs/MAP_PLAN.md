# Map Plan

Status: **plan agreed with the owner (decisions below); build starts after the phone/performance fixes.** The map is the biggest piece of the game, so it is built in small, testable steps, each of which must keep the game fast on a phone.

## Decisions (from the owner)

| Question | Decision |
|---|---|
| Size of the first map | **One neighbourhood**, about 400 m x 400 m: your street, shops, a market, an edge of the airport. It grows chunk by chunk later. |
| Vehicles | **Scenery plus rides.** Cars, buses, taxis and planes move around; the player rides taxis, buses and flights as fast travel. No driving for now (physics and server checks come later, if ever). |
| Time in multiplayer | **Real-time pace plus offline sleep.** One shared world clock at a fixed speed, no skipping. Sleeping means logging off in a bed and catching up. Offline single-player may keep time-skipping. See "Time" below. |
| Buildings | **Cutaway interiors**, like the current house: walls fade when the camera looks in, so every enterable building can be seen into. Many house types built from a modular kit, with floors and garages. |

Earlier decisions that still hold: Nigeria-inspired but invented place names; free CC0 assets; realistic look; Project-Zomboid-style realism (needs, consequences, crafting, farming) without zombies; the same rules code runs on the future server.

## What the map must be

- A neighbourhood with streets, sidewalks, junctions, many different buildings (houses of several types and sizes, with floors and garages; shops; a market; a school or church; a small airport edge), trees, farm plots, street furniture.
- Alive: cars and buses on loops, planes in the sky and on the airport apron, people walking, day and night, power cuts that really switch lights off.
- Fast: 60 fps on a mid-range phone is the goal; 30 fps is the floor. Everything below is shaped by that.

## Technical design

**World as data in chunks.** The world is a grid of square chunks (32 m). Each chunk is a small JSON file: ground type, roads and sidewalks, lots, and which building or prop archetype sits on each lot, with its position and rotation. The same files are read by the client and (later) the server, so nothing about the layout lives only in rendering code.

**Streaming and levels of detail.** Only chunks near the player are loaded. Near chunks get full detail; mid-distance chunks get simplified buildings (no interiors, merged geometry); far chunks are flat silhouettes and fog. Interiors are built only when you are close or inside. Chunks load and unload in the background, a few per frame, so there are no hitches.

**Draw-call budget.** Repeated things (trees, fences, lamp posts, parked and moving cars, crates) are `InstancedMesh`. Static geometry in a chunk is merged into a few meshes per material. Targets on a phone: under 250 draw calls, under 400k triangles in view, under 200 MB of textures, shadows only near the player.

**Building kit and procedural houses.** A small kit (wall, floor, ceiling, roof, door, window, stairs, garage door, fence, balcony) in a few shared textures. A house is a short data description (footprint, floors, rooms, roof type, garage, colours) that a generator turns into geometry, collision and a navigation grid. Many unique houses cost almost nothing to store, and the generator is deterministic so the server can produce the same layout.

**Navigation.** The current walkable grid is generated per chunk and stitched together; paths are found within and across chunks. Interiors add their own grids that connect through doors and stairs.

**Vehicles and people.** Cars and buses follow splines (road loops) with simple spacing rules; planes follow flight paths and an apron route; background people walk sidewalk loops at low detail. All are scenery driven by the world clock, so every player will see the same thing later. Rides (taxi, bus, flight) are menu actions that move the player between stops, with a short transition.

**Light, time and power.** The sun and sky follow the world clock. Power cuts (already deterministic per day in `phoneData.ts`) will drive street lights and house lights.

**Farming and trees.** Plots with growth stages tied to game days; trees as instanced meshes with a few age variants. Planned after the streets work.

## Time (single-player today, shared world later)

Today the game skips time for long activities (sleep runs at 15 game minutes per second) and reads as "fast". A shared world cannot do that: one clock for everyone. Plan:

- Game-core already separates an action's **game minutes** from how fast they pass (`minutesPerSecond`). The shared world will use one constant world rate (proposal: 1 real second = 1 game minute, so a day is 24 real minutes) and an action simply takes `minutes / rate` seconds. `minutesPerSecond` becomes a single-player-only convenience.
- Long activities are retuned so they are never boring in real time (a shower is a minute or two, not an hour).
- **Sleep** in multiplayer: you go to bed and log off; the offline catch-up (already built for "while you were away") restores energy based on real time away. Staying online in bed just rests slowly.
- Everything time-based that exists now (rent day, allowance, power cuts, news, deliveries, job decisions) is already expressed in game minutes from one clock, so it carries over unchanged.

## Build steps

1. **Engine (built, awaiting real-hardware numbers; open `#/map`)**: chunk format, loader, streaming, LODs and a flat test district (a street grid with 30 plain lots) running through the same game. Measure frame rate on a phone-class budget (the in-game perf probe and adaptive quality are already in). *Exit check: walk the whole test district at stable frame rate, memory flat.*
2. **Roads and ground (built: textured streets, crossings, furniture, parked cars, cables, night lamps)**: roads, sidewalks, junctions, ground textures, street furniture, lamps, trees (instanced).
3. **Building kit and generator**: house types (small flat, bungalow, two-storey, compound with garage), shops; cutaway walls, stairs, doors; collision and navigation from the generator. The current house becomes one generated archetype.
4. **Life on the streets**: traffic loops, buses, planes and apron, background pedestrians; day and night, lights tied to power cuts.
5. **Travel and places**: leave the house, shops with real counters, market stalls, taxi/bus/flight rides; the phone's LifeMaps shows the real map; deliveries come to your door.
6. **Farming and trees**: plots, growth, harvest, kitchen supply.
7. Then multiplayer (server-authoritative, interest management by chunk), then the arrival scene (airport/bus park character creation), then asset and animation upgrades.

## Risks and how they are handled

- **Frame rate on phones**: budgets above, adaptive resolution and shadow refresh (already live), LODs, instancing, merged geometry; a performance check at the end of every step.
- **Load time**: chunks stream; the boot loader downloads in the background and caches on the device; only the needed building archetypes are fetched first.
- **Content volume**: the generator and kit mean variety comes from data, not hand-built models.
- **Scope**: each step is playable on its own; the neighbourhood can ship before the farming and planes.
