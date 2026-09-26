# City Defender — Game Design Document

> Status: **v0.1 draft** (2026-09-26). Owner: Stefan. Living document; update it when a design decision changes and log the change in [DECISIONS.md](DECISIONS.md).
> Build order lives in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Unscheduled ideas live in [IDEAS.md](IDEAS.md).

---

## 1. Pitch

Alien bugs are breaking out of the subway. They swarm up from station entrances and sewers and march down **real city streets** to take a **real landmark**. You have one prep window per wave to put towers on rooftops and street corners and to barricade streets, forcing the swarm onto the route *you* chose.

**Level 1: Philadelphia. Defend City Hall.**

What makes it different from a generic tower defense:

1. **The maze is a real street grid.** Players know these streets, and "I blocked Chestnut so they'd come down 15th" is a satisfying sentence.
2. **Barricades reroute instead of just blocking.** Every barricade changes the path, and a sealed city leads to a siege (see §5.3).
3. **Height matters.** Rooftop towers get range from the building's real height. City Hall's neighbours become strategic high ground.
4. **Three movement layers:** crawlers on the street, fliers above the street corridors, diggers underneath in the sewers. Each layer ignores a different part of your defense.

## 2. Pillars

Use these to settle design arguments. If a feature doesn't serve one of them, it goes to IDEAS.md.

| Pillar | Means | Doesn't mean |
|---|---|---|
| **Readable planning puzzle** | Before every wave the player can see where bugs will come from and which way they'll go. | Hidden information, surprise spawns without a telegraph. |
| **Recognizable place** | Real street names, real landmarks, real building heights. | Photoreal fidelity. Stylized low‑poly is the target. |
| **Every choice has a counter** | Each mob beats some defense, and each defense beats some mob. | One dominant build. |
| **Short, replayable runs** | A run is 20–30 minutes, with seeds and mutators for variety. | 2‑hour campaigns. |

## 3. Core loop

```
┌──────────── RUN (one city, ~20 waves) ────────────┐
│  ┌─ WAVE ───────────────────────────────────────┐ │
│  │ 1 INTEL → 2 PREP → 3 ASSAULT → 4 DEBRIEF      │ │
│  └───────────────────────────────────────────────┘ │
│  every 5 waves: COUNCIL GRANT (pick 1 of 3)        │
│  wave 10: mini‑boss · wave 20: Brood Mother        │
└────────────────────────────────────────────────────┘
```

### 3.1 Wave phases

**1. Intel (start of prep, automatic)**
- "SEPTA dispatch" banner: which **stations are active** this wave, plus mob icons with counts (e.g. `Race–Vine: 20× Skitterling, 2× Beetle`).
- **Ghost paths** are drawn from every active spawn to City Hall and update live while the player edits barricades. This is the most important UI in the game.
- Telegraph for next wave: "Tremors under 15th St" means that station opens next wave.

**2. Prep (untimed by default)**
- Place, upgrade and sell towers. Place, upgrade and repair barricades.
- **Undo is free during prep**: anything built this prep sells back at 100%. After the wave starts, selling refunds 70%.
- Barricade preview shows the new path and the change in route length (`+340 m detour`).
- A **"Call wave early"** button pays a bonus. Timed prep is a mutator, not the default.

**3. Assault**
- Mobs leave stations in bursts. Towers fire automatically. Speed controls: pause, 1×, 2×, 3×.
- **Towers** can be built during the assault (classic tower defense feel). **Barricades can't be placed during the assault**, only repaired for cash. This keeps the maze a prep‑time puzzle and prevents "juggling" exploits.
- Later pass: 1–2 active abilities on cooldown (see IDEAS).

**4. Debrief**
- Summary: kills, leaks, City Hall damage, barricade damage taken, bounty, interest earned.
- **Damage persists.** Barricades keep their damage into the next wave unless repaired. That makes a recurring spend decision.

