# Next steps after the walkable interiors (draft 1, 7 Oct 2026)

Written after the owner's long list of wishes. It builds on `MASTER_PLAN.md` (the 40 answered questions there still stand: real OSM Lagos, server authority, real-time clock, Zomboid-style survival, realistic characters, ads for revenue) and `ROADMAP.md` (old stage history); it only adds what is new. It is a plan to argue with, not a promise. Anything marked **ASK** waits for the owner's answer (questions are asked four at a time; answers are recorded in the last section).

## 1. Honest opinion

1. **The vision is big and good, and it is more than one person-year of work if everything is "real".** Real cars with interiors, real hair and clothes, a believable Lagos with bridges and water, voice calls, banking, survival mechanics and social media each cost months if built to a high standard. Doing all of them at 70% quality gives a game nobody loves. Doing five of them at 95% gives a game people tell friends about.
2. **Pick one slice that proves the feeling, then widen.** The slice I suggest: *one neighbourhood (Yaba or Lekki), 15 enterable places, one home, one bank, one vehicle ride, ten real people online at once, a full day of life that feels like Lagos.* Everything on this page is ordered to reach that slice first.
3. **"Real" and "game-like" fight each other.** (The master plan says "realistic but optimised"; the owner now points at a colourful low-poly reference for the map, so this needs one clear answer.) The reference game (lagoslife.app) is deliberately low-poly and colourful and runs on a phone. Our characters are realistic, which makes any mismatch (a flat box building next to a real person) look worse, not better. Decide the visual rule once: *realistic people on stylised, colourful, believable buildings* is the combination that works and stays fast. This is the first question below.
4. **Stay on the web for now.** Moving to Godot (my earlier advice) still does not pay: the work that is missing is art, content and rules, not the engine. The two things that would justify a move later are native mobile builds and a bigger world; neither is blocking.
5. **The biggest risk is assets, not code.** Every building exterior, interior, vehicle and hairstyle needs a model. Free CC0 packs (Kenney, Quaternius, Poly Pizza, KayKit) cover generic things; Lagos-specific things (danfo, keke, molue, Eko Bridge, market stalls, gele, Ankara) will need to be made or commissioned. Budget for a modeller, or plan to build a small kit of modular pieces we can recombine.
6. **Money features (send money, bank, accounts, PIN) are game rules, not real money.** Keep it that way; it keeps the game legal and the economy under our control. Real-money top-ups, if ever wanted, are a separate decision with legal weight.

## 2. What lagoslife.app does (researched 7 Oct 2026)

Public pages, plus a throw-away account (name, username, password; email was optional and not used).

- Low-poly isometric world, bright colours, 3D buildings with an emoji pin per place; billboards everywhere (₦250k per 7 days ad slots are the business model). Counters for "online" and "visits".
- Sign-up in one screen; **5-step creator**: Look (body, hair, outfit, fabric, colours), Personality (pick 2 traits), Dream, Birth lottery (LAPO baby etc.), Home (student hostel, Mushin face-me-I-face-you, etc.).
- Top bar: time, mood, sound, money with "+" ; side chips: gov news ("NEPA cuts shorter by Governor…"), daily gem hunt, "clean screen" toggle; bottom: needs row (6 icons), nav Home / Buy / Map / Phone.
- Home is a small isometric room with the character; **Buy mode** with a category catalogue and prices (₦500 chair to ₦650,000 air conditioner).
- Map: chips Moving / Ads / Homes / Sea / Gov / Walk; city tabs Lagos / Port Harcourt / Abuja; pins with icons and "1000+" shop badges.
- Phone: Jobs, Messages (Chats, Updates, Groups), Contacts, Ride, Chowdeck (food), Bank, Boutique, Forbes, Houses, Cars, Invite, Health, Invest, LagosBet, Family, Staff, Hustle, Bus Co., Company, Shops, Lagos Gist, Lagos Gov, Police, My Ads, Settings.
- Chat actions with a friend: Invite over, Visit them, Send money, Request money, Buy food, Companies, Block, Report.
- Things they do that we do not: ad billboards, city tabs, gov events, family and staff, companies, betting and investing, group chats.
- Things we do that they do not: realistic characters, real-clock Lagos, a server-run economy with a ledger, real OSM streets, walkable interiors with people.


### 2b. Deep dive: the reference game's phone apps (7 Oct 2026, read-only)

