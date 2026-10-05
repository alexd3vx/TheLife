# Gameplay Systems

How the life simulation works. The rules live in `packages/game-core` (pure TypeScript, unit-tested, no rendering) so the same code runs offline in the browser now and on the authoritative server later. The play screen (`apps/client/src/play`) only draws the result and moves the character.

## Who you are: character and background

New life = `#/create` (the first time you press Play, and after "New game"): **1 Look** (body, skin tone, hair, eyes, clothes, with a live 3D preview) then **2 Background**. The background is *rolled* (a short slot-machine spin over **Lapo / Middle / Nepo**, one re-roll) from 11 written backgrounds in `packages/game-core/src/profile.ts`, weighted so rich is rare. It sets, with a name from the matching region:

| | Lapo (poor) | Middle | Nepo (rich) |
|---|---|---|---|
| Starting money | ₦4,000-15,000 | ₦40,000-110,000 | ₦350,000-1,000,000 |
| Rent | ₦14,000 a week | ₦14,000 a week | none (family house) |
| Allowance | none | none | ₦50,000-70,000 a week from a parent |
| Phone | basic, cracked | mid | flagship |

It also gives a few flavour lines and a skill head-start. Step **3 Traits** is the player's choice: pick 2 strengths, or take one weakness to unlock a third (`traits.ts`); traits change need decay, pay, grocery prices or starting skills. It is saved with the game (old saves without one go through the creator). The phone feature builds on the phone tier.

## The loop

NEED → DECISION (tap something) → ACTION (time passes, the body animates) → RESULT (needs, money, skills change) → CONSEQUENCE (warnings, rent, collapsing) → NEW OPPORTUNITY.

## Time

- One game minute passes per real second while walking around.
- Long activities skip time: sleeping runs at 40 game-minutes per second (a full night is about 10 real seconds), working at 8, a meal at 4. The numbers are data in `actions.ts`.
- The world clock drives the sun, the sky and the house lights (dusk at ~18:00, night from ~20:00).
- Time keeps passing while you're away (see "While you were away").

## Needs

Five needs, each 0-100 (100 is good):

| Need | Falls per hour | Restored by |
|------|----------------|-------------|
| Hunger | 4.2 | snack, cooked meal |
| Energy | 3.6 | sleep (decay stops while sleeping) |
| Hygiene | 2.2 | shower (full), brushing teeth (a little) |
| Bladder | 6.5 | toilet |
| Fun | 3.0 | TV, radio (dancing), reading |

**Mood** is a weighted average (energy 30%, hunger 25%, fun 20%, hygiene 15%, bladder 10%). **Performance** (0.5-1.2) is derived from mood, with extra penalties for being exhausted or starving, and multiplies work pay.

### Consequences

- A need below 25 triggers a warning once per dip.
- Energy under 30 or hunger under 10 slows walking; energy under 15 slows it more.
- Hunger at 0 drains energy faster.
- Bladder at 0: an accident (hygiene and fun drop, bladder resets).
- Energy at 0: the character collapses and sleeps where they stand for several hours.
- Work pay is lower when miserable; work refuses to start when too tired.

Actions refuse to start with a clear reason: "You're not hungry", "The fridge is empty. Order groceries first.", "You're not tired enough to sleep.", and so on.

## Activities (data in `packages/game-core/src/actions.ts`)

| Action | Where | Time | Effect |
|--------|-------|------|--------|
| Snack | fridge | 10 min | uses 1 portion, hunger +25 |
| Cook | stove | 30 min | uses 2 portions, makes 1 meal |
| Eat a meal | any dining chair or the table | 25 min | uses 1 meal, hunger +65 |
| Watch TV | sofa, armchair, TV | 60 min | fun +32 |
| Sit | any chair, stool, bench, ottoman | 30 min | energy +6, fun +2 |
| Dance to the radio | radio | 30 min | fun +16 |
| Read | bookshelf | 45 min | fun +20, knowledge skill |
| Work | desk, monitor, laptop, keyboard | 2 h | earns ₦1,200/h × performance × skill; energy -14, fun -10; computer skill |
| Sleep | bed, nightstands | until rested | energy to 100 |
| Toilet | toilet | 6 min | bladder full |
| Shower | shower | 15 min | hygiene full |
| Brush teeth | bathroom sink, mirror | 3 min | hygiene +8 |

