import { MapControls, Stats } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { MOUSE } from 'three';
import { useMemo } from 'react';
import { registerRenderer } from '../debug/devHook';
import { game } from '../game';
import { usePlan } from '../ui/planStore';
import { useHud } from '../ui/store';
import { Backdrop } from './Backdrop';
import { Barricades } from './Barricades';
import { CityHall } from './CityHall';
import { CityMap } from './CityMap';
import { tileFrame } from './coords';
import { CameraBounds } from './CameraBounds';
import { CameraBridge } from './CameraBridge';
import { Effects } from './Effects';
import { displayHeights, TACTICAL_HEIGHT_SCALE } from './heights';
import { HpBars } from './HpBars';
import { KeyboardCamera } from './KeyboardCamera';
import { HEMI_GROUND, HEMI_INTENSITY, HEMI_SKY, SUN_INTENSITY, SUN_POSITION } from './lighting';
import { MapDebug } from './MapDebug';
import { Mobs } from './Mobs';
import { PlanOverlay } from './PlanOverlay';
import { RouteFocus } from './RouteFocus';
import { GrabPan } from './GrabPan';
import { groundHandlers } from './pointer';
import { SeeThroughDriver } from './SeeThroughDriver';
import { Shots } from './Shots';
import { SimDriver } from './SimDriver';
import { SkyDome } from './SkyDome';
import { StreetLifeLayer } from './ambient/StreetLife';
import { SlotMarkers } from './SlotMarkers';
import { TacticalView } from './TacticalView';
import { Towers } from './Towers';

/** Horizon haze: fog and background share it so the backdrop city fades into the sky. */
const HAZE = '#c9d3db';
const FOG_NEAR_M = 1600;
const FOG_FAR_M = 6500;
/** Sky dome around the camera; inside the far plane. */
const SKY_RADIUS_M = 12000;
const SKY_ZENITH = '#5b8fcc';
/**
 * Depth precision scales with near / far: keep near as large as the closest zoom allows (minDistance
 * is 80 m) so distant, nearly coplanar surfaces don't z-fight.
 */
const CAMERA_NEAR_M = 4;
const CAMERA_FAR_M = 16000;
const MAX_ZOOM_OUT_M = 3000;
/** OrbitControls ignores a mouse button mapped to -1 (three has no named constant for it). */
const NO_BUTTON = -1 as MOUSE;

export function Scene() {
  // Re-render once when the city arrives; the map data itself is read from `game`, not the store.
  const cityName = useHud((s) => s.city?.name);
  const city = cityName ? game.city : null;
  const buildingsFile = cityName ? game.buildings : null;
  const backdrop = cityName ? game.backdrop : null;
  const slots = cityName ? game.world.slots : null;
  const debugMap = usePlan((p) => p.debugMap);
  const tactical = usePlan((p) => p.tactical);
  const heightScale = tactical ? TACTICAL_HEIGHT_SCALE : 1;
  const showFps = useHud((s) => s.showFps);
  const map = game.world.map;
  const frame = useMemo(() => (map ? tileFrame(map) : null), [map]);
  const heights = useMemo(
    () => (city && map && buildingsFile ? displayHeights(map, buildingsFile, heightScale) : null),
    [city, map, buildingsFile, heightScale],
  );
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
      camera={{ position: [120, 720, 820], fov: 45, near: CAMERA_NEAR_M, far: CAMERA_FAR_M }}
      onCreated={({ gl, scene, camera }) => {
        const ctx = gl.getContext();
        const kind =
          typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext
            ? 'WebGL2'
            : 'WebGL';
        useHud.getState().setRenderer(kind);
        if (import.meta.env.DEV) registerRenderer(gl, scene, camera);
      }}
    >
      <color attach="background" args={[HAZE]} />
      <fog attach="fog" args={[HAZE, FOG_NEAR_M, FOG_FAR_M]} />
      <SkyDome zenith={SKY_ZENITH} horizon={HAZE} radius={SKY_RADIUS_M} />
      <hemisphereLight args={[HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY]} />
      <directionalLight position={SUN_POSITION} intensity={SUN_INTENSITY} />
      {backdrop && frame && <Backdrop file={backdrop} frame={frame} heightScale={heightScale} />}

      {city && buildingsFile && map && frame && heights && ground && (
        <>
          {/* First in the frame after the controls, so everything below sees the clamped view. */}
          <CameraBounds frame={frame} width={map.width} height={map.height} />
          <CityMap
            city={city}
            buildingsFile={buildingsFile}
            map={map}
            frame={frame}
            heights={heights}
            ground={ground}
            pads={slots?.pads ?? []}
            heightScale={heightScale}
          />
          <CityHall
            solids={buildingsFile.landmark}
            coordScale={buildingsFile.coordScale}
            frame={frame}
            heightScale={heightScale}
          />
          {slots && <SlotMarkers slots={slots} frame={frame} width={map.width} heights={heights} />}
          {slots && debugMap && <MapDebug slots={slots} frame={frame} width={map.width} />}
          <StreetLifeLayer frame={frame} />
          <Barricades frame={frame} />
          <Towers frame={frame} heights={heights} />
          <Shots frame={frame} heights={heights} />
          <Mobs frame={frame} />
          <HpBars frame={frame} />
          <Effects frame={frame} />
          <PlanOverlay frame={frame} heights={heights} />
          <RouteFocus frame={frame} width={map.width} />
          <TacticalView />
          <SeeThroughDriver />
          <CameraBridge frame={frame} heights={heights} width={map.width} />
        </>
      )}

      <MapControls
        makeDefault
        target={[120, 0, 60]}
        enableDamping
        minDistance={80}
        maxDistance={MAX_ZOOM_OUT_M}
        maxPolarAngle={Math.PI * 0.42}
        // Left drag is grab panning (GrabPan; with Ctrl/Cmd/Shift it's MapControls' rotate); the
        // wheel zooms, right drag rotates.
        mouseButtons={{ LEFT: NO_BUTTON, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }}
      />
      <GrabPan />
      <KeyboardCamera />
      <SimDriver />
      {showFps && <Stats className="fps-meter" />}
    </Canvas>
  );
}
