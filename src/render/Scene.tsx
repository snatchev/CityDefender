import { MapControls, Stats } from '@react-three/drei';
import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { game } from '../game';
import { useHud } from '../ui/store';
import type { Ray } from 'three';
import { buildAt, hoverTile, sellAt } from '../planning';
import type { TileMap } from '../sim/map';
import { Barricades } from './Barricades';
import { CityMap, type GroundHandlers } from './CityMap';
import { DevCamera } from './DevCamera';
import { Effects } from './Effects';
import { HpBars } from './HpBars';
import { tileFrame, type TileFrame } from './coords';
import { displayHeights } from './heights';
import { KeyboardCamera } from './KeyboardCamera';
import { pickTile } from './picking';
import { Towers } from './Towers';
import { Mobs } from './Mobs';
import { PlanOverlay } from './PlanOverlay';
import { SimDriver } from './SimDriver';

/** Pointer movement (px) above which a click counts as a camera drag, not a build. */
const CLICK_SLOP_PX = 5;

/**
 * Pointer input on the map: hover previews, left-click builds (barricade on a street, MG Nest on a
 * rooftop, or select a tower), right-click sells a tower or barricade. The tile is found by marching the pointer ray
 * through the height grid, so roofs are picked, not the ground behind them. Clicks that end a
 * camera drag are ignored.
 */
function groundHandlers(frame: TileFrame, map: TileMap, heights: Float32Array): GroundHandlers {
  const maxHeight = heights.reduce((m, h) => Math.max(m, h), 0);
  const tileAt = (ray: Ray) => pickTile(ray, frame, map, heights, maxHeight);
  return {
    onPointerMove: (e) => hoverTile(tileAt(e.ray)),
    onPointerOut: () => hoverTile(null),
    onClick: (e) => {
      if (e.delta > CLICK_SLOP_PX) return;
      const tile = tileAt(e.ray);
      if (tile) buildAt(tile[0], tile[1]);
    },
    onContextMenu: (e) => {
      e.nativeEvent.preventDefault();
      if (e.delta > CLICK_SLOP_PX) return;
      const tile = tileAt(e.ray);
      if (tile) sellAt(tile[0], tile[1]);
    },
  };
}

export function Scene() {
  // Re-render once when the city arrives; the map data itself is read from `game`, not the store.
  const cityName = useHud((s) => s.city?.name);
  const city = cityName ? game.city : null;
  const map = game.world.map;
  const frame = useMemo(() => (map ? tileFrame(map) : null), [map]);
  const heights = useMemo(() => (city && map ? displayHeights(city, map) : null), [city, map]);
  const ground = useMemo(
    () => (frame && map && heights ? groundHandlers(frame, map, heights) : null),
    [frame, map, heights],
  );

  return (
    <Canvas
      className="scene"
      role="application"
      aria-label="City map"
      tabIndex={0}
      dpr={[1, 2]}
      camera={{ position: [120, 720, 820], fov: 45, near: 1, far: 6000 }}
      onCreated={({ gl }) => {
        const ctx = gl.getContext();
        const kind =
          typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext
            ? 'WebGL2'
            : 'WebGL';
        useHud.getState().setRenderer(kind);
      }}
    >
      <color attach="background" args={['#cfd6dc']} />
      <hemisphereLight args={['#f4f1ea', '#5b5347', 1.1]} />
      <directionalLight position={[300, 600, 200]} intensity={1.8} />

      {city && map && frame && heights && ground && (
        <>
          <CityMap city={city} map={map} frame={frame} heights={heights} ground={ground} />
          <Barricades frame={frame} />
          <Towers frame={frame} heights={heights} />
          <Mobs frame={frame} />
          <HpBars frame={frame} />
          <Effects frame={frame} />
          <PlanOverlay frame={frame} />
          {import.meta.env.DEV && <DevCamera frame={frame} heights={heights} width={map.width} />}
        </>
      )}

      <CityHallPlaceholder />

      <MapControls
        makeDefault
        target={[120, 0, 60]}
        enableDamping
        minDistance={80}
        maxDistance={2200}
        maxPolarAngle={Math.PI * 0.42}
      />
      <KeyboardCamera />
      <SimDriver />
      {import.meta.env.DEV && <Stats className="fps-meter" />}
    </Canvas>
  );
}

/** Stand-in for the goal until the real landmark model (Pass 10). */
function CityHallPlaceholder() {
  return (
    <group>
      <mesh position={[0, 25, 0]}>
        <boxGeometry args={[80, 50, 80]} />
        <meshStandardMaterial color="#efe9dc" />
      </mesh>
      <mesh position={[0, 80, 0]}>
        <boxGeometry args={[18, 60, 18]} />
        <meshStandardMaterial color="#e4dccb" />
      </mesh>
      <mesh position={[0, 118, 0]}>
        <coneGeometry args={[4, 16, 8]} />
        <meshStandardMaterial color="#d69e2e" metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}
