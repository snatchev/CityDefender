import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BackSide, Color, ShaderMaterial, Vector3, type Mesh } from 'three';
import { daylight, daylightVersion } from './daylight';

/**
 * A gradient sky dome following the time of day (daylight.ts): the zenith colour overhead fading to
 * the horizon colour, the haze below the horizon (it matches the fog, so the backdrop city melts
 * into it), and a soft glow and disc around the sun or moon. Follows the camera (so it never gets
 * clipped or approached), ignores fog and depth, and draws first. Dithered so the long, shallow
 * gradients don't band.
 */
export function SkyDome({
  radius,
}: {
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
          zenith: { value: new Color() },
          horizon: { value: new Color() },
          haze: { value: new Color() },
          sunDir: { value: new Vector3(0, 1, 0) },
          glow: { value: new Color() },
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
          uniform vec3 haze;
          uniform vec3 sunDir;
          uniform vec3 glow;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            // 0 at the horizon, 1 straight up; eased so the horizon band is wide.
            float t = pow(clamp(d.y, 0.0, 1.0), 0.45);
            vec3 col = mix(horizon, zenith, t);
            // Below the horizon: the haze (what the fog fades the far city into).
            col = mix(col, haze, smoothstep(0.0, -0.04, d.y));
            // Sun or moon: a wide halo, a tighter glow and a small disc.
            float c = max(dot(d, sunDir), 0.0);
            col += glow * (0.25 * pow(c, 6.0) + 0.6 * pow(c, 90.0) + 3.0 * smoothstep(0.9993, 0.9996, c));
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
            // Dither by half an 8-bit step against banding.
            float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            gl_FragColor.rgb += (n - 0.5) / 255.0;
          }`,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const seen = useRef(-1);

  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
    const v = daylightVersion();
    if (v === seen.current) return;
    seen.current = v;
    const d = daylight();
    const u = material.uniforms;
    (u.zenith!.value as Color).copy(d.skyZenith);
    (u.horizon!.value as Color).copy(d.skyHorizon);
    (u.haze!.value as Color).copy(d.haze);
    (u.sunDir!.value as Vector3).copy(d.sunDir);
    (u.glow!.value as Color).copy(d.glowColor).multiplyScalar(d.glowStrength);
  });

  return (
    <mesh ref={ref} material={material} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[radius, 48, 24]} />
    </mesh>
  );
}
