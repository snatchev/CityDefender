import { useEffect, useRef } from 'react';
import { cameraBridge } from '../cameraBridge';
import { game } from '../game';
import { activeStations } from '../planning';
import { Tile, type TileMap } from '../sim/map';
import { mobPos } from '../sim/mobs';
import { usePlan } from './planStore';

/** Minimap width in CSS pixels (height follows the map's aspect ratio). */
const WIDTH_PX = 240;
const COLORS = {
  block: '#2c313b',
  street: '#6f7888',
  goal: '#f4efe4',
  route: 'rgba(242, 140, 40, 0.85)',
  stationActive: '#ff8a1f',
  stationIdle: 'rgba(242, 140, 40, 0.35)',
  mob: '#8dff4a',
  tower: '#2fb4ff',
  barricade: '#f2c14e',
  view: 'rgba(255, 255, 255, 0.9)',
};

/**
 * Overhead minimap (top right): the street grid, City Hall, this wave's stations (pulsing) and the
 * routes out of them, live bugs, towers, barricades and the camera's view. The base is rendered once
 * per map; the overlay is redrawn each animation frame straight from the sim (no React state).
 * Clicking moves the camera there.
 */
export function Minimap({ map }: { map: TileMap }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scale = WIDTH_PX / map.width; // CSS px per tile
  const heightPx = Math.round(map.height * scale);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(WIDTH_PX * dpr);
    c.height = Math.round(heightPx * dpr);
    const base = renderBase(map);
    const px = (t: number) => (t + 0.5) * scale; // tile centre → CSS px

    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const world = game.world;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(base, 0, 0, WIDTH_PX, heightPx);

      // Routes from this wave's stations.
      ctx.strokeStyle = COLORS.route;
      ctx.lineWidth = 1.5;
      for (const r of usePlan.getState().routes) {
        ctx.beginPath();
        r.tiles.forEach((i, k) => {
          const x = px(i % map.width);
          const y = px(Math.floor(i / map.width));
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }

      // Barricades and towers.
      ctx.fillStyle = COLORS.barricade;
      for (const b of world.barricades) {
        for (const i of b.tiles)
          ctx.fillRect(px(i % map.width) - 1.5, px(Math.floor(i / map.width)) - 1.5, 3, 3);
      }
      ctx.fillStyle = COLORS.tower;
      for (const t of world.towers) ctx.fillRect(px(t.tx) - 2.5, px(t.ty) - 2.5, 5, 5);

      // Stations: this wave's pulse, the rest are dim.
      const active = new Set(activeStations());
      const pulse = 0.5 + 0.5 * Math.sin(now / 250);
      map.spawns.forEach(([sx, sy], i) => {
        const on = active.has(i);
        ctx.fillStyle = on ? COLORS.stationActive : COLORS.stationIdle;
        ctx.beginPath();
        ctx.arc(px(sx), px(sy), on ? 3.5 + 2 * pulse : 2.5, 0, Math.PI * 2);
        ctx.fill();
        if (on) {
          ctx.strokeStyle = COLORS.stationActive;
          ctx.globalAlpha = 1 - pulse;
          ctx.beginPath();
          ctx.arc(px(sx), px(sy), 6 + 8 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      });

      // Bugs.
      ctx.fillStyle = COLORS.mob;
      for (const m of world.mobs) {
        const [x, y] = mobPos(m);
        ctx.fillRect(px(x) - 1.5, px(y) - 1.5, 3, 3);
      }

      // Camera: where it looks and which way.
      const v = cameraBridge.view;
      const cx = px(v.tx);
      const cy = px(v.ty);
      const reach = Math.min(40, 10 + v.distM * scale * 0.04);
      ctx.strokeStyle = COLORS.view;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(
        cx - Math.cos(v.yaw) * reach + Math.cos(v.yaw + Math.PI / 2) * reach * 0.6,
        cy - Math.sin(v.yaw) * reach + Math.sin(v.yaw + Math.PI / 2) * reach * 0.6,
      );
      ctx.lineTo(cx, cy);
      ctx.lineTo(
        cx - Math.cos(v.yaw) * reach - Math.cos(v.yaw + Math.PI / 2) * reach * 0.6,
        cy - Math.sin(v.yaw) * reach - Math.sin(v.yaw + Math.PI / 2) * reach * 0.6,
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [map, scale, heightPx]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tx = Math.floor(((e.clientX - r.left) / r.width) * map.width);
    const ty = Math.floor(((e.clientY - r.top) / r.height) * map.height);
    cameraBridge.focusTile?.(tx, ty);
  };

  return (
    <canvas
      ref={canvas}
      className="minimap"
      style={{ width: WIDTH_PX, height: heightPx }}
      role="img"
      aria-label="Minimap"
      onClick={onClick}
    />
  );
}

/** The static layer: blocks, streets and City Hall, one pixel per tile (scaled up when drawn). */
function renderBase(map: TileMap): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = map.width;
  c.height = map.height;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(map.width, map.height);
  const rgb = (hex: string) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const block = rgb(COLORS.block);
  const street = rgb(COLORS.street);
  const goal = rgb(COLORS.goal);
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    const [r, g, b] = t === Tile.Street ? street : t === Tile.Goal ? goal : block;
    img.data.set([r!, g!, b!, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
