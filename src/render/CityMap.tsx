import { useLayoutEffect, useMemo, useRef } from 'react';
import { Object3D, type InstancedMesh } from 'three';
import type { CityFileV0 } from '../sim/cityFile';
import { TILE_M } from '../sim/constants';
import { Tile, type TileMap } from '../sim/map';
import { tileFrame, tileToWorld, type TileFrame } from './coords';
import { LabelLayer, type MapLabel } from './LabelLayer';

const COLORS = {
  asphalt: '#3b3e44',
  building: '#c8b89b',
  goal: '#efe9dc',
  station: '#f28c28',
} as const;
const GOAL_PLINTH_M = 1.5;
const STATION_RADIUS_M = 7;
const STATION_HEIGHT_M = 1;

/**
 * Pass 1 map v0: flat asphalt, one instanced box per building tile, the goal block as a white plinth,
 * stations as orange discs, and HTML labels for streets and stations.
 * TODO(pass-6): merged extruded footprints with real heights, lane lines, slots.
 */
export function CityMap({ city, map }: { city: CityFileV0; map: TileMap }) {
  const frame = useMemo(() => tileFrame(map), [map]);
  const buildings = useMemo(() => tilesOf(map, Tile.Building), [map]);
  const goal = useMemo(() => tilesOf(map, Tile.Goal), [map]);
  const h = city.meta.buildingHeightM;
  const labels = useMemo(() => mapLabels(city, frame), [city, frame]);

  // Ground: covers the whole grid, centred on the grid (the world origin is the goal, not the grid centre).
  const [gx, gz] = tileToWorld(frame, (map.width - 1) / 2, (map.height - 1) / 2);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[gx, 0, gz]}>
        <planeGeometry args={[map.width * TILE_M, map.height * TILE_M]} />
        <meshStandardMaterial color={COLORS.asphalt} />
      </mesh>

      <TileBoxes tiles={buildings} frame={frame} height={h} color={COLORS.building} />
      <TileBoxes tiles={goal} frame={frame} height={GOAL_PLINTH_M} color={COLORS.goal} />

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

/** Street names at street level, station names floating above the rooftops. */
function mapLabels(city: CityFileV0, frame: TileFrame): MapLabel[] {
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
    return {
      text: s.name,
      position: [x, city.meta.buildingHeightM + 4, z],
      className: 'map-label station-label',
    };
  });
  return [...streets, ...stations];
}

function tilesOf(map: TileMap, type: number): [number, number][] {
  const out: [number, number][] = [];
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (map.tiles[ty * map.width + tx] === type) out.push([tx, ty]);
    }
  }
  return out;
}

/** One InstancedMesh of tile-sized boxes; matrices are written once when the tile list changes. */
function TileBoxes({
  tiles,
  frame,
  height,
  color,
}: {
  tiles: [number, number][];
  frame: TileFrame;
  height: number;
  color: string;
}) {
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    tiles.forEach(([tx, ty], i) => {
      const [x, z] = tileToWorld(frame, tx, ty);
      o.position.set(x, height / 2, z);
      o.scale.set(TILE_M, height, TILE_M);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tiles, frame, height]);

  if (tiles.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, tiles.length]}>
      <boxGeometry />
      <meshStandardMaterial color={color} />
    </instancedMesh>
  );
}
