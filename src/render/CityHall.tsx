import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Color, MeshStandardMaterial } from 'three';
import { game, renderAlpha } from '../game';
import type { SolidRecord } from '../sim/cityFile';
import { TICK_DT } from '../sim/constants';
import { solidsGeometry } from './buildingMesh';
import type { TileFrame } from './coords';
import { withWindows } from './facades';
import { withSeeThrough } from './seeThrough';

/** How long City Hall glows red after a bug reaches it. */
const FLASH_S = 0.6;
const FLASH_COLOR = new Color('#ff2a1a');
const FLASH_INTENSITY = 1.4;
const ROUGHNESS = 0.85;

/**
 * The goal landmark, built from its OSM relation and parts with hand-set heights (tools/map city
 * config, D046): the marble block, the pavilions with their mansards and turrets, the tower, and
 * William Penn. Flashes red whenever a bug reaches it (DESIGN §10: readable feedback), reading
 * `world.fx.goalHits`.
 */
export function CityHall({
  solids,
  coordScale,
  frame,
  heightScale,
}: {
  solids: readonly SolidRecord[];
  coordScale: number;
  frame: TileFrame;
  /** Drawn at this share of its height (tactical view, D050). */
  heightScale: number;
}) {
  const geometry = useMemo(
    () => solidsGeometry(solids, coordScale, frame, { landmark: true }),
    [solids, coordScale, frame],
  );
  const material = useMemo(
    () =>
      // See-through too: the camera rides routes that end at City Hall, so its tower is often in
      // the way (D054). A small mesh, so plain `discard` costs nothing measurable here.
      withSeeThrough(
        withWindows(
          new MeshStandardMaterial({
            vertexColors: true,
            roughness: ROUGHNESS,
            emissive: FLASH_COLOR,
          }),
        ),
      ),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const world = game.world;
    const last = world.fx.goalHits[world.fx.goalHits.length - 1];
    const age = last ? (world.tick + renderAlpha() - last.tick) * TICK_DT : Infinity;
    material.emissiveIntensity = Math.max(0, 1 - age / FLASH_S) * FLASH_INTENSITY;
  });

  return <mesh name="cityHall" geometry={geometry} material={material} scale-y={heightScale} />;
}
