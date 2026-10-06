# Master Plan: Lagos, travel, multiplayer and a better life sim

Written from the owner's answers to a 40-question planning session (10 rounds of 4). This supersedes the earlier "one neighbourhood" map plan where they differ; `MAP_PLAN.md` still describes the engine that is built. Anything marked **Decided** came directly from the owner.

## 1. The vision in one paragraph

A realistic, Nigeria-based life simulator you play in a browser, alone offline or together online. The world is a **replica of Lagos built from real map data**, then **Abuja**, then **Port Harcourt, Kano, Ibadan** and other states. You live in an area that matches your background, walk to the road, and **travel** by okada, keke, danfo, BRT, taxi, your own car, ferry, helicopter or plane in a **driven, cinematic trip scene** that costs money and game time. Every building can be entered; the life underneath is Sims crossed with Project Zomboid (needs, injuries, illness, power cuts, cooking, farming, skills, stress), but better. Multiplayer runs in **exact real time**, with the server in charge of anything that matters.

## 2. Decisions

| Area | Decision |
|---|---|
| Map source | **Real map data (OpenStreetMap, credited), simplified.** Real roads, bridges, water, footprints; generated shells and interiors; hand-built landmarks. **Decided** |
| Area | **All of Lagos** (Island, Ikoyi, Victoria Island, Lekki, mainland, Ikeja, ports) as one project, built area by area. **Decided** |
| Scale | **Compressed**, with fast travel. **Decided** |
| Names | **Real place, street and landmark names; invented brands** (shops, banks, airlines, networks). **Decided** |
| Interiors | After the mapping is done **every building gets an interior** (malls, hospitals, police stations, schools and so on). **Decided** |
| Cars | Realistic and good-looking traffic and vehicles. **Decided** |
| Cities | **Separate cities joined by travel**, order Lagos, Abuja, Port Harcourt, Kano, Ibadan, then more. **Decided** |
| Housing | **Choose an area by budget; can move later.** Distinct character per area (Makoko, Banana Island, Balogun, GRA). **Decided** |
| Transport | **Okada and keke, danfo/molue and BRT, taxi and ride-hail (in the phone), own car, ferry, helicopter, flights.** **Decided** |
| Trip scene | **A real driven scene through the streamed city, with a cinematic camera**, skippable. **Decided** |
| Trip factors | Traffic and time of day, fuel and fare changes, random events, safety and risk. **Decided** |
| Own vehicle | Buy, park at home, fuel, repair. **Decided** |
| Area effects | Rent and prices; power, water and security; jobs and businesses; people and events, all by area. **Decided** |
| Time cost | **Trips cost game time**, shown in the trip scene. **Decided** |
| NPCs | Schedules and memory for key people, simple crowds for the rest. **Decided** |
| Crime | Light consequences and risk (pickpockets, checkpoints, area safety, a police station to visit); no heavy violence. **Decided** |
| Buildings | Real footprints, generated shells and interiors, landmarks by hand. **Decided** |
| Landmarks first | Bridges and water; markets and motor parks; culture and civic; transport hubs and malls. **Decided** |
| Look | Realistic but optimised for phones, with a Graphics setting. **Decided** |
| Street life | Busy Lagos, scaled to the device. **Decided** |
| Multiplayer size | **Rooms of 20 to 50 players per city instance.** **Decided** |
| Social | See and chat, trade and send money, share places, compete and cooperate. **Decided** |
| Authority | **Server decides everything that matters.** Offline play uses the same rules code. **Decided** |
| Time | **Multiplayer world clock is exact real time (1:1).** No skipping. Sleep happens logged out in a bed. **Decided** |
| Hosting | **Vercel for the website, Fly.io for the game server, Supabase for accounts and saves.** **Decided** |
| Map delivery | Chunk files from a CDN, cached on the device. **Decided** |
| Minimum device | Mid-range Android from about 2020. **Decided** |
| Dev tools | Hidden behind an owner/admin flag in live builds (showroom, asset lab, map bench, performance tour, phone playtest switch). **Decided** |
| Survival systems | Body (injuries, illness, medicine, hospital); home (power, water, generator and solar, repairs); food (cooking with ingredients, farming, markets); mind and skills (stress, mood, learning, crafting). **Decided** |
| Failure | Recoverable setbacks, rare permanent loss. **Decided** |
| Goals | Career and business; family and relationships; status and politics; open sandbox. **Decided** |
| Character | **Rebuild the character with AI-generated, human-looking models the owner previews and picks, rigged to our skeleton; proper clothing layers with cloth physics, and hair that fits.** **Decided** |
| Hair | **Hair cards with real hair textures**, hand-built styles for Black hair types. **Decided** |
| Clothing | Underwear, towel and nightwear states; wardrobe and outfit choice; weather and occasion clothing; wear and damage. **Decided** |
| Nature | Realistic tropical trees and plants from CC0 libraries, instanced with LODs and wind. **Decided** |
| House editing | **Build mode**: buy from a catalogue, place, rotate, move, sell back; items work where placed. **Decided** |
| Order | **Realistic character, hair and clothes, then build mode, then Lagos data**; multiplayer server alongside. **Decided** |
| Money | No payments in the game. Revenue from **in-world advertising boards** (road billboards and similar) and other ad tech later. **Decided** |
| First multiplayer test | **The owner and a few friends, today, on a cheap server.** **Decided** |