### 3.2 Win, lose, score
- **City Hall Integrity** is the "lives" value (starts at 100). Mobs that reach the goal deal damage by type (Skitterling 1, Beetle 5, Boss 50…). At 0 the run is lost.
- Survive the final wave to win. **Stars:** ★ win, ★★ integrity ≥ 50, ★★★ integrity 100.
- Score = kills value + integrity bonus + unspent cash, times a mutator multiplier.

### 3.3 Economy
- **Bounty** per kill, scaled by mob type.
- **Wave clear bonus**, flat plus a wave‑number scale.
- **Interest:** 5% of banked cash at debrief, capped (for example at 50). This sets up a save‑vs‑spend tension.
- **Early call bonus** grows with the prep time skipped (if prep is timed) or is a flat amount.
- Balance target: the player *almost* affords the ideal answer to every wave. HP grows about 1.12–1.18× per wave, and income grows slightly slower.

## 4. The map

Full rationale is in [research/map-sources.md](research/map-sources.md). Summary:

- The map is **generated offline** from open data (OSM streets and stations, City of Philadelphia footprints with heights) into `city.json` + GLB. The game never touches geo data at runtime.
- **Tile = 8 m.** A side street is about 2 tiles wide, and Broad or Market about 3–4. The grid is rotated to match Penn's street grid.
- Tile types: `street`, `sidewalk/corner`, `building(height)`, `park`, `water`, `goal`, `station`.
- **Level bounds v1:** Vine St → Spruce St, 18th St → 8th St (~1.3 × 1.2 km, ~160 × 150 tiles).
- **Height compression:** display and gameplay height = √‑curve of real height. Ordering is preserved and skyscrapers don't wall off the camera.
- **Landmarks:** City Hall (goal) and later ~5 hand‑modeled heroes. Everything else is an extruded footprint.

### 4.1 Placement
| Slot | Where | Who can use it |
|---|---|---|
| **Roof pad** | Any building tile touching a street (MVP). Later: 1–3 pads per building, chosen by the generator. | Roof towers. Range bonus from height. |
| **Corner** | Sidewalk tiles at intersections. | Corner towers (street level). |
| **Barricade slot** | One per street segment (block face), spanning the full street width. | Barricades. MVP: click any street tile and the barricade fills across the street. |

### 4.2 Spawns
- **Stations** (subway/trolley entrances inside the bounds) are spawn points. Outer stations open first. Inner ones (15th St, 13th St) "breach" in later waves with one wave of warning.
- **Manholes** (generated along streets) are where diggers surface. Later: sewer‑burst events spawn a few mobs mid‑map.

## 5. Movement & pathfinding rules

### 5.1 Crawlers (default)
- Move on `street` tiles only (4‑neighbour; 8‑neighbour optional for smoother paths).
- Follow a **flow field** computed by Dijkstra *from the goal* over street tiles. It's one field for all crawlers and recomputed on events.

### 5.2 Barricades
- A barricade occupies every tile of its slot, across the full street width.
- Its tiles are **not removed** from the graph. They get a **traversal cost proportional to remaining HP**: `cost = BASE_TILE_COST + k × hp`.
- A crawler whose next step is a barricade tile stops and attacks it.

### 5.3 Why this one rule is enough (the siege rule)
Because barricades are expensive edges rather than walls, the same Dijkstra naturally handles:
- **Open detour exists and is short:** the path goes around, and the barricade is ignored.
- **Detour is very long:** attacking a weak barricade is cheaper, so mobs besiege it. Stronger barricades push the siege elsewhere.
- **Everything is sealed:** the swarm hits the "cheapest" barricade. No special "can't fully block" rule is needed, and there is no invalid‑placement frustration.
- To avoid oscillation, recompute the field when a barricade is placed or destroyed, or when its HP crosses a 25% band, not every tick.

