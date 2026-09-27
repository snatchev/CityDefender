import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import { Matrix4, Vector3 } from 'three';

export interface MapLabel {
  text: string;
  position: readonly [number, number, number];
  className: string;
}

/**
 * Screen-space HTML labels for many static points, in one plain DOM layer over the canvas.
 * Cheaper than one drei <Html> per label (each of those is its own React root): here the spans
 * are created once and a single useFrame writes their transforms, only when the camera moved.
 */
export function LabelLayer({ labels }: { labels: MapLabel[] }) {
  const gl = useThree((s) => s.gl);
  const spans = useRef<HTMLSpanElement[]>([]);
  /** Camera matrix and viewport size the labels were last placed for; skip frames where neither moved. */
  const last = useRef({ matrix: new Matrix4(), w: 0, h: 0, valid: false });
  const v = useRef(new Vector3());

  useLayoutEffect(() => {
    const layer = document.createElement('div');
    layer.className = 'label-layer';
    spans.current = labels.map((l) => {
      const span = document.createElement('span');
      span.className = l.className;
      // Text goes in an inner span so CSS can turn it (writing-mode) without flipping the positioned box.
      span.appendChild(document.createElement('span')).textContent = l.text;
      layer.appendChild(span);
      return span;
    });
    gl.domElement.parentElement?.appendChild(layer);
    last.current.valid = false;
    return () => {
      layer.remove();
      spans.current = [];
    };
  }, [gl, labels]);

  useFrame(({ camera, size }) => {
    const seen = last.current;
    if (
      seen.valid &&
      seen.w === size.width &&
      seen.h === size.height &&
      seen.matrix.equals(camera.matrixWorld)
    ) {
      return;
    }
    seen.matrix.copy(camera.matrixWorld);
    seen.w = size.width;
    seen.h = size.height;
    seen.valid = true;
    const p = v.current;
    labels.forEach((l, i) => {
      const span = spans.current[i];
      if (!span) return;
      p.set(l.position[0], l.position[1], l.position[2]).project(camera);
      if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) {
        span.style.display = 'none';
        return;
      }
      span.style.display = '';
      const x = ((p.x + 1) / 2) * size.width;
      const y = ((1 - p.y) / 2) * size.height;
      span.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    });
  });

  return null;
}
