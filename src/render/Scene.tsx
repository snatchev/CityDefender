import { Grid, MapControls, Stats } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { TILE_M } from '../sim/constants';
import { useHud } from '../ui/store';
import { SimDriver } from './SimDriver';

/** Planned level size (DESIGN §4): ~160 × 150 tiles around City Hall. Replaced by map data in Pass 1. */
const LEVEL_W = 160 * TILE_M;
const LEVEL_D = 150 * TILE_M;

export function Scene() {
  return (
    <Canvas
      className="scene"
      dpr={[1, 2]}
      camera={{ position: [0, 520, 640], fov: 45, near: 1, far: 5000 }}
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

      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[LEVEL_W, LEVEL_D]} />
        <meshStandardMaterial color="#b9b2a3" />
      </mesh>
      <Grid
        position={[0, 0.05, 0]}
        args={[LEVEL_W, LEVEL_D]}
        cellSize={TILE_M}
        cellThickness={0.5}
        cellColor="#8f887b"
        sectionSize={TILE_M * 8}
        sectionThickness={1}
        sectionColor="#5a5f68"
        fadeDistance={3000}
        fadeStrength={1}
      />

      <CityHallPlaceholder />

      <MapControls
        makeDefault
        target={[0, 0, 0]}
        enableDamping
        minDistance={80}
        maxDistance={1800}
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
