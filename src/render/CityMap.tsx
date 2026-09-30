import { useEffect, useLayoutEffect, useMemo } from 'react';
import {
  DataTexture,
  LinearMipmapLinearFilter,
  LineDashedMaterial,
  LineSegments,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
} from 'three';
import type { BuildingsFileV1, CityFileV0 } from '../sim/cityFile';
import { laneLineGeometry } from './buildingMesh';
import { TILE_M } from '../sim/constants';
import { Tile, type TileMap } from '../sim/map';
import { indexToWorld, tileToWorld, type TileFrame } from './coords';
import { Buildings } from './Buildings';
import { preLit } from './lighting';
import { LabelLayer, type MapLabel } from './LabelLayer';
import type { GroundHandlers } from './pointer';

const COLORS = {
  asphalt: '#3b3e44',
  /** Block ground (sidewalks, yards, lots): every non-street tile gets a thin slab of this. */
  block: '#8a857c',
  /** The plaza around the landmark: a warm grey, so City Hall's marble stands out. */
  goal: '#bdb6a6',
  station: '#f28c28',
  lane: '#e8e2cf',
} as const;
const STATION_RADIUS_M = 7;
const STATION_HEIGHT_M = 1;
const STATION_LABEL_ABOVE_M = 10;
/** Street classes that get a dashed center line. */
const LANE_KINDS = ['trunk', 'primary', 'secondary', 'tertiary'] as const;
/** Lane markings float a little above the asphalt so they don't z-fight with it at distance. */
const LANE_Y = 0.25;

/**
 * The city: the ground as one tile-coloured plane (streets, block ground, the plaza; D053), the
 * buildings in chunks with two levels of detail (Buildings.tsx, D046/D053), dashed center lines on
 * major streets, stations as orange discs, and HTML labels.
 * The ground plane carries the pointer handlers (render/pointer.ts).
 */
export function CityMap({
  city,
  buildingsFile,
  map,
  frame,
  heights,
  ground,
  pads,
  heightScale,
}: {
  city: CityFileV0;
  buildingsFile: BuildingsFileV1;
  map: TileMap;
  frame: TileFrame;
  /** Display height per tile (render/heights.ts). */
  heights: Float32Array;
  ground: GroundHandlers;
  /** Roof pad tiles: rooftop clutter keeps clear of them. */
  pads: readonly number[];
  /** Buildings are drawn at this share of their height (tactical view, D050). */
  heightScale: number;
}) {
  const groundTexture = useMemo(() => tileTexture(map), [map]);
  useEffect(() => () => groundTexture.dispose(), [groundTexture]);
  const labels = useMemo(() => mapLabels(city, frame, map, heights), [city, frame, map, heights]);
  const keepClear = useMemo(
    () => pads.map((i) => indexToWorld(frame, map.width, i)),
    [pads, frame, map.width],
  );
  const lanes = useMemo(() => {
    const g = laneLineGeometry(buildingsFile, frame, LANE_KINDS);
    return new LineSegments(
      g,
      new LineDashedMaterial({ color: COLORS.lane, dashSize: 4, gapSize: 5 }),
    );
  }, [buildingsFile, frame]);
  useLayoutEffect(() => {
    lanes.computeLineDistances();
    return () => {
      lanes.geometry.dispose();
      (lanes.material as LineDashedMaterial).dispose();
    };
  }, [lanes]);

  // Ground: covers the whole grid, centred on the grid (the world origin is the goal, not the grid centre).
  const [gx, gz] = tileToWorld(frame, (map.width - 1) / 2, (map.height - 1) / 2);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[gx, 0, gz]} {...ground}>
        <planeGeometry args={[map.width * TILE_M, map.height * TILE_M]} />
        <meshBasicMaterial map={groundTexture} />
      </mesh>
      <primitive object={lanes} position-y={LANE_Y} />

      <Buildings
        solids={buildingsFile.solids}
        coordScale={buildingsFile.coordScale}
        frame={frame}
        keepClear={keepClear}
        heightScale={heightScale}
      />

      {city.spawns.map((s) => {
        const [x, z] = tileToWorld(frame, s.tx, s.ty);
        return (
          <mesh key={s.name} position={[x, STATION_HEIGHT_M / 2, z]}>
            <cylinderGeometry args={[STATION_RADIUS_M, STATION_RADIUS_M, STATION_HEIGHT_M, 24]} />
            <meshStandardMaterial
              color={COLORS.station}
              emissive={COLORS.station}
              emissiveIntensity={0.3}
            />
          </mesh>
        );
      })}

      <LabelLayer labels={labels} />
    </group>
  );
}

/**
 * The ground as a texture with one texel per tile (D053): asphalt streets, the block ground under
 * buildings, the plaza around the landmark. Pre-lit and unlit: one full-screen pass instead of a lit
 * plane plus thousands of thin slab boxes. Row 0 of the map (north) is the top of the texture.
 */
function tileTexture(map: TileMap): DataTexture {
  const colors = {
    street: preLit(COLORS.asphalt),
    block: preLit(COLORS.block),
    goal: preLit(COLORS.goal),
  };
  const bytes = Object.fromEntries(
    Object.entries(colors).map(([k, c]) => {
      const s = c.clone().convertLinearToSRGB();
      return [k, [s.r * 255, s.g * 255, s.b * 255, 255].map(Math.round)];
    }),
  ) as Record<keyof typeof colors, number[]>;
  const data = new Uint8Array(map.width * map.height * 4);
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const t = map.tiles[ty * map.width + tx];
      const rgba = t === Tile.Goal ? bytes.goal : t === Tile.Street ? bytes.street : bytes.block;
      data.set(rgba, ((map.height - 1 - ty) * map.width + tx) * 4);
    }
  }
  const tex = new DataTexture(data, map.width, map.height, RGBAFormat);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Street names at street level; station names float above the tallest nearby roof. */
function mapLabels(
  city: CityFileV0,
  frame: TileFrame,
  map: TileMap,
  heights: Float32Array,
): MapLabel[] {
  const streets = city.labels.map((l): MapLabel => {
    const [x, z] = tileToWorld(frame, l.tx, l.ty);
    return {
      text: l.text,
      position: [x, 1, z],
      className: l.vertical ? 'map-label street-label vertical' : 'map-label street-label',
    };
  });
  const stations = city.spawns.map((s): MapLabel => {
    const [x, z] = tileToWorld(frame, s.tx, s.ty);
    let roof = 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const tx = s.tx + dx;
        const ty = s.ty + dy;
        if (tx >= 0 && ty >= 0 && tx < map.width && ty < map.height) {
          roof = Math.max(roof, heights[ty * map.width + tx]!);
        }
      }
    }
    return {
      text: s.name,
      position: [x, roof + STATION_LABEL_ABOVE_M, z],
      className: 'map-label station-label',
    };
  });
  return [...streets, ...stations];
}