## 3. What the owner reported that must be fixed (and where it goes)

- The character "looks dumb", the animations are poor, hair is the worst: **Stage A** (below).
- Clothes stay on for the toilet and the shower: **Stage A**, clothing layers and states.
- Trees look like cartoon lollipops: **Stage D**, realistic trees (can be done early, independent).
- Most furniture does not work and there is no house editing: **Stage B**, build mode and furniture functions.
- Phone: fixes done; the "black app" screens could not be reproduced and have been hardened (see the dev log).

## 4. Stages

**Stage M (now): multiplayer prototype, for a test today.** A small authoritative server (Node, WebSockets) that runs the existing rules (`game-core`) and a room per city instance; clients send intentions (walk here, use this, send money) and receive state snapshots; positions are interpolated. Accounts through Supabase when the keys exist; a name-only guest mode for the first test. First test world: the existing test district and the house. Deploy: Fly.io (server) plus the existing page on Vercel.
Needs from the owner: a Fly.io account (or permission for me to prepare the config for them to deploy), a Supabase project URL and anon key, and a Vercel project linked to the repository. Until those exist the server runs locally for testing.

**Stage A: the person.** AI-generated human characters previewed by the owner (the lab already supports preview and picking), retargeted to the 65-bone skeleton; a clothing system of wearable layers (underwear, towel, nightwear, outfits) with cloth weights and baked cloth motion; hair cards with textures for each style; animations reworked (toilet, shower, sleep, eat, cook, work) with the right clothing state; faces and skin finished. Exit check: a close-up screenshot set the owner approves.

**Stage B: the home.** Build mode (catalogue, place, rotate, move, sell back, grid and free), every catalogue item functional (bed, toilet, shower, stove with the pot and ingredients UI, fridge, TV that plays, laptop, switches, generator, solar), the game house becomes a generated building plan on the map, wardrobe and laundry.

**Stage C: Lagos from real data.** A build-time pipeline: OpenStreetMap extract for Lagos, cleaned and compressed, converted into our chunk format (roads by class, bridges, water, footprints with type and height, land use), published as chunk files on a CDN; the engine loads them as it does today. Per-area style (building mix, road quality, crowds, power and security) driven by area data. Hand-built landmarks: bridges, markets and motor parks, civic buildings, airport and ports. Every building gets an interior from the generator (malls, hospitals, schools, police and the rest get type-specific plans). The compression factor is chosen with a test of walking times.

**Stage D: living city.** Realistic trees and plants with LODs and wind; traffic with realistic vehicles, okada, keke, danfo and BRT; pedestrians and hawkers by area and time; weather and day-night; sound.

**Stage E: travel.** The ride-hail app in the phone, stops and routes, fares by distance, traffic, time and fuel price; the driven cinematic trip scene with traffic and random events; own vehicles (buy, park, fuel, repair); ferries, helicopters, flights between Lagos and other cities.

**Stage F: other cities.** Abuja, then Port Harcourt, Kano, Ibadan, built by the same pipeline with their own area styles.

**Stage G: the rest of the life sim.** Body (injuries, illness, medicine, hospital), power and water systems, farming and cooking depth, stress and skills, careers and business, relationships, status and politics, light crime and risk, key NPCs with schedules and memory.

**Throughout:** adverts (in-world boards on roads, an ad API, consent and privacy handled), dev tools behind an admin flag, a Graphics setting and a per-device performance budget, and a mid-range-Android check at the end of each stage.

## 5. Multiplayer design (so the build matches)

- **Authority:** the server owns money, items, needs, positions and time. Clients predict movement and show results; the server validates every move against the same navigation data (the building plans and district walk grids already exist as shared pure code).
- **Clock:** one real-time world clock. Everything already based on game minutes (rent, power cuts, deliveries, news) keeps working; the single-player time-skip stays an offline-only convenience. Long activities (sleep) run in real time, or you log off in bed and are caught up from real time away.
- **Rooms:** a city instance holds 20 to 50 players; players are placed by area or party; chunks within view are streamed to each client; interest management by chunk.
- **Persistence:** Supabase Postgres for accounts, characters, ledger and homes; the server holds the live world in memory and writes through.
- **Safety:** rate limits, server-side validation of every action, no trust in client money or items, chat filtering and reporting.
- **Costs:** one small Fly.io machine for a first test; scale by adding machines per city instance.

