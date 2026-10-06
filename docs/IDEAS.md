# City Defender — Idea Backlog

> The parking lot. **Nothing here is scheduled** unless [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) names it.
> Add freely, and tag each idea with a target pass or `later`. When an idea gets scheduled, move it into the plan and mark it `→ Pass N` here.
> Tags: 🎯 core fun · 🔁 replayability · ✨ juice · 🗺️ map · ⚙️ systems · 🏙️ flavor · 🎮 camera & controls
> Built ideas are removed from here once they're done (STATUS.md and DECISIONS.md keep the history; last pruned 2026-10-05).

## Planning & readability
- 🗺️ **Rivers in the backdrop**: Schuylkill and Delaware water polygons (OSM multipolygons need ring stitching), maybe bridges. Would make the backdrop unmistakably Philadelphia. → Pass 10
- 🗺️ **Backdrop streets**: major street lines through the backdrop grid so the far city reads as blocks. → Pass 10
- ⚙️ **Path heatmap** overlay: which streets saw the most traffic last wave.
- ⚙️ **Threat forecast**: expected leaks with the current defense (runs the sim headless 1× in a worker).
- ⚙️ Hotkeys for every tower and barricade, and shift‑click to place repeatedly.

## Towers & combat
- 🎯 **Synergies:** Cryo *Wet* → Tesla +1 chain. Mortar craters slow. Seismic stun → Railgun crit.
- ⚙️ **Tower veterancy:** kills grant small stat stars. Makes players attached to a tower.
- ⚙️ **Line of sight:** tall buildings block roof towers' shots (maybe too fiddly, so playtest first).
- ⚙️ **Tower facing / arcs** for corner towers (cone coverage down two streets).
- 🎯 **Active abilities** on cooldown, max 2: *Water Main Burst* (flood a street: slow + Wet), *SEPTA Express* (a train rams through a station and clears its spawn burst), *Police Line* (instant temporary barricade anywhere, even mid‑assault).

## Barricades & the maze
- ⚙️ **Gates:** a barricade you can toggle open/closed during the assault (limited uses). A mid‑wave maze switch.
- ⚙️ **Barricade decay** for cheap types (sawhorses fall apart after N waves).
- 🗺️ **One‑way streets matter?** Idea: mobs move faster going with traffic direction (flavor from OSM `oneway`).

## Mobs & waves
- 🎯 **More elite affixes**: Splitting, and Shielded (immune to one damage type). Armored, Regenerating and Hasted exist.
- 🎯 **Golden bug:** rare fast bug running *between* stations; big bounty if killed.
- ⚙️ **Swarm intelligence:** mobs that lose many members on a route gradually weigh it higher next wave (the swarm "learns"). Forces players to adapt. Great for replayability.
- ⚙️ **Sewer bursts:** a few mobs pop out of a random manhole mid‑wave (telegraphed by steam 3 s before).
- ⚙️ **Hive nodes:** if a station is left alone for 3 waves it grows a hive that spawns more. Kill‑able objective.
- ⚙️ **Bug corpses** briefly slow others (swarm pile‑ups at chokepoints feel great).

## Run structure & meta
- 🔁 **More Council Grants** (11 exist in `grants.json`): *Night Shift* (+range at night waves, once day/night exists), *Rooftop Access Permits* as designed (+1 pad on tower buildings; became +10% roof range because pads are fixed at load).
- 🔁 **Run seeds** and shareable seed strings. → Pass 11
- 🔁 **Mutators** with score multipliers: Rush Hour (+fliers), SEPTA Strike (all stations wave 1), Nor'easter (fog, −range), Construction Season (random streets pre‑closed), Budget Cuts (−25% income, ×1.5 score), Heat Wave (bugs +speed). → Pass 11
- 🔁 **Daily challenge** (fixed seed + mutator, local leaderboard). → Pass 11
- 🔁 **Achievements**: "No Blast Walls", "Never let a grub surface", "Hold with ≤ 3 barricades", "Perfect integrity". → Pass 11
- 🔁 **Endless mode** after wave 20 with scaling affixes.
- 🔁 **Meta unlocks:** towers and cities unlock by stars earned (keep light; no grind).
- 🔁 **Campaign map** of cities, each with a different landmark and street topology:
  - Philadelphia (City Hall): the Penn grid, the tutorial city.
  - Boston (State House): tangled colonial streets, hard mazes.
  - Washington DC (Capitol): diagonal avenues and radial circles.
  - New York (Empire State or Flatiron): Manhattan grid plus Broadway's diagonal.
  - Chicago (Willis Tower): grid plus the elevated Loop as a flier highway.

## Map & world
- 🗺️ **Hand‑modeled hero landmarks** (City Hall, Comcast towers, Liberty Place, LOVE Park, Masonic Temple). → Pass 10
- 🗺️ **Parks as open terrain** where crawlers can cut across but slower (Rittenhouse, LOVE Park, Dilworth).
- 🗺️ **Elevated or underground concourses** as special paths (the underground concourse network around City Hall as a digger highway).
- 🗺️ **Destruction:** voxelize a building (≈2 m voxels) only when it takes damage. Spitters can collapse a roof pad. Rubble becomes a free (weak) barricade. The Minecraft idea from research. `later`
- 🗺️ **Day/night per wave:** streetlights, bug bioluminescence. → Pass 10
- 🗺️ **Weather:** rain (Wet status for all), fog (range), snow (slow).

