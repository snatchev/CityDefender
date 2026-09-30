import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  LineDashedMaterial,
  LineSegments,
  MeshStandardMaterial,
  Object3D,
  type InstancedMesh,
} from 'three';
import type { BuildingsFileV1, CityFileV0 } from '../sim/cityFile';
import { laneLineGeometry, solidsGeometry } from './buildingMesh';
import { TILE_M } from '../sim/constants';
import { Tile, type TileMap } from '../sim/map';
import { indexToWorld, tileToWorld, type TileFrame } from './coords';
import { withWindows } from './facades';
import { LOT_M } from './heights';
import { LabelLayer, type MapLabel } from './LabelLayer';
import type { GroundHandlers } from './pointer';
import { withSeeThrough } from './seeThrough';

const COLORS = {
  asphalt: '#3b3e44',
  /** Block ground (sidewalks, yards, lots): every non-street tile gets a thin slab of this. */
  block: '#8a857c',
  /** The plaza around the landmark: a warm grey, so City Hall's marble stands out. */
  goal: '#bdb6a6',
  station: '#f28c28',
  lane: '#e8e2cf',
} as const;
const GOAL_PLINTH_M = 1.5;
/** Facades and roofs are matte; windows get their own, lower roughness (facades.ts). */
const BUILDING_ROUGHNESS = 0.9;
const STATION_RADIUS_M = 7;
const STATION_HEIGHT_M = 1;
const STATION_LABEL_ABOVE_M = 10;
/** Street classes that get a dashed center line. */
const LANE_KINDS = ['trunk', 'primary', 'secondary', 'tertiary'] as const;
/** Lane markings float a little above the asphalt so they don't z-fight with it at distance. */
const LANE_Y = 0.25;

interface TileBox {
  tx: number;
  ty: number;
  /** Display height in metres. */
  h: number;
}

/**
 * The city: asphalt ground, a thin slab on every block tile, the buildings as one merged mesh of
 * solids with roofs and procedural windows (D046), dashed center lines on major streets, the goal block
 * as a white plinth, stations as orange discs, and HTML labels.
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
}) {
  const { blocks, goal } = useMemo(() => classifyTiles(map), [map]);
  const labels = useMemo(() => mapLabels(city, frame, map, heights), [city, frame, map, heights]);
  const buildings = useMemo(
    () =>
      solidsGeometry(buildingsFile.solids, buildingsFile.coordScale, frame, {
        keepClear: pads.map((i) => indexToWorld(frame, map.width, i)),
      }),
    [buildingsFile, frame, pads, map.width],
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
  useEffect(() => () => buildings.dispose(), [buildings]);
  const buildingMaterial = useMemo(
    () =>
      withSeeThrough(
        withWindows(
          new MeshStandardMaterial({ vertexColors: true, roughness: BUILDING_ROUGHNESS }),
        ),
      ),
    [],
  );
  useEffect(() => () => buildingMaterial.dispose(), [buildingMaterial]);

  // Ground: covers the whole grid, centred on the grid (the world origin is the goal, not the grid centre).
  const [gx, gz] = tileToWorld(frame, (map.width - 1) / 2, (map.height - 1) / 2);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[gx, 0, gz]} {...ground}>
        <planeGeometry args={[map.width * TILE_M, map.height * TILE_M]} />
        <meshStandardMaterial color={COLORS.asphalt} />
      </mesh>
      <primitive object={lanes} position-y={LANE_Y} />

      <TileBoxes boxes={blocks} frame={frame} colorOf={blockColor} />
      <TileBoxes boxes={goal} frame={frame} colorOf={goalColor} />
      <mesh geometry={buildings} material={buildingMaterial} />

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

const BLOCK = new Color(COLORS.block);
const GOAL = new Color(COLORS.goal);
const blockColor = (_h: number, out: Color) => out.copy(BLOCK);
const goalColor = (_h: number, out: Color) => out.copy(GOAL);

function classifyTiles(map: TileMap) {
  const blocks: TileBox[] = [];
  const goal: TileBox[] = [];
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const t = map.tiles[ty * map.width + tx];
      if (t === Tile.Goal) goal.push({ tx, ty, h: GOAL_PLINTH_M });
      else if (t === Tile.Building) blocks.push({ tx, ty, h: LOT_M });
    }
  }
  return { blocks, goal };
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

/** One InstancedMesh of tile-sized boxes; matrices and colours are written once when the boxes change. */
function TileBoxes({
  boxes,
  frame,
  colorOf,
}: {
  boxes: TileBox[];
  frame: TileFrame;
  colorOf: (h: number, out: Color) => Color;
}) {
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    const c = new Color();
    boxes.forEach(({ tx, ty, h }, i) => {
      const [x, z] = tileToWorld(frame, tx, ty);
      o.position.set(x, h / 2, z);
      o.scale.set(TILE_M, h, TILE_M);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, colorOf(h, c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes, frame, colorOf]);

  if (boxes.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]}>
      <boxGeometry />
      <meshStandardMaterial />
    </instancedMesh>
  );
}
