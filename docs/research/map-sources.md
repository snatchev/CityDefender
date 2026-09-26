# Research: Map Sources & Formats (2026-09-26)

**Question:** What's the best source and format for a recognizable, game‑friendly 3D map of real cities (starting with Center City Philadelphia)?
**Answer:** Generate it ourselves from open data. → Decision **D001** in [../DECISIONS.md](../DECISIONS.md).

## Options compared

| Source | What it really is | Recognizable | Fits a TD grid | Reuse rights | Effort | Verdict |
|---|---|---|---|---|---|---|
| Hand‑built Minecraft maps (PlanetMinecraft "Center City Philadelphia") | ~1 block = 1 m, full interiors. Anvil/NBT region files with no street/sidewalk semantics. | ●●●○○ | ●○○○○ | ●○○○○ ("All rights reserved"; a commenter reported the download broken, Aug 2026) | High | **No** |
| Generated Minecraft worlds (Arnis, Apache‑2.0; Map2Minecraft, paid) | OSM converted to blocks. Same data we'd use, minus tags. | ●●●○○ | ●●○○○ | ●●●●○ | Medium | **Borrow the idea** (voxels for destruction), skip the format |
| Cities: Skylines (OSM Import, Cimtographer mods) | Road networks imported *from* OSM. Buildings are generic assets. Proprietary formats. | ●●○○○ | ●●●○○ | ●○○○○ | High | **No** |
| Google Photorealistic 3D Tiles (via 3DTilesRendererJS) | Photogrammetry mesh, no semantics, paid per request. | ●●●●● | ○○○○○ | ○○○○○: policy forbids pre‑fetch/caching, "offline uses", "geodata extraction", and 3D objects "derived by hand or machine" from the tiles | High | **No** |
| OSM 3D renderers (OSM2World, OSMBuildings) | Extrude OSM footprints. | ●●●○○ | ●●○○○ | ●●●●○ | Medium | **Reference only** |
| **Raw open data → our generator** | Typed streets with names and lanes, footprints with heights, real stations. | ●●●●○ | ●●●●● | ●●●●○ | Medium | **Yes** |

## Key findings
1. **Minecraft city maps are OSM in disguise.** Arnis and Map2Minecraft both build from OpenStreetMap. Going to the source keeps the semantics that blocks lose.
2. **Philadelphia publishes building heights.** The `LI_BUILDING_FOOTPRINTS` layer has fields `objectid, bin, fcode, address, building_name, base_elevation, approx_hgt, max_hgt, parcel_id_num, parcel_id_source, dor_alternate_addr, square_ft`. Available as CSV / SHP / GeoJSON / ArcGIS REST, updated weekly, under the City of Philadelphia License ("as is").
3. **Penn's grid does half the work.** Center City follows the 1682 Penn plan: near‑orthogonal streets. Rotate the tile grid to match (compute the dominant bearing automatically).
4. **Licenses are light.** OSM is ODbL: credit "© OpenStreetMap contributors" in‑game. If we publish a derived *database*, share‑alike applies to it. City data is "as is". We never ship Google tiles.
5. **Overture Maps** buildings expose `height`, `num_floors`, `roof_shape`, `min_height`, …, and are a good fallback where city heights are missing. CLI: `overturemaps download --bbox=W,S,E,N -f geojson --type=building -o out.geojson`.
6. **Stations:** OSM has subway/trolley station nodes (simplest, same query as streets). SEPTA's GTFS (github.com/septadev/GTFS releases) is an authoritative fallback. Note SEPTA's line rebrand: **L** = Market–Frankford, **B** = Broad Street.

## Data sources (for the pipeline)
| Data | Source | Format | Pass |
|---|---|---|---|
| Streets, parks, water, stations | OSM via Overpass API | JSON → GeoJSON (`osmtogeojson`) | 1 |
| Building footprints + heights | OpenDataPhilly Building Footprints / `LI_BUILDING_FOOTPRINTS` FeatureServer | GeoJSON | 6 |
| Height fallback | Overture Maps buildings | GeoJSON / GeoParquet | 6 |
| Stations (authoritative) | SEPTA GTFS `stops.txt` | CSV | 6 (optional) |
| Terrain | OpenDataPhilly DEM / LiDAR | raster / LAS | not planned (Center City is flat enough) |

## Sources
- https://www.planetminecraft.com/project/center-city-philadelphia/
- https://github.com/louis-e/arnis
- https://map2minecraft.com/cities/philadelphia
- https://steamcommunity.com/sharedfiles/filedetails/?id=1957515502 (Cities: Skylines OSM import)
- https://developers.google.com/maps/documentation/tile/policies
- https://opendataphilly.org/datasets/building-footprints/
- https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/LI_BUILDING_FOOTPRINTS/FeatureServer/0?f=json
- https://github.com/septadev/GTFS
- https://docs.overturemaps.org/schema/reference/buildings/building/
- https://docs.overturemaps.org/getting-data/overturemaps-py/
- https://github.com/tordanik/OSM2World
- Design canvas with the original comparison (private): https://claude.ai/artifact/YB5mfSr7kwnmMb32RkNbgE
