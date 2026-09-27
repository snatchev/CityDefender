import { MapControls, Stats } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import { game } from '../game';
import { usePlan } from '../ui/planStore';
import { useHud } from '../ui/store';
import { Backdrop } from './Backdrop';
import { Barricades } from './Barricades';
import { CityHall } from './CityHall';
import { CityMap } from './CityMap';
import { tileFrame } from './coords';
import { DevCamera } from './DevCamera';
import { Effects } from './Effects';
import { displayHeights } from './heights';
import { HpBars } from './HpBars';
import { KeyboardCamera } from './KeyboardCamera';
import { MapDebug } from './MapDebug';
import { Mobs } from './Mobs';
import { PlanOverlay } from './PlanOverlay';
import { groundHandlers } from './pointer';
import { SimDriver } from './SimDriver';
import { SkyDome } from './SkyDome';
import { SlotMarkers } from './SlotMarkers';
import { Towers } from './Towers';

/** Horizon haze: fog and background share it so the backdrop city fades into the sky. */
const HAZE = '#c9d3db';
const FOG_NEAR_M = 1600;
const FOG_FAR_M = 6500;
/** Sky dome around the camera; inside the far plane. */
const SKY_RADIUS_M = 12000;
const SKY_ZENITH = '#5b8fcc';
const CAMERA_FAR_M = 16000;
const MAX_ZOOM_OUT_M = 3000;
/** Late-morning sun from the south-east (the directional light). */
const SUN_POSITION: [number, number, number] = [900, 1100, 700];

export function Scene() {
  // Re-render once when the city arrives; the map data itself is read from `game`, not the store.
  const cityName = useHud((s) => s.city?.name);
  const city = cityName ? game.city : null;
  const buildingsFile = cityName ? game.buildings : null;
  const backdrop = cityName ? game.backdrop : null;
  const slots = cityName ? game.world.slots : null;
  const debugMap = usePlan((p) => p.debugMap);
  const map = game.world.map;
  const frame = useMemo(() => (map ? tileFrame(map) : null), [map]);
  const heights = useMemo(() => (city && map ? displayHeights(map) : null), [city, map]);
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
      camera={{ position: [120, 720, 820], fov: 45, near: 1, far: CAMERA_FAR_M }}
      onCreated={({ gl }) => {
        const ctx = gl.getContext();
        const kind =
          typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext
            ? 'WebGL2'
            : 'WebGL';
        useHud.getState().setRenderer(kind);
      }}
    >
      <color attach="background" args={[HAZE]} />
      <fog attach="fog" args={[HAZE, FOG_NEAR_M, FOG_FAR_M]} />
      <SkyDome zenith={SKY_ZENITH} horizon={HAZE} radius={SKY_RADIUS_M} />
      <hemisphereLight args={['#f4f1ea', '#5b5347', 1.1]} />
      <directionalLight position={SUN_POSITION} intensity={1.8} />
      {backdrop && frame && <Backdrop file={backdrop} frame={frame} />}

      {city && buildingsFile && map && frame && heights && ground && (
        <>
          <CityMap
            city={city}
            buildingsFile={buildingsFile}
            map={map}
            frame={frame}
            heights={heights}
            ground={ground}
          />
          {slots && <SlotMarkers slots={slots} frame={frame} width={map.width} heights={heights} />}
          {slots && debugMap && <MapDebug slots={slots} frame={frame} width={map.width} />}
          <Barricades frame={frame} />
          <Towers frame={frame} heights={heights} />
          <Mobs frame={frame} />
          <HpBars frame={frame} />
          <Effects frame={frame} />
          <PlanOverlay frame={frame} />
          {import.meta.env.DEV && <DevCamera frame={frame} heights={heights} width={map.width} />}
        </>
      )}

      <CityHall />

      <MapControls
        makeDefault
        target={[120, 0, 60]}
        enableDamping
        minDistance={80}
        maxDistance={MAX_ZOOM_OUT_M}
        maxPolarAngle={Math.PI * 0.42}
      />
      <KeyboardCamera />
      <SimDriver />
      {import.meta.env.DEV && <Stats className="fps-meter" />}
    </Canvas>
  );
}
