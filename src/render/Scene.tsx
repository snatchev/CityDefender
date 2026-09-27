import { MapControls, Stats } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import { game } from '../game';
import { usePlan } from '../ui/planStore';
import { useHud } from '../ui/store';
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
import { SlotMarkers } from './SlotMarkers';
import { Towers } from './Towers';

export function Scene() {
  // Re-render once when the city arrives; the map data itself is read from `game`, not the store.
  const cityName = useHud((s) => s.city?.name);
  const city = cityName ? game.city : null;
  const buildingsFile = cityName ? game.buildings : null;
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
        maxDistance={2200}
        maxPolarAngle={Math.PI * 0.42}
      />
      <KeyboardCamera />
      <SimDriver />
      {import.meta.env.DEV && <Stats className="fps-meter" />}
    </Canvas>
  );
}