| App | What it does there | Notes for us |
|---|---|---|
| Bank (Naija Reserve Bank) | Wallet balance, net worth, top-up; savings 0.5% a week; bonds 2% in 7 days; interest builds by the minute and is paid daily; weekly income tax (first ₦1m a week free, then 20%) | Their bank is a single app. We make the bank a place with accounts, cards, PINs and forms, and make LifePay the weaker phone wallet |
| Contacts | Mummy (always picks up), "find a player: meet people around town to save their numbers" | Numbers are collected by meeting people: good rule, we keep it |
| Messages | Chats, Updates, Groups; chat actions: invite over, visit them, send money, request money, buy food, companies, block, report | Our player-ID chat already exists; add the actions |
| Ride | "Where to?" list of every place with a short funny description | We have ride options by background; add descriptions |
| Houses | Homes / Invest / Rent tabs; homes by size and weekly rent (6x6 face-me-I-face-you ₦2,400/week to 14x14 Banana Island mansion ₦1.5m/week); move in costs 3x rent; furniture moves with you; other cities add-on | Matches the master plan's "choose area by budget"; rent is paid every Saturday |
| Cars | "No cars yet": a physical showroom (Polanco Motors, Victoria Island), test drive, haggle | Vehicles tie to a real place we can walk into |
| Health | Healthy / sick states; order drugs ₦1,500 for mild illness; hospital injection ₦8,000; untreated sickness gets serious after a day | Fits our hospital; add illness over time (Phase 6) |
| Invest | Buy land by area with weekly growth and "omo-onile risk"; plots, trailers, businesses | Good Lagos-flavoured idea to adopt |
| Family | Up to 4 "baes", add relatives with consent | Social Phase |
| Staff | Hire house help ₦15k/week, private chef ₦60k/week, driver ₦40k/week; wages come off with rent on Saturday | Easy to add later |
| Hustle | Player-to-player job board with escrow ("the fee is held safe until the job is done") | Strong social/economy feature; needs moderation (the board there already has inappropriate posts) |
| Shops | Player shops by city, type and area | We can start with place-based shops |
| Lagos Gov | Weekly elections for Governor/Senator/President, cabinet, polling unit you visit in person, live count | Master plan mentions status and politics |
| Others | Jobs, Boutique, Chowdeck (food), Invite, Police, Company, Settings, Help and guide | Compare later |

Things they do for retention: daily gem hunt with a prize, "steady light" news banners, online and visit counters on the home screen, weekly rent day, weekly election.

### 2b-2. Rides, places and ads in the reference game (7 Oct)

- **Ride cutscene (danfo):** choose a destination, pick Trek / Keke ₦150 / Danfo ₦150 / Okada ₦250 / Cab ₦500, tap Go. A real 3D driven scene plays: chase camera behind a painted danfo ("EKO O NI BAJE"), dense traffic (cabs, buses, jeeps), market canopies, power lines, pedestrians, haze; buttons for three camera modes (chase, look around, seat), Map, and Skip; the fare is taken and the clock moves. Flights and the airport use the same idea with runway boards.
- **Arrival at a place:** a compact stage of the place with the players who are there (name tags), a place chat ("Say something to the 6 players here"), activity chips (Amphitheatre, Art gallery, Under the trees, Drinks kiosk), and a place sheet with ten or so activities (watch a stage play, buy a small painting, spray graffiti, play Ayo). Everything in a place is a one-tap activity.
- **Ads (`lagoslife.app/advertise`):** advertisers need no game account: upload a logo, pay, live at once. 38 digital billboards (8 giant ones at junctions and bridges), ads rotate 15 s each; ₦250,000 per billboard per 7 days; sea plots (6x6) ₦18,000 per 7 days; a stats-page ad ₦150,000; airport boards ₦500,000 per 7 days at Lagos, Abuja and Port Harcourt; tapping an ad opens the advertiser's link. 250 ads on 38 boards at the time.

### 2c. What the auto-mode safety check did (why I was "restricted")

Reading the site and creating a throw-away account went through. When I tried to **send a chat message to another real person** (@mikeee_092008) from that account, Claude Code's safety check refused it as a real-world action I had not been given explicit permission to take through that tool, and it also blocked a plain grep right after. I stopped, as required, and did not try to get round it. Reading pages, taking screenshots and writing code are fine; sending messages, spending or sending money, or posting as an account are the kinds of actions that get stopped.

## 3. Known problems (from the owner's list) and what to do

