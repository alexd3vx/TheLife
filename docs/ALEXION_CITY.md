# Alexion City: first design (draft 1, for the owner to approve)

An invented coastal megacity with a Lagos soul: lagoon, islands, long bridges, markets, danfo, NEPA, owambe, Pidgin. All names and brands are made up (no real banks, airlines or networks). The map engine, interiors, rides and rules already built stay; only the city data and names change (see `NEXT_STEPS.md`, Q81-84). Real Lagos can come back later as a second map.

## The shape

A lagoon in the middle, an ocean to the south, five districts joined by three bridges and a ferry loop. Rich in the south-east, busy in the west, official in the middle, industrial in the north.

```
                 N
     Gateway (airport, stadium, film city)
        |                     |
   Third Bridge          Link Road
        |                     |
 Balogun Bazaar ---- Eko Crown ---- Palm Estates
   (west markets)    (centre island)  (south-east)
                   |
              Harbour & Bridges
                  (south)
                 Ocean
```

## The five districts (about 12 places each, 60 in all)

Place kinds in brackets are the interior types already built; "new" means a new interior to make.

### 1. Eko Crown (centre island: government, money, culture)
1. Alexion Square and the Eagle Monument (open ground, events, elections)
2. Cathedral of the Holy Cross [church]
3. Grand Central Mosque [mosque]
4. City Hall (governor's office, cabinet, news studio) [new]
5. Alexion Reserve Bank, head office [bank]
6. Crown Exchange tower (stocks, jobs for office careers) [new]
7. Marina Promenade (waterfront walk, food stalls)
8. National Museum [new]
9. High Court and the Polling Unit [new]
10. Central Police Command [police]
11. Eko Teaching Hospital [hospital]
12. Crown Library and Alexion Primary School [school]

### 2. Harbour and Bridges (south: water, ferries, fish)
13. Alexion Port and Customs House [new]
14. Fisherman's Wharf and Fish Market [market]
15. Third Bridge (6 km, the long lagoon bridge, a ride-through scene)
16. Link Bridge (cable-stayed, lit at night)
17. Ferry Terminal and Boat Cruise [new]
18. Lighthouse and Harbour Church [church]
19. Boat Yard and Mechanic Village [new]
20. Harbour Fuel Station [fuel]
21. Sea Plots (the water plots for sale, ads)
22. Harbour Clinic [hospital]
23. Dockers' Canteen (food spot)
24. Harbour Police Post [police]

### 3. Balogun Bazaar (west: markets and motor parks)
25. Balogun Bazaar (the biggest market) [market]
26. Fabric Lane (Ankara, aso-oke, boutiques) [market]
27. Electronics Alley (phones and phone repair) [market]
28. Seven Roundabout Motor Park (danfo terminal, ride hub) [new]
29. Mushin Estate (face-me-I-face-you homes)
30. Bazaar Central Mosque [mosque]
31. Chapel of Grace [church]
32. Bazaar General Hospital [hospital]
33. Unity Primary and Secondary School [school]
34. Bazaar Fuel Station [fuel]
35. Mama Put Food Court
36. Bazaar Police Division [police]

### 4. Palm Estates (south-east: rich, beach, nightlife)
37. Palm Mall (boutiques, cinema, food) [market]
38. Pearl Island (waterfront mansions, helipad)
39. Silicon Creek tech hub (startups, tech career) [new]
40. Palm Golf and Country Club [new]
41. Elegushi-style Beach (beach rave nights)
42. Neon Strip (clubs and lounges, nightlife)
43. Conservation Park and Canopy Walk
44. Palm Hotel [new]
45. Alexion Motors showroom (cars, test drive) [new]
46. Palm Fuel Station [fuel]
47. Palm Private Hospital [hospital]
48. Estate Gym and Spa [new]

### 5. Gateway (north mainland: air, sport, film, industry)
49. Alexion International Airport (arrivals, departures) [new]
50. Stadium Arena (football career, matches with cutscenes) [new]
51. Film City (Nollywood sets, actor career) [new]
52. Radio House and Studios (music career, radio) [new]
53. Gateway Rail Station [new]
54. University of Alexion (campus, lectures, library) [school]
55. Gateway Police Headquarters [police]
56. Gateway Referral Hospital [hospital]
57. Industrial Park and Refinery (coming soon)
58. Gateway Market [market]
59. Gateway Mosque [mosque]
60. Gateway Cathedral [church]

## Transport

Danfo, keke, okada, taxi and your own car on the roads; the ferry loop from Harbour to Palm Estates; a rail line from the Gateway to Eko Crown later. Three bridges (Third Bridge, Link Bridge, Gateway Causeway) are real structures with traffic and water below.

## Look and feel

Colourful game-style 3D (owner's choice): saturated colours, chunky buildings with real height, water with depth and foam, floating labels with icons, billboards on the roads. A different colour theme for each district so players always know where they are: Eko Crown gold and white, Harbour teal, Bazaar orange and red, Palm Estates pink and turquoise, Gateway blue and grey.

## Mapping from what is built

| Today (Lagos data) | Alexion City |
|---|---|
| `lagosData.ts` real OSM places and names | `alexionData.ts` hand-designed districts and the 60 places above |
| `lagos.ts` generator (lots, roads, landmarks) | Same generator, fed by designed polygons instead of OSM |
| Places with an interior | bank, hospital, police, church, mosque, school, market and fuel stay; 14 new interior types are marked [new] |
| Real names in chat, rides, map | Invented names |

## Open items for the owner

1. Is Alexion City in Nigeria (so naira, Naija culture, Pidgin stay) or in an invented country with the same culture? (I recommend Nigeria-like, with the currency still naira.)
2. Does the city keep a real Lagos nickname (for example "Eko") as a local name? Used above in "Eko Crown" and "Eko Teaching Hospital".
3. Which five district names do you like? Rename freely.
4. Which three of the [new] interiors come first after the school (airport, stadium and bank-at-night are my picks because of the arrival film and the football career)?
