import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import { Vector3 } from 'three';

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
  const lastCamera = useRef('');

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
    lastCamera.current = '';
    return () => {
      layer.remove();
      spans.current = [];
    };
  }, [gl, labels]);

  const v = new Vector3();
  useFrame(({ camera, size }) => {
    const key = `${camera.matrixWorld.elements.join(',')}|${size.width}x${size.height}`;
    if (key === lastCamera.current) return;
    lastCamera.current = key;
    labels.forEach((l, i) => {
      const span = spans.current[i];
      if (!span) return;
      v.set(l.position[0], l.position[1], l.position[2]).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
        span.style.display = 'none';
        return;
      }
      span.style.display = '';
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      span.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    });
  });

  return null;
}