## Juice & feel
- ✨ Hit flash, kill pop, bug splat decals that fade over ~2 waves (the street shows the battle's history).
- ✨ Barricade cracks, sparks, screen shake on break, a siren and reroute animation of the ghost path.
- ✨ Combo counter for chain kills ("CHAIN ×7").
- ✨ City Hall integrity shown as the Penn statue and tower visibly cracking.
- ✨ Siren when City Hall Integrity drops below 25% (Pass 10c audio).
- ✨ Photo mode.

## Local flavor (Philadelphia)
- 🏙️ Radio chatter with real place names: "They're coming up Chestnut past the Wawa!", "Suburban Station concourse is crawling!", "Somebody grease the poles!" (a Philly celebration tradition).
- 🏙️ Optional side objectives: "Keep LOVE Park clear this wave" or "Protect the Reading Terminal Market loading dock" for bonus cash.
- 🏙️ Barricade skins: SEPTA buses, sanitation trucks, Mummers float (joke tier).
- 🏙️ The William Penn statue gets a hard hat when integrity drops below 50%.

## City flavor: events, power-ups, debuffs and landmarks (Stefan, 2026-09-27)
- 🏙️ Every city gets its own set of **special events** (good and bad), **power-ups** and **debuffs** drawn from local culture, for example in Philadelphia the "Broad Street Bullies" sweeping a street clear, or dirt-bike "wheelie boys" knocking barricades down.
- 🏙️ Fill each map with **popular, beloved and locally hated landmarks and signs**, so locals recognise their city.
- **Philadelphia first** (Stefan, 2026-09-27), built so other cities plug in: generic mechanics in `src/sim/`, per-city content in data keyed by city (like `waves.json`).
- Research first, build later: candidate events, characters and landmarks for Boston, NYC, Philadelphia, San Francisco and Portland (Oregon) are in [research/city-flavor.md](research/city-flavor.md).

## From Pass 10a (2026-09-30)
- ✨ **Shadows** from the sun: the new setbacks and roofs would read much better with a shadow map over the level (one 4096 map ≈ 0.4 m/texel). → Pass 10b (lighting/postprocessing)
- ✨ **Lit windows at night**: the window shader already knows every window cell; a per-cell hash could light some of them for the day/night cycle. → Pass 10b
- 🗺️ **Parts hidden inside footprints**: parts under a footprint they cover less than 60% of are drawn but hidden (e.g. a dome near Broad & Chestnut). Could clip the footprint instead. Low priority.
- 🗺️ **Skybridges and canopies**: parts over streets (`min_height` above the street) are dropped today.
- 🗺️ **Straight-skeleton roofs** for pitched roofs over courtyards (drawn flat now).

## Camera & controls (after "down the street", D054–D059)
- 🎮 **Chase the swarm**: one key auto-dollies along the track with the lead bug pack, hands free.
- 🎮 **Stay between the walls**: when the camera drops below nearby rooftops, steer it back over the street instead of letting it pass through buildings (they'd only turn to glass).
- 🎮 **Aim from the street**: tower placement from the low camera, or a quick top-down peek (tap T) to place, then a swoop back down.
- ✨ **Speed lines** overlay while boosting.
- 🎮 **Placement that knows the track**: with a tower tool picked, highlight spots whose range covers the active track (brighter the more track metres they cover) and dim the rest; the snap prefers them.
- 🎮 **Alerts you can click**: "Jersey Barrier on Broad under attack", "leak at City Hall": clicking swings the camera there.
- 🎮 **Tactical pause**: Space pauses and resumes; optionally the game slows to 0.25× while a build tool is picked during an assault.
- 🎮 **Build-bar hotkeys** (Z/X/C…, not the camera keys) to pick a tower or wall without moving the mouse to the bar.
- ✨ **Introduction polish**: a short burst of the bug's sound, the board card flipping to its portrait, a "first sighting" stamp in a bestiary.

## More life in the city (after D052, 2026-09-30)
- 🗺️ **SEPTA buses** on the major streets (a longer box, stops at corners), **yellow cabs** honking, **police cars** with flashing lights parked at walls.
- 🗺️ **Pigeon flocks** that burst up from plazas (Dilworth Park, LOVE Park) when bugs come near.
- ✨ **Panic cues**: people run with arms up (bob faster), cars' hazard lights blink, a siren sound when a station breaches (Pass 10c audio).
- ✨ **Night**: lit windows (the facade shader knows every window), street lamps, car headlights (Pass 10b day/night).
- 🗺️ **Steam from manholes** where grubs will surface (doubles as a hint).
- 🗺️ **Crowds at stations** that flee first when a breach is telegraphed.