### 5.4 Fliers
- Fly along the **street corridors** at roof height, using a separate flow field over street tiles **without barricade costs**.
- Only anti‑air‑capable towers can hit them.

### 5.5 Diggers
- Travel the **sewer graph**, which equals the street graph (so they're still "on streets") and ignores barricades.
- **Buried = untargetable.** They surface at manholes for ~3 s, and within the last N tiles of City Hall they surface for good.
- The Seismic Pulse tower reveals and stuns buried grubs in its radius.

## 6. Mobs (draft v0, balance via data tables)

Relative stats: ●○○○○ = low, ●●●●● = high.

| Mob | Layer | HP | Speed | Armor | Beats | Countered by | Special |
|---|---|---|---|---|---|---|---|
| **Skitterling** | Crawler · swarm | ●○○○○ | ●●●●○ | – | Single‑target towers (packs of 20+) | Mortar, Tesla | Cheap filler. Spawns in bursts. |
| **Carapace Beetle** | Crawler · tank | ●●●●○ | ●○○○○ | ●●●●○ | Barricades (3× damage), gun chip damage | Railgun (pierce), Cryo | Armor is flat damage reduction per hit. |
| **Acid Spitter** | Crawler · sapper | ●●○○○ | ●●○○○ | ●○○○○ | Barricades from 3 tiles, corner towers | Roof MG, Railgun (outrange) | Stops at range and damages barricades. Later: roof towers too. |
| **Wasp Drone** | Flier | ●○○○○ | ●●●●● | – | All barricades, ground‑only towers | Flak, Tesla, MG | Ignores barricade costs. |
| **Tunneler Grub** | Digger | ●●●○○ | ●●○○○ | ●●○○○ | Barricades, roof towers | Seismic Pulse, corner towers near manholes | Untargetable while buried. |
| **Brood Mother** | Crawler · boss | ●●●●● | ●○○○○ | ●●●○○ | Thin defenses | Cryo + sustained Railgun, splash for brood | Births 6 Skitterlings per 25% HP lost. Crushes T1 barricades on contact. |

**Elite affixes** (later waves, see IDEAS): Armored, Regenerating, Splitting, Hasted, Shielded vs one damage type.

## 7. Towers (draft v0)

Damage types: `kinetic` (reduced by armor), `pierce` (ignores armor), `explosive` (splash, ground only), `energy` (chains, hits air), `cryo` (slow).

| Tower | Slot | Hits | Role | Notes |
|---|---|---|---|---|
| **MG Nest** | Roof · Corner | Ground + Air | Cheap single‑target DPS | **The MVP tower.** |
| **Mortar** | Roof | Ground | Splash | Minimum range. Craters slow briefly (upgrade). |
| **Cryo Sprayer** | Corner | Ground | Slow cone | Wet status boosts Tesla chains (synergy). |
| **Railgun** | Roof | Ground + Air | Armor pierce, long range | Slow fire. Range scales most with height. |
| **Tesla Coil** | Corner · Roof | Ground + Air | Chain to 4 | +1 chain on wet targets. |
| **Flak Battery** | Roof | Air only | AA splash | Hard counter to wasps. |
| **Seismic Pulse** | Corner | Burrowed | Support | Reveals and stuns diggers in radius. Small damage. |

- **Height bonus:** `range = baseRange × (1 + heightFactor × compressedHeight)`, capped. Roof towers have a **minimum range** (they can't hit directly below).
- **Targeting modes:** First (default), Last, Strongest, Weakest, Closest. Change per tower.
- **Upgrades:** 3 tiers. Tier 3 branches into two specializations (for example Railgun → *Penetrator*, which pierces through a line, or *Spotter*, which marks targets for +dmg).

## 8. Barricades (draft v0)

| Barricade | Tier | Relative HP | Notes |
|---|---|---|---|
| **Police Sawhorse** | T1 | ×1 | Cheap, instant. For steering, not holding. |
| **Jersey Barrier** | T2 | ×4 | Concrete workhorse. |
| **SEPTA Bus Wall** | T3 | ×12 | Needed on wide avenues (Broad, Market). |
| **Blast Wall** | T4 | ×30 | Self‑repairs between waves. Expensive. |
| **Spike Strip** | Trap | – | Doesn't block or reroute. Damages crawlers crossing it. |

- Barricades can be upgraded in place (T1→T2 costs the difference).
- Wider streets cost more per barricade (cost × slot width in tiles). This makes the choice of *where* to block matter.

## 9. Round script (Philadelphia, first pass)

| Waves | Active stations | New threat | Design intent |
|---|---|---|---|
| 1–3 | 1 outer (Race–Vine) | Skitterlings | Teach placement, one path. |
| 4–5 | +1 outer (11th St) | Beetles | Two fronts. Teach barricade rerouting to merge them. |
| **5** | | | **Council Grant #1** |
| 6–8 | +1 (Walnut–Locust) | Spitters | Barricades get punished. Teach roof outranging. |
| 9 | | Wasps | Barricades don't matter for fliers. Teach AA. |
| **10** | all outer | **Mini‑boss: Beetle Matriarch** | Checkpoint spike. Grant #2. |
| 11–14 | 15th St breaches | Grubs | Inner spawn plus diggers. Teach seismic and corners. |
| **15** | | | Grant #3. Elite affixes begin. |
| 16–19 | 13th St breaches | Mixed + elites | Pressure from inside and out. |
| **20** | all | **Brood Mother** | Finale. |

Pacing rule: spike → breather → spike. Never monotonic.

## 10. Fun & replayability — the "little things"

The full list is in [IDEAS.md](IDEAS.md). These are the ones that are part of the core design:

1. **Ghost paths + detour meter** during prep. Seeing "+420 m" after a clever barricade is the core dopamine hit.
2. **Free undo during prep.** Experimentation should cost nothing.
3. **Height = range** with a visible range disc projected on the street. Clicking a skyscraper and seeing a huge ring feels good.
4. **Siege drama.** Barricades crack, spark and shake, with a siren when one breaks and a wave‑wide reroute you can see.
5. **Telegraphed breaches.** "Tremors under 15th St" gives one wave to prepare, so the map changes during a run.
6. **Council Grants** (pick 1 of 3 every 5 waves). Examples: "Bus Depot Contract: Bus Walls −30%", "Rooftop Access Permits: +1 pad on every tower building", "Water Dept: Cryo applies Wet for 2× longer". Different grants → different runs.
7. **Local flavor.** Radio chatter with real place names ("They're coming up Chestnut past the Wawa!"), and optional side objectives like "Keep LOVE Park clear this wave" for bonus cash.
8. **Golden bug.** A rare fast bug that runs *between* stations. Kill it for a big bounty.
9. **Seeds & mutators** (post‑MVP): Rush Hour (+fliers), SEPTA Strike (all stations open wave 1), Nor'easter (fog −range), Construction Season (random streets pre‑closed), Budget Cuts (−25% income, ×1.5 score).
10. **Readable feedback:** damage numbers (toggle), HP bars only when damaged, kill pops, a combo counter for chain kills.

## 11. Look & feel

- **Stylized low‑poly.** Warm stone buildings, dark asphalt streets with lane lines, and City Hall in off‑white with a gold Penn statue.
- Bugs are bright, readable silhouettes (acid green / magenta) against a muted city. Towers use a defense‑blue accent.
- **Camera:** isometric‑ish perspective, orbit + pan + zoom clamped to the level bounds. Double‑click to focus.
- Day/night per wave is a later pass. Night waves turn on streetlights and bug glow.

## 12. Non‑goals (for now)
- Multiplayer, mobile, monetization.
- Photoreal city rendering.
- Real‑time geo data at runtime.
- Full building destruction (a later, optional pass; see IDEAS).