## 6. Map data pipeline (Stage C detail)

1. Extract Lagos from OpenStreetMap (licence: ODbL, credit shown in the app and docs).
2. Clean: classify roads (motorway, primary, residential, track), keep bridges and tunnels, water polygons, land use, buildings (footprint, levels, type).
3. Project into metres, apply the compression factor, split into 32 m chunks plus road-graph and water layers.
4. Generate per-chunk files (binary, compressed) and a manifest; publish to the CDN; the game downloads what it needs and caches it.
5. At runtime the existing streamer, LODs, building generator and interior plans are fed by these files instead of the seeded test district.
6. A validation pass checks the same things the district tests check today (no overlaps, walkable roads, reachable doors).

## 7. Risks

- **Data size and load time:** the whole of Lagos is large; chunks, LODs and aggressive simplification are mandatory. Budget is checked on a mid-range Android phone each stage.
- **Realistic character quality:** AI-generated human models need clean topology and rigging; the pipeline has to be proven on a few characters before committing to a full wardrobe.
- **Real-time multiplayer with slow-moving needs:** the real-time clock makes needs and activities slow; balance has to be redone for it (activities are real minutes, not skipped).
- **Scope:** this is a multi-month project; each stage must be playable on its own and each ships behind a flag.
- **Advertising:** needs a consent flow and an ad provider; designed in from the start, switched on later.

## 8. Next steps decided on 2026-10-06
1. **Online only.** The offline single-player page goes away. The server becomes the owner of each player's life (needs, money, phone, inventory), the same `game-core` rules run there, and the client only sends intentions. Order: (a) the server holds a `GameState` per connected player and ticks it in real time; (b) the map world gets the HUD, phone and use-actions of the house page; (c) accounts (Supabase) own a save; (d) the house page and the offline route are deleted.
2. **The real Lagos map.** `tools/osm/fetch.mjs` downloads OpenStreetMap data for an area (needs internet access to Overpass, which the cloud sandbox cannot reach: run it on a normal computer and commit `assets-src/osm/<area>.json` or upload it). Then a converter turns it into chunk files with polygon buildings (extruded footprints with height from `building:levels`), curved road ribbons, water and parks; the engine's lots, roads and nav become polygon-based (today they are axis-aligned rectangles). Cartoon/realistic is a setting that chooses the material set.
3. **Settings** (done): presets, resolution, frame cap, shadows, bloom, lights, draw distance, crowd, cartoon/realistic look.

## Roadmap after the real map (from the owner, in order)
1. Finish the map: real-building look (materials + Lagos details), water done, streets done.
2. Shops, markets and services that work like real Lagos: Balogun-style traders, buy/sell, prices, opening hours on the real Lagos clock, jobs, fuel stations, banks, pharmacies, food.
3. Opening movie: "Alexion Studios presents", a plane descending over Lagos, landing, then the player spawns at the airport (Murtala Muhammed arrivals). The airport is on the mainland (Ikeja), outside the current island map, so: arrivals hall as its own interior, a short taxi ride cutscene to Lagos Island.
4. GTA-style third-person controls (WASD / joystick, bindable keys, PWA), then vehicles (cars, danfo, okada), then voice (calls, proximity, radio) and roleplay roles.
5. Interiors one at a time in a hidden admin Playground; the airport arrivals hall and a real shop are the first two.
Decided: real Lagos clock; slow real-time needs; social apps are separate apps that look like the real ones (LifeGram, LifeChat, Chirp, LifeTok), photos only from the in-game camera, Supabase storage, report/block + word filter + admin panel.

## Decisions, round 1 (inventory, shops, objects)
- Inventory: a grid by item size, like Project Zomboid / Tarkov. Every object has a width x height (cells), a weight, and containers (pockets, bag, backpack, fridge, wardrobe) each have their own grid.
- Shops: a shop counter screen in the world (walk up, tap the counter/trader), one screen reused by every shop, with prices and stock.
- Objects: real sizes in metres; furniture is placed on a grid with rotate in an edit mode; big items can block doors.
- Build order for the screens: inventory + bag, fridge and cooking, shop counter / buy screen, wardrobe and clothes.
- Also done on request: no game state is saved on the device (server only); the phone charges only beside a socket.

