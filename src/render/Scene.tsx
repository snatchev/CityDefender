import { MapControls, Stats } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { game } from '../game';
import { useHud } from '../ui/store';
import { CityMap } from './CityMap';
import { SimDriver } from './SimDriver';

export function Scene() {
  // Re-render once when the city arrives; the map data itself is read from `game`, not the store.
  const cityName = useHud((s) => s.city?.name);
  const city = cityName ? game.city : null;
  const map = game.world.map;

  return (
    <Canvas
      className="scene"
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

      {city && map && <CityMap city={city} map={map} />}

      <CityHallPlaceholder />

      <MapControls
        makeDefault
        target={[120, 0, 60]}
        enableDamping
        minDistance={80}
        maxDistance={2200}
        maxPolarAngle={Math.PI * 0.42}
      />
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