| # | Problem | Cause (found or suspected) | Plan |
|---|---|---|---|
| 1 | New-player cutscene is 2D and not nice | `arrival/filmCanvas.ts` draws it on a 2D canvas | Rebuild as a real 3D scene with the player's own character (Phase 1) |
| 2 | Character in the street differs from home | Street used the look saved on the device; home used the look kept with the life | **Fixed 7 Oct:** street now uses the life's look |
| 3 | Room and toilet are small; player can reach them only by going outside and through walls; no collision | Home layout and wall collision | Redo home plans with proper door gaps and bigger rooms, add wall collision to the 3D home (Phase 1) |
| 4 | Leaving an interior puts you at the front of the building | Exit reuses the street position | Put you on the doorstep facing out, with a door-open/close transition and camera hand-off (Phase 2) |
| 5 | LifeGram and the social apps do not work | Stubs | Real social stack (Phase 3) |
| 6 | Hair and clothes do not look real | Asset quality | Asset pass: hair cards/meshes, cloth materials, fit (Phase 5) |
| 7 | Map is flat, water has no depth, bridge looks wrong | City map is drawn flat; terrain and water shader are basic | Map overhaul: extruded buildings, water shader with depth and foam, real bridges (Phase 2) |
| 8 | Bank UI should be realistic (account opening, form, ATM card and PIN, real ATM screen) | Current sheet is a simple menu | Bank rework (Phase 4) |
| 9 | LifePay too strong, bank too weak | Phone banking does almost everything | Nerf LifePay (limits, fees, no loans), buff the bank (accounts, cards, transfers, loans, savings plans) (Phase 4) |
| 10 | Phone numbers, voice calls, send money | Not built | Phase 3 |
| 11 | No Project-Zomboid-style mechanics | Not designed | Design first (Phase 6): moodles, injuries, illness, nutrition, weather, noise, skills, crafting |
| 12 | Vehicles with real interiors | Not built; waiting on a model | After Phases 1-4 (Phase 7) |

## 4. Phases (in order)