## Decisions, round 2 (shops, food, utilities, work) and the owner's order
- Markets: bargaining; prices change with the (real) day; traders have limited stock that runs out. Supermarkets: fixed prices.
- Food: recipes with real ingredients (rice, beans, stew, egusi, jollof), spoilage; the fridge only keeps cold with power.
- Utilities: NEPA outages for everyone, generators and fuel, water (borehole, sachets), data and airtime as real costs.
- Work: a PC or laptop at home that opens a real-looking computer UI (several laptop types, a working desktop with windows and apps) and work on it is a mini-game; also street hustles (trading, okada, food stalls), shifts at buildings, phone gigs, and player-run businesses.
- Every object is interactable (windows, light bulbs, doors, taps...).
- Order from the owner: make the Lagos map better first, then these systems; later a deep dive on realistic characters and animation (GTA 6 online beta feel); the installed PWA should feel like a native app.

## Decisions, round 3 (map, characters, app feel, performance)
- Map first: street life and props (danfo, keke, okada, traffic, vendors, kiosks, generators, billboards, wires, potholes, drainage), nature and ground (trees, palms, grass, mud, puddles, shoreline with boats and jetties), sky, light and weather (real clock, clouds, harmattan haze, rain, wet roads, lightning), and landmarks built properly (Cathedral, Tafawa Balewa Square, CMS, the bridges, Marina).
- Characters: search the whole web for the best semi-realistic, highly customisable character (free licence), and make customisation much deeper. Houses and buildings get better exteriors that depend on the house kind. On registration the player lands at the airport: the arrival cinematic and animations differ by background (nepo, middle, lapo). Then they walk by tap or by control.
- PWA: install to the home screen, full screen, own icon and splash; game files cached for fast loading (play still needs internet); joystick + look pad + action buttons the player can move, resize and re-bind; haptics and sound cues.
- Performance: looks great on mid phones, quality drops automatically on weak ones.

## Decisions, round 4 (arrival, customisation, homes, scale)
- Arrival by background: nepo = private jet / first class with a driver waiting; middle = economy flight, taxi or a friend; lapo = cheap flight or bus, tired, haggling for transport. Cinematic, with different animations.
- Customisation: face and body sliders; hair, braids, beards, makeup, tattoos; clothes and traditional wear; voice and walk style. Voice comes with the chosen sex (male or female), and the creator warns players to choose their real gender and respect others.
- Homes: a different home per background, in the world, near the player. Nepo: a fully furnished duplex. Middle: a mid-furnished flat. Lapo: a rented room. The house is a building in the Lagos map (not the separate green-island scene): you walk out of your own door into the street. Same for every building: walk in and out. Later (2.5D/3D): walk to your home, or fast-travel by transport with a cutscene to your place.
  - How: each player's interior is a private instance (like GTA online apartments); the door is on a real home building in a zone that fits the tier (nepo east/Ikoyi, middle central, lapo dense old Lagos); exiting puts you at that door.
- More cinematic everywhere.
- Scale: about 100 players for testing, after the features are done; more engineering later if feedback is good.

## Decisions, round 5 (order, roleplay, voice, launch)
- Build order: 1) homes in the city + the airport arrival film, 2) GTA-style controls + installable app, 3) street life (props, traffic, weather).
- Roleplay: police, courts and jail as real roles; crimes and consequences; safe zones and fair-play rules (rules screen at login). Not peaceful-only.
- Voice (server to plan for): phone calls between two players, proximity voice, push-to-talk radio channels.
- Launch: free test with friends (accounts, 100 players max); money decided later.

## Round 6: the pivot to 2.5D (decided with the owner)
- The full-3D city was costing more than it gave (about 10 fps in software rendering, mixed art styles, heavy on phones). Decision: **isometric 2.5D, painted / illustrated, warm Lagos colours.** The 3D renderer, OSM map and building generator are parked in the repo; the server, sim, kitchen, bag, phone, accounts and PWA all stay.
- Pipeline: the existing 3D models are baked into painted isometric sprites (`tools/sprites`), the game draws images on a 2D canvas (`apps/client/src/iso`). Preview at `#/iso`.
- Phases, one at a time, each signed off by the owner before the next:
  1. Art direction proof: the player's room (done as a proof; awaiting sign-off).
  2. Home life done properly (needs, kitchen, bag, sleep, bathroom, buying things, house edit mode).
  3. Moving between places: painted scenes, fast travel with a short cutscene, a stylised map picture.
  4. Visiting friends: invite someone to your house, chat; replaces the shared full map.
  5. Work and money: laptop job mini-game, shops and markets.
  6. Social apps (LifeGram, LifeChat, Chirp, LifeTok).
  7. Customisation and wardrobe.
  8. Roleplay and voice.
- Scripted texts from made-up people are switched off until real player chat exists.
