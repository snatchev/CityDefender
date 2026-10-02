import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, MeshStandardMaterial, type Group } from 'three';
import { game, renderAlpha } from '../game';
import type { SolidRecord } from '../sim/cityFile';
import { TICK_DT } from '../sim/constants';
import { solidsGeometry } from './buildingMesh';
import type { TileFrame } from './coords';
import { withWindows } from './facades';
import {
  CITY_HALL_ID,
  fadingOccluders,
  GHOST_COLOR_ORDER,
  GHOST_DEPTH_ORDER,
  ghostMaterials,
  hideWhenFaded,
} from './seeThrough';

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
    () => solidsGeometry(solids, coordScale, frame, { landmark: true, ids: CITY_HALL_ID }),
    [solids, coordScale, frame],
  );
  const material = useMemo(
    () =>
      // See-through as one building when it's in the way of the track (D055): routes end at City
      // Hall, so its tower often is.
      hideWhenFaded(
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
  const ghost = useMemo(() => ghostMaterials(true), []);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(
    () => () => {
      ghost.depth.dispose();
      ghost.color.dispose();
    },
    [ghost],
  );
  const ghostRef = useRef<Group>(null);

  useFrame(() => {
    const world = game.world;
    const last = world.fx.goalHits[world.fx.goalHits.length - 1];
    const age = last ? (world.tick + renderAlpha() - last.tick) * TICK_DT : Infinity;
    material.emissiveIntensity = Math.max(0, 1 - age / FLASH_S) * FLASH_INTENSITY;
    if (ghostRef.current) ghostRef.current.visible = fadingOccluders().has(CITY_HALL_ID);
  });

  return (
    <group name="cityHall" scale-y={heightScale}>
      <mesh geometry={geometry} material={material} />
      <group ref={ghostRef} visible={false}>
        <mesh geometry={geometry} material={ghost.depth} renderOrder={GHOST_DEPTH_ORDER} />
        <mesh geometry={geometry} material={ghost.color} renderOrder={GHOST_COLOR_ORDER} />
      </group>
    </group>
  );
}