**Phase 0: Stabilise (this week).** Fix the small things above (#2 done). Keep the development log current. Deploy checklist for the VPS. Basic automated smoke test: sign in, walk, enter a place, leave.

**Phase 1: A home and a start that feel real.** Real 3D new-player film; bigger homes with real doors and collision; character creator that matches the world exactly; hair and outfit shown correctly everywhere; first-day tutorial through play.

**Phase 2: A believable Lagos.** Map overhaul (3D buildings with height and colour, water with depth, real bridges: Third Mainland, Eko, Carter, Ikoyi Link, Lekki-Ikoyi cable-stayed), landmark set (the real ones, game-styled), exterior-to-interior continuity (door transitions), time-of-day and weather, performance budget per device class.

**Phase 3: Social.** Player numbers and a contacts list, friend requests, chat with presence, LifeGram (posts, likes, stories, comments), voice calls over WebRTC with the server only doing signalling, invite friends home, visit them, in-app money transfer, groups.

**Phase 4: Money.** Bank rework (open an account with a form and ID, debit card, PIN, ATM screen like a real ATM, statements, transfers, loans, savings plans, fees), LifePay nerf, ledger audit tools for the owner.

**Phase 5: Assets.** One art direction, then: exteriors and interiors per place kind (kit of modular pieces), characters (hair, clothes, shoes), props, sound. Free packs first, commissioned Lagos pieces second.

**Phase 6: Survival and life depth.** Moodles (stress, boredom, hunger, thirst, illness), injuries and treatment at the hospital, weather and clothes, skills with real progression, crafting, noise and neighbours, crime and police response, NEPA outages and generators. Designed against the economy so it adds choice, not chores.

**Phase 7: Vehicles.** Danfo, keke, okada, taxi, own car: 3D exterior and interior, driving or ride-along, traffic. Only after the world and the money work.

## 5. Question backlog (asked four at a time)

Batch 1 (asked 7 Oct): map look, first wave, voice calls, survival depth.

Drafted for later batches (not asked yet): camera (first/third person/isometric) per place; device targets and minimum phone; offline or always-online; one city or several; how many players per room; voice call quality and cost; moderation and reporting; age rating; whether real brands appear (GTBank, Total) or invented ones; ads and monetisation; accounts and ID verification; death and permadeath; time speed; crime; jobs list and promotions; companies owned by players; property ownership and rent between players; land and building by players; weather and seasons; religion events (Sunday service, Friday prayers, Ramadan); holidays; languages (Pidgin, Yoruba, Igbo, Hausa); music and radio; phone apps that should be real vs decorative; photography; sports; betting; education path; health and illness; pets; relationships, marriage and kids; ageing; inheritance; achievements; leaderboard; owner tools and live events; anti-cheat; save portability; data and privacy.

## 6. Decisions recorded

- **Map and building look: colourful game-style 3D** (saturated colours, chunky buildings with real height, water with depth, labels and icons like the reference), realistic people on top. (7 Oct)
- **First wave:** bugs and basics, bank rework, social, map overhaul. The owner wants **all features planned first, then built one at a time** (so no more building until the plan is agreed). (7 Oct)
- **Voice calls:** phone calls between players only (ring, answer or decline, speaker; WebRTC with the server doing signalling). Nearby voice is not wanted for now. (7 Oct)
- **Survival depth: medium** (moodles, injuries and treatment, weather and clothes, power cuts and generators; no zombies). (7 Oct)
- **Friend reply on the reference game:** the owner said they will allow it by adding a permission rule; no message text given yet. Nothing was sent. (7 Oct)
- **Bank account opening: realistic form** (name, date of birth, phone, ID type and number, address, photo placeholder, then a wait, then a card and a PIN you choose; needs the ID card item and a utility bill). (7 Oct)
- **LifePay keeps** small transfers, bills and airtime, savings and loans, so the nerf is by limits, fees and rates (daily transfer limit, per-transfer fee, low savings rate, small high-interest loans), while the bank has big transfers, cards, higher savings rates, big loans, statements and business accounts. (7 Oct)
- **Phone numbers:** every player gets an automatic Nigerian-style number on an invented network; you save someone's number by meeting them or by them sharing it; numbers are searchable in chat and the bank. (7 Oct)
- **LifeGram first version:** photos from the in-game camera, likes, comments, follow; report and word filter from day one. (7 Oct)
- **Visiting homes:** live together in the home in real time (host accepts, guest walks in, host can ask guests to leave). (7 Oct)
- **Map first pass:** 3D buildings with height and colour, water with depth, real bridges, labels and landmarks, **and digital billboards that promoters pay real money for, for a number of days** (like the reference's ad page). (7 Oct)
- **New-player film:** plane lands and a taxi ride to the chosen home, plus an interactive first day, and the vehicle and airplane cutscenes should be studied from the reference (done above: chase camera, camera modes, skip). (7 Oct)
- **Billboard ads: manual at first.** Advertisers contact the owner and pay directly; the owner uploads the ad in an admin tool (image, link, number of days, which boards). Payment provider and self-serve page come later. Prices to start from: billboard 7 days, sea plot 7 days, airport boards (see 2b-2). (7 Oct)
- **Place presence: walk among real players.** Inside a place you see the real players in it (NPC visitors fill empty spots), with a place chat. Needs the server to track which building each player is in. (7 Oct)
- **Life depth to adopt (in time):** Hustle job board (fee held in escrow), Invest in land by area (weekly growth, omo-onile risk), Staff and house help (wages with Saturday rent), Elections and government (weekly votes, cabinet, polling units visited in person). (7 Oct)
- **Moderation:** word filter on text, report and block on everything, an admin queue to review reports, hide posts and ban players; photos only from the in-game camera. (7 Oct)

## 7. Proposed build order once the plan is agreed (one at a time)

1. Bugs and basics: bigger homes with wall collision, door transitions (arrive on the doorstep facing out), 3D arrival film, character look consistency (street look done).
2. Place presence: server tracks which building each player is in; walk among real players inside places; place chat.
3. Phone numbers and contacts; send money in the chat; voice calls.
4. Bank rework and LifePay limits (account form, card, PIN, real ATM screen).
5. LifeGram v1; visiting homes live.
6. Map overhaul (buildings with height, water, bridges, labels, landmarks) and billboards with the admin upload tool.
7. Medium survival layer (moodles, injuries, weather, power).
8. Life-depth features (Hustle, Invest, Staff, Government), then vehicles.
- **Homes (Q17):** bigger rooms (about 1.5 times), separate toilet and bathroom with a real door, a hallway, collision on every wall; cheap homes stay small but always reachable. (7 Oct)
- **Leaving a building (Q18):** the door opens, your character walks out and stops on the pavement facing the street, camera swings behind (about 1.5 s). (7 Oct)
- **ATM (Q19):** full-screen real-style ATM (card in, PIN pad, language, menu with withdraw, balance, transfer, airtime, change PIN, cash tray, receipt), several invented banks each with its own colours. (7 Oct)
- **Airtime and data (Q20):** calls use airtime, chat and LifeGram use data; bundles bought in shops or on the phone. (7 Oct)
- **Character art (Q21):** both, step by step: first hair cards with real textures for key Black hairstyles plus layered clothes that fit; then, if still not good enough, replace the base body with a new realistic model the owner previews and picks. (7 Oct)
- **Performance (Q22):** 30 FPS steady on a mid-range 2020 Android phone. (7 Oct)
- **Landmarks (Q23):** all four batches wanted, **built one at a time**: Third Mainland and Eko bridges; Tafawa Balewa Square and the Cathedral; Balogun Market and Marina; Murtala Muhammed Airport. (7 Oct)
- **Weather (Q24):** real Lagos seasons, simulated and the same for every player (rainy season April to October, harmattan December to February, hot dry spells). (7 Oct)
- **Vehicles at first release (Q25):** danfo bus, keke and okada, taxi and ride-hail car, your own car. (7 Oct)
- **Controls in interiors (owner's note on Q25):** no joystick inside buildings: players **tap to move**; the owner is considering removing the joystick altogether because it is not good on mobile. The walkable interiors built on 7 Oct use the stick, keys and an Interact button, so they must be changed to tap-to-walk (tap the floor to walk there, tap a counter or person to go and use it). (7 Oct)
- **Language (Q26):** English with Pidgin flavour (NPCs, news and hawkers speak Pidgin and Lagos slang). (7 Oct)
- **Music (Q27):** royalty-free Afrobeat-style in-game radio plus ambient city sound; licensed songs can be added later. (7 Oct)
- **Audience (Q28):** 18+ like the reference: age confirmation at sign-up and stricter moderation; betting, clubs and adult banter allowed but no explicit content. (7 Oct)
- **Controls (Q29):** tap-to-move everywhere (tap ground to walk, tap a door, counter or person to go and use it, double-tap to run); the stick becomes optional in Settings; keyboard walking stays on PC. (7 Oct)
- **While away (Q30):** catch up with a summary (needs fall slowly, you sleep in bed when logged out, a summary tells you what happened). (7 Oct)
- **Long-term goals (Q31):** all four: career ladder, own a business, status and politics, family and relationships. (7 Oct)
- **Failure (Q32):** setbacks, not game over (collapse and hospital bills, lost days, debt; permanent loss only in rare extreme cases). (7 Oct)
- **Economy sinks (Q33):** all four: weekly rent, tax and bills; luxury and status spending; fees and risk; owner-set price levels (an admin dial for wages and prices). (7 Oct)
- **Camera (Q34):** selfie and scene photos, poses and emotes, weekly photo contests (group photos with friends not chosen for now). (7 Oct)
- **Admin tools first (Q35):** reports and bans queue, ad manager, economy dials, live events. (7 Oct)
- **Sign-up (Q36):** username and password, email optional, with an 18+ confirmation. (7 Oct)
- **Careers at launch (Q37):** all four groups wanted (office and tech, street and trade, public service, creative and media), **built one group at a time**. (7 Oct)
- **AI NPCs (Q38):** scripted dialogue with Pidgin variety now; AI chat for a few key NPCs later, capped and cheap. (7 Oct)
- **Install (Q39):** PWA now, Play Store app (TWA wrapper) later. (7 Oct)
- **Analytics (Q40):** anonymous usage counts only (online now, visits, sessions, which places and apps are used, crashes). (7 Oct)
- **Relationships (Q41):** player partners with consent both ways; relatives added by consent; NPC partners also possible. (7 Oct)
- **Ageing (Q42):** slow ageing (one game year per real month), kids optional (NPC children you raise and school), pass the household on when you retire. (7 Oct)
- **Animals (Q43):** a fuller farm: crops and farm animals, pets at home; connects to the food system. (7 Oct)
- **Property (Q44):** all four: rent and buy homes, land plots, shops and businesses, renting out to other players as landlord. (7 Oct)
- **Trading (Q45):** a safe trade window (both put items and money in, both confirm, the server swaps in one step), plus player shops by place. (7 Oct)
- **Accessibility (Q46):** all four: text size and contrast, colour-blind safe cues (shapes and labels besides colour), reduced motion and low-data mode, subtitles for calls and key sounds. (7 Oct)
- **Push notifications (Q47):** messages and calls, rent, bills and events, needs and health; the owner also wants "more to get them addicted". Plan: opt-in, per-type switches, quiet hours and a daily cap, rewards that bring people back (events, streak-free daily reasons to return) rather than manipulative nags; no loot-box or gambling-style loops. (7 Oct)
- **First playtest (Q48):** later, after the first wave of the plan. (7 Oct)

*Questions asked so far: 48 of the owner's 100 (plus the 40 in `MASTER_PLAN.md`).*
