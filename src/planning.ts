import towersData from './data/towers.json';
import { game, publish } from './game';
import {
  barricadeSpan,
  canEditBarricades,
  dismantleBarricade,
  placeBarricade,
  previewField,
} from './sim/barricades';
import { TILE_M } from './sim/constants';
import { tracePath } from './sim/flow';
import { Tile } from './sim/map';
import { placeTower, towerSiteError } from './sim/towers';
import { usePlan, type Route } from './ui/planStore';
import { useHud } from './ui/store';

/**
 * Planning glue between input and the sim: hover previews (ghost barricade + ghost routes + detour
 * meter on streets, ghost tower + range on rooftops), placing and dismantling, and the routes from
 * the stations active this wave. Recomputes only when the hovered tile, the wave or the flow field
 * changes.
 */

let hovered: [number, number] | null = null;
let routesKey = '';

/** Stations that send bugs in the current wave (or would, during prep). */
export function activeStations(): number[] {
  const w = game.world;
  const wave = w.waves[w.wave];
  if (!wave) return [];
  return [...new Set(wave.groups.map((g) => g.spawnIndex))];
}

function routesFrom(field: Float64Array, extraCost: Float64Array): Route[] {
  const map = game.world.map;
  if (!map) return [];
  const out: Route[] = [];
  for (const station of activeStations()) {
    const [sx, sy] = map.spawns[station]!;
    const tiles = tracePath(map, field, extraCost, sy * map.width + sx);
    if (tiles.length === 0) continue;
    out.push({
      station,
      tiles,
      lengthM: (tiles.length - 1) * TILE_M,
      siege: tiles.some((i) => extraCost[i]! > 0),
    });
  }
  return out;
}

function refreshGhost(): void {
  const w = game.world;
  if (!hovered || !w.map || !w.field || !w.extraCost) {
    usePlan.setState({ ghost: null });
    return;
  }
  const [tx, ty] = hovered;
  const tile = w.map.tiles[ty * w.map.width + tx];
  if (tile === Tile.Building) {
    usePlan.setState({
      ghost: {
        kind: 'tower',
        tx,
        ty,
        error: towerSiteError(w, tx, ty),
        rangeM: towersData.mgNest.rangeM,
      },
    });
    return;
  }
  const span = canEditBarricades(w)
    ? barricadeSpan(w, tx, ty)
    : 'barricades go up during prep only';
  if (typeof span === 'string') {
    usePlan.setState({
      ghost: {
        kind: 'barricade',
        tx,
        ty,
        tiles: [],
        axis: 'x',
        error: span,
        routes: [],
        detourM: 0,
      },
    });
    return;
  }
  const preview = previewField(w, span);
  const routes = routesFrom(preview.field, preview.extraCost);
  const now = usePlan.getState().routes;
  const len = (rs: Route[]) => rs.reduce((s, r) => s + r.lengthM, 0);
  usePlan.setState({
    ghost: {
      kind: 'barricade',
      tx,
      ty,
      tiles: span.tiles,
      axis: span.axis,
      error: null,
      routes,
      detourM: len(routes) - len(now),
    },
  });
}

/** Recompute the active routes if the flow field or the wave changed (call at event rate). */
export function refreshPlanning(force = false): void {
  const w = game.world;
  if (!w.field || !w.extraCost) return;
  const key = `${w.fieldVersion}/${w.wave}/${w.phase}`;
  if (!force && key === routesKey) return;
  routesKey = key;
  usePlan.setState({ routes: routesFrom(w.field, w.extraCost) });
  refreshGhost();
}

export function hoverTile(tile: [number, number] | null): void {
  if (tile && hovered && tile[0] === hovered[0] && tile[1] === hovered[1]) return;
  if (!tile && !hovered) return;
  hovered = tile;
  refreshGhost();
}

/** Left click: barricade on a street, MG Nest on a rooftop. Returns an error, or null. */
export function buildAt(tx: number, ty: number): string | null {
  const w = game.world;
  if (!w.map) return 'no map';
  const tile = w.map.tiles[ty * w.map.width + tx];
  const result = tile === Tile.Building ? placeTower(w, tx, ty) : placeBarricade(w, tx, ty);
  return afterEdit(typeof result === 'string' ? result : null);
}

/** Right click: take a barricade down (prep only, full refund). */
export function dismantleAt(tx: number, ty: number): string | null {
  const w = game.world;
  if (!w.map) return 'no map';
  const id = w.barricadeAt[ty * w.map.width + tx];
  if (!id) return null;
  return afterEdit(dismantleBarricade(w, id));
}

function afterEdit(error: string | null): string | null {
  useHud.getState().setNotice(error ? `Can't build here: ${error}` : null);
  refreshPlanning(true);
  publish();
  return error;
}
