import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BackSide, Color, ShaderMaterial, type Mesh } from 'three';

/**
 * A gradient sky dome: deep blue overhead fading to the horizon haze, which matches the fog colour
 * so the backdrop city melts into it. Follows the camera (so it never gets clipped or approached),
 * ignores fog and depth, and draws first.
 */
export function SkyDome({
  zenith,
  horizon,
  radius,
}: {
  zenith: string;
  horizon: string;
  /** Must fit inside the camera's far plane. */
  radius: number;
}) {
  const ref = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          zenith: { value: new Color(zenith) },
          horizon: { value: new Color(horizon) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 zenith;
          uniform vec3 horizon;
          varying vec3 vDir;
          void main() {
            // 0 at and below the horizon, 1 straight up; eased so the haze band is wide.
            float t = pow(clamp(vDir.y, 0.0, 1.0), 0.45);
            gl_FragColor = vec4(mix(horizon, zenith, t), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [zenith, horizon],
  );

  useFrame(({ camera }) => ref.current?.position.copy(camera.position));

  return (
    <mesh ref={ref} material={material} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  );
}