Activities are slow enough to watch (a night's sleep is about 28 real seconds, a shower 10) and show a progress ring only when they are long enough to need one.

Cancelling an activity keeps the effects so far (and the ingredients used), but a cooked meal is only made if you finish.

Skills grow by doing: computer skill raises work pay by 8% per level.

## The phone (`phone.ts`, `phoneData.ts`; screen in `apps/client/src/phone/`)

Opened from the 📱 button on the play screen (a phone-shaped frame on desktop, full screen on phones). It is real game state (`GameState.phone`, saved and validated), so the same rules will run on the server.

- **Three models, three looks** (your background gives you one; you can buy another in LifeShop): **LifePhone Go** (micro-USB, LCD, slower app animations, no LifeJobs/LifeMaps, no savings or loans, long standby), **LifePhone Plus** (USB-C, AMOLED 90Hz, all apps), **LifePhone Max** (LifeLink fast charging, dynamic-island look, widgets, fastest animations, shortest battery).
- **Battery:** drains faster while the phone is open than on standby; at 0% it is dead until plugged in. **Chargers** have a port type (micro, USB-C, LifeLink) and a speed; a charger only works if it fits the phone, and the phone caps the speed. A **power bank** charges from the wall when there is power and charges the phone anywhere. **Power cuts** are deterministic per day (some announced in LifeNews, some not), and a water-and-power bill unpaid for two weeks cuts the wall power too. Generator and solar will plug into the same `wallPower` check later.
- **Data and airtime:** apps use a little data when opened (LifePay works without data, like USSD); calls cost airtime. Both are topped up in LifePay.
- **LifeChat:** written messages from family, a friend (Kola), your landlord and alert senders arrive on set days with quick replies (AI later). Choices have effects: lend Kola ₦2,000 and he pays ₦2,200 back three days later. Calls cost airtime and lift your mood.
- **LifePay:** balance and history (the ledger), pay rent and the weekly bill (or leave auto-pay on), send money to people, **savings** (1% a week, own ledger account) and **loans** (10% fee, limit by background, 5% a week after two weeks) on Plus and Max, airtime and data bundles.
- **LifeShop:** groceries (15% off on promo days, shown in LifeNews), chargers, power bank and phones, delivered after a delay (₦500 delivery under ₦10,000). **LifeJobs:** apply to a job; the answer arrives half a day later and depends on your skills; a job pays a weekly retainer and boosts what work pays. **LifeNews:** a few headlines a day, deterministic. **LifeMaps:** a simple "around you" list until the real map exists.
- Not yet: the character does not hold the phone while using it, charging does not need walking to a socket (plugging in works anywhere), no camera or social feed.

## Money

- **Double-entry ledger** (`ledger.ts`): every change is a transfer between two accounts (`player`, `mint`, `sink`). The sum of all accounts is always 0, the player can never go below ₦0, and a saved game whose ledger doesn't balance is rejected. This is the base for the audit and anti-cheat rules in `TECH_ARCHITECTURE.md`.
- New money enters only from the mint (starting grant, wages); spending goes to the sink (groceries, rent).
- Start: ₦12,000. Groceries ₦1,800 for 6 portions. **Rent ₦14,000 every 7th day at 08:00**, taken automatically when there is money (or paid from LifePay if auto-pay is off; then the late fee comes a day later). A ₦1,500 water-and-power bill comes the same day (not for nepos). If you can't cover it: a ₦1,000 late fee, the debt stays, and two missed weeks bring an eviction warning.
- The starting money alone can't cover the first rent, so the first week requires working. A test checks that an ordinary week of work, food and sleep earns the rent.

## While you were away

On reopening the game, time catches up (1 real minute = 1 game minute, up to 12 hours). Needs fall at half speed and stop at a floor, nothing dramatic happens (no accidents, no collapsing), rent still falls due, and a "While you were away" panel summarises it.

## Saving

The whole `GameState` is saved on the device every few seconds and when the page is hidden. Loading validates everything: missing or out-of-range values fall back to defaults, and a ledger that doesn't sum to zero rejects the save.

## Adding content

- **New activity:** add an entry to `ACTIONS`, add a clip if needed, point a piece of furniture at it in `play/layout.ts`.
- **New furniture:** add the model (`tools/assets/sources.mjs` + asset build, or a builder in `furniture/procedural.ts`), add an entry to `packages/game-core/src/catalog.ts` (name, price, action), then place it in a layout. Open `#/showroom` and run the tests to check it works.

## How the body moves (animation director)

The controller (`play/controller.ts`) adds life on top of the clips:

- **Eased movement:** speed ramps up and down (no instant starts or stops), slows in time to stop exactly at the target, and the walk/jog clip speed follows the real ground speed. Turning mostly happens on the spot before setting off.
- **Head tracking:** the head turns toward where it is going (the next waypoint), toward the thing being used (the fridge, or the TV when watching from the sofa), and glances around now and then while standing or resting.
- **Blinking** every few seconds.
- **Body language from needs:** while standing idle the character yawns and stretches when tired, rubs their stomach when hungry, fidgets when they need the toilet.
- **Getting into bed:** walk to the side, sit on the edge with the real sitting clip, lie back; getting up reverses it.

## Switches

Lamps (desk, oil, floor) are switched on and off by tapping them: the character walks over, reaches out with the real interact animation and flips the switch halfway through. The state is the item's "on" flag; the lamp light eases in. Ceiling lights and power (cuts, generator, solar) are planned.

Tapping elsewhere while sitting down (before you are fully seated) takes the activity back and you get up straight away instead of finishing it first.

## Furniture and prices

Every piece of furniture is a catalog item with a price in naira (a Plastic chair ₦6,500, a Two-seat leather sofa ₦185,000, a Refrigerator ₦290,000...). Players will buy and place them with the shop and home-building tools in a later stage; for now the test house and the showroom use the catalog directly. The catalog also decides what each piece lets you do (sofa and armchairs: watch TV; any chair: sit; bed: sleep; fridge: snack; stove: cook; toilet, basin, shower; boombox or radio: dance; bookshelf: read; desk or laptop: work).
