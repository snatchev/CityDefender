import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Box3, Color, DirectionalLight, Fog, HemisphereLight, Object3D, Vector3 } from 'three';
import { game } from '../game';
import {
  DAYLIGHT,
  daylight,
  requestShadowUpdate,
  SHADOW_LAYER,
  shadowCasters,
  stepDaylight,
  takeShadowUpdate,
} from './daylight';
import { updateFacadeLight } from './facades';

/** Shadow camera: how far back along the light it stands from the casters' bounds (m). */
const LIGHT_BACK_M = 200;

/**
 * The time of day (Pass 10b, daylight.ts): steps the clock from the wave and phase, and moves the
 * hemisphere light, the sun (the moon at night), the fog and the background with it. Everything
 * else that is lit reads `daylight()` itself.
 *
 * The sun casts one shadow map over the level's buildings. The city is static, so the map is only
 * redrawn when asked (`requestShadowUpdate`): when the sun moves (between waves), when the buildings
 * change (load, tactical squash), and at load. Only dedicated caster meshes (the low-detail
 * buildings and City Hall, on `SHADOW_LAYER`, never drawn by the camera) draw into it; bugs and
 * towers don't.
 */
export function Daylight({ heightScale }: { heightScale: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const { sun, hemi } = useMemo(() => {
    const sun = new DirectionalLight();
    sun.castShadow = true;
    const s = DAYLIGHT.shadow;
    sun.shadow.mapSize.set(s.mapSize, s.mapSize);
    sun.shadow.bias = s.bias;
    sun.shadow.normalBias = s.normalBias;
    sun.shadow.radius = s.radius;
    const hemi = new HemisphereLight();
    return { sun, hemi };
  }, []);
  useEffect(() => () => sun.dispose(), [sun]);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    requestShadowUpdate();
  }, [gl]);
  useEffect(() => {
    scene.fog = new Fog(new Color(), 1, 2);
    scene.background = new Color();
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene]);
  useEffect(() => requestShadowUpdate(), [heightScale]);

  const tmp = useMemo(
    () => ({ box: new Box3(), centre: new Vector3(), corner: new Vector3(), changed: true }),
    [],
  );

  useFrame(({ camera }, delta) => {
    // three's shadow pass picks casters by the viewing camera's layers: the camera sees the shadow
    // layer only for the one frame the map is redrawn (the casters draw nothing visible then).
    camera.layers.disable(SHADOW_LAYER);
    const w = game.world;
    const changed = stepDaylight(delta, game.city?.meta.city ?? null, w.wave, w.phase);
    if (changed || tmp.changed) {
      tmp.changed = false;
      const d = daylight();
      hemi.color.copy(d.hemiSky);
      hemi.groundColor.copy(d.hemiGround);
      hemi.intensity = d.hemiIntensity;
      sun.color.copy(d.sunColor);
      sun.intensity = d.sunIntensity;
      sun.shadow.intensity = d.shadowIntensity;
      if (scene.fog instanceof Fog) {
        scene.fog.color.copy(d.haze);
        scene.fog.near = d.fogNearM;
        scene.fog.far = d.fogFarM;
      }
      if (scene.background instanceof Color) scene.background.copy(d.haze);
      updateFacadeLight(d);
      requestShadowUpdate();
    }
    if (takeShadowUpdate()) {
      fitShadow(sun, shadowCasters(), tmp);
      // The renderer never redraws it on its own (autoUpdate is off).
      gl.shadowMap.needsUpdate = true;
      camera.layers.enable(SHADOW_LAYER);
    }
  });

  return (
    <>
      <primitive object={hemi} />
      <primitive object={sun} />
      <primitive object={sun.target} />
    </>
  );
}

/** Aim the sun at the casters' bounds and fit its orthographic shadow camera tightly around them. */
function fitShadow(
  sun: DirectionalLight,
  casters: ReadonlySet<Object3D>,
  tmp: { box: Box3; centre: Vector3; corner: Vector3 },
): void {
  const { box, centre, corner } = tmp;
  box.makeEmpty();
  for (const o of casters) {
    o.updateWorldMatrix(true, true);
    box.expandByObject(o);
  }
  const d = daylight();
  if (box.isEmpty()) box.setFromCenterAndSize(centre.set(0, 0, 0), corner.set(100, 100, 100));
  box.getCenter(centre);
  const radius = box.getSize(corner).length() / 2;
  sun.target.position.copy(centre);
  sun.position.copy(centre).addScaledVector(d.sunDir, radius + LIGHT_BACK_M);
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();

  const cam = sun.shadow.camera;
  cam.position.copy(sun.position);
  cam.lookAt(centre);
  cam.updateMatrixWorld();
  const inv = cam.matrixWorldInverse;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner
      .set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      )
      .applyMatrix4(inv);
    x0 = Math.min(x0, corner.x);
    x1 = Math.max(x1, corner.x);
    y0 = Math.min(y0, corner.y);
    y1 = Math.max(y1, corner.y);
    z0 = Math.min(z0, -corner.z);
    z1 = Math.max(z1, -corner.z);
  }
  const pad = DAYLIGHT.shadow.paddingM;
  cam.left = x0 - pad;
  cam.right = x1 + pad;
  cam.bottom = y0 - pad;
  cam.top = y1 + pad;
  cam.near = Math.max(1, z0 - pad);
  cam.far = z1 + pad;
  cam.updateProjectionMatrix();
}
