import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { PerspectiveCamera } from 'three';
import type { BackdropFileV0, BuildingsFileV1, SolidRecord } from '../sim/cityFile';
import { backdropCells } from './Backdrop';
import { uvToWorld, type TileFrame } from './coords';
import type { OccluderShape, XZ } from './occluders';
import { rail } from './RailCamera';
import {
  CITY_HALL_ID,
  occluderIds,
  setSeeThroughTrack,
  setOccluders,
  setSeeThroughHeightScale,
  updateSeeThrough,
} from './seeThrough';
import type { Track } from './track';

/**
 * Feeds the see-through fade (seeThrough.ts, D055): the buildings that can fade (the level's,
 * City Hall as one, and the near backdrop's boxes) once, then every frame the rail camera's active
 * track and the camera.
 */
export function SeeThroughDriver({
  buildings,
  backdrop,
  frame,
  heightScale,
}: {
  buildings: BuildingsFileV1;
  backdrop: BackdropFileV0 | null;
  frame: TileFrame;
  heightScale: number;
}) {
  useEffect(() => {
    const scale = buildings.coordScale;
    const solid = (s: SolidRecord, id: number): OccluderShape => ({
      id,
      rings: s.rings.map((flat) => {
        const pts: XZ[] = [];
        for (let i = 0; i + 1 < flat.length; i += 2)
          pts.push(uvToWorld(frame, flat[i]! / scale, flat[i + 1]! / scale));
        return pts;
      }),
      base: s.base ?? 0,
      top: s.h + (s.rise ?? 0),
    });
    const ids = occluderIds(buildings.solids);
    const shapes: OccluderShape[] = [
      ...buildings.landmark.map((s) => solid(s, CITY_HALL_ID)),
      ...buildings.solids.map((s, i) => solid(s, ids.ofSolid[i]!)),
    ];
    const near = backdrop?.layers[0];
    const boxes = near ? backdropCells(near) : [];
    if (near)
      boxes.forEach(({ cx, cy, h }, k) => {
        const c = near.cellTiles;
        const [u, v] = [near.u0 + cx * c, near.v0 + cy * c];
        const ring = [
          uvToWorld(frame, u, v),
          uvToWorld(frame, u + c, v),
          uvToWorld(frame, u + c, v + c),
          uvToWorld(frame, u, v + c),
        ];
        shapes.push({ id: ids.backdrop0 + k, rings: [ring], base: 0, top: h });
      });
    setOccluders(shapes, ids.backdrop0 + boxes.length);
  }, [buildings, backdrop, frame]);
  useEffect(() => setSeeThroughHeightScale(heightScale), [heightScale]);

  const last = useRef<Track | null>(null);
  useEffect(() => () => setSeeThroughTrack(null), []);
  useFrame(({ camera, clock }, delta) => {
    if (rail.track !== last.current) {
      last.current = rail.track;
      setSeeThroughTrack(rail.track);
    }
    updateSeeThrough(camera as PerspectiveCamera, clock.elapsedTime, delta);
  });
  return null;
}
