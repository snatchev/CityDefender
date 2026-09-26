import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Object3D, type InstancedMesh } from 'three';
import mapData from '../data/map.json';
import { cityHeights, compressHeight, type CityFileV0 } from '../sim/cityFile';
import { TILE_M } from '../sim/constants';
import { Tile, type TileMap } from '../sim/map';
import { tileFrame, tileToWorld, type TileFrame } from './coords';
import { LabelLayer, type MapLabel } from './LabelLayer';

const COLORS = {
  asphalt: '#3b3e44',
  lot: '#77756f',
  /** Low buildings (rowhouses, brick) … */
  buildingLow: '#c8b89b',
  /** … blend toward this for towers. */
  buildingHigh: '#9fb0c0',
  goal: '#efe9dc',
  station: '#f28c28',
} as const;
/** Display heights (m) between which building colour blends from low to high. */
const TINT_FROM_M = 16;
const TINT_TO_M = 55;
const LOT_M = 0.4;
const GOAL_PLINTH_M = 1.5;
const STATION_RADIUS_M = 7;
const STATION_HEIGHT_M = 1;
const STATION_LABEL_ABOVE_M = 10;

interface TileBox {
  tx: number;
  ty: number;
  /** Display height in metres. */
  h: number;
}

/**
 * Map v0: flat asphalt, one instanced box per building tile at its (compressed) real height, open lots
 * as low slabs, the goal block as a white plinth, stations as orange discs, and HTML labels.
 * TODO(pass-6): merged extruded footprints, lane lines, slots.
 */
export function CityMap({ city, map }: { city: CityFileV0; map: TileMap }) {
  const frame = useMemo(() => tileFrame(map), [map]);
  const { buildings, lots, goal } = useMemo(() => classifyTiles(city, map), [city, map]);
  const labels = useMemo(() => mapLabels(city, frame, buildings), [city, frame, buildings]);

  // Ground: covers the whole grid, centred on the grid (the world origin is the goal, not the grid centre).
  const [gx, gz] = tileToWorld(frame, (map.width - 1) / 2, (map.height - 1) / 2);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[gx, 0, gz]}>
        <planeGeometry args={[map.width * TILE_M, map.height * TILE_M]} />
        <meshStandardMaterial color={COLORS.asphalt} />
      </mesh>

      <TileBoxes boxes={buildings} frame={frame} colorOf={buildingColor} />
      <TileBoxes boxes={lots} frame={frame} colorOf={lotColor} />
      <TileBoxes boxes={goal} frame={frame} colorOf={goalColor} />

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

const LOW = new Color(COLORS.buildingLow);
const HIGH = new Color(COLORS.buildingHigh);
const LOT = new Color(COLORS.lot);
const GOAL = new Color(COLORS.goal);

function buildingColor(h: number, out: Color): Color {
  const t = Math.min(1, Math.max(0, (h - TINT_FROM_M) / (TINT_TO_M - TINT_FROM_M)));
  return out.copy(LOW).lerp(HIGH, t);
}
const lotColor = (_h: number, out: Color) => out.copy(LOT);
const goalColor = (_h: number, out: Color) => out.copy(GOAL);

function classifyTiles(city: CityFileV0, map: TileMap) {
  const heights = cityHeights(city);
  const buildings: TileBox[] = [];
  const lots: TileBox[] = [];
  const goal: TileBox[] = [];
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const i = ty * map.width + tx;
      const t = map.tiles[i];
      if (t === Tile.Goal) goal.push({ tx, ty, h: GOAL_PLINTH_M });
      else if (t === Tile.Building) {
        const h = compressHeight(heights[i]!, mapData.heightCompressionK);
        if (h > 0) buildings.push({ tx, ty, h });
        else lots.push({ tx, ty, h: LOT_M });
      }
    }
  }
  return { buildings, lots, goal };
}

/** Street names at street level; station names float above the tallest nearby roof. */
function mapLabels(city: CityFileV0, frame: TileFrame, buildings: TileBox[]): MapLabel[] {
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
    const roof = buildings
      .filter((b) => Math.abs(b.tx - s.tx) <= 3 && Math.abs(b.ty - s.ty) <= 3)
      .reduce((m, b) => Math.max(m, b.h), 0);
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
