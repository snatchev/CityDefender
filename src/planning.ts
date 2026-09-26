import { game, publish } from './game';
import { barricadeSpan, placeBarricade, previewField, removeBarricade } from './sim/barricades';
import { TILE_M } from './sim/constants';
import { tracePath } from './sim/flow';
import { usePlan, type Route } from './ui/planStore';
import { useHud } from './ui/store';

/**
 * Barricade planning: hover preview (ghost barricade, ghost route, detour meter), placing and
 * removing barricades, and the selected station's current route. Pure glue between input and the
 * sim; recomputes only when the hovered tile, the selection or the flow field changes.
 */

let hovered: [number, number] | null = null;
let routeFieldVersion = -1;

function routeFrom(field: Float64Array, extraCost: Float64Array): Route | null {
  const map = game.world.map;
  const spawn = map?.spawns[usePlan.getState().selectedStation];
  if (!map || !spawn) return null;
  const tiles = tracePath(map, field, extraCost, spawn[1] * map.width + spawn[0]);
  if (tiles.length === 0) return null;
  return {
    tiles,
    lengthM: (tiles.length - 1) * TILE_M,
    siege: tiles.some((i) => extraCost[i]! > 0),
  };
}

function refreshGhost(): void {
  const w = game.world;
  if (!hovered || !w.map || !w.field || !w.extraCost) {
    usePlan.setState({ ghost: null });
    return;
  }
  const [tx, ty] = hovered;
  const span = barricadeSpan(w, tx, ty);
  if (typeof span === 'string') {
    usePlan.setState({
      ghost: { tx, ty, tiles: [], axis: 'x', error: span, route: null, detourM: 0 },
    });
    return;
  }
  const preview = previewField(w, span);
  const route = routeFrom(preview.field, preview.extraCost);
  const now = usePlan.getState().route;
  usePlan.setState({
    ghost: {
      tx,
      ty,
      tiles: span.tiles,
      axis: span.axis,
      error: null,
      route,
      detourM: route && now ? route.lengthM - now.lengthM : 0,
    },
  });
}

/** Recompute the selected station's route if the flow field changed (call at event rate). */
export function refreshPlanning(force = false): void {
  const w = game.world;
  if (!w.field || !w.extraCost) return;
  if (!force && w.fieldVersion === routeFieldVersion) return;
  routeFieldVersion = w.fieldVersion;
  usePlan.setState({ route: routeFrom(w.field, w.extraCost) });
  refreshGhost();
}

export function selectStation(index: number): void {
  usePlan.setState({ selectedStation: index });
  refreshPlanning(true);
}

export function hoverTile(tile: [number, number] | null): void {
  if (tile && hovered && tile[0] === hovered[0] && tile[1] === hovered[1]) return;
  if (!tile && !hovered) return;
  hovered = tile;
  refreshGhost();
}

export function placeBarricadeAt(tx: number, ty: number): string | null {
  const result = placeBarricade(game.world, tx, ty);
  if (typeof result === 'string') {
    useHud.getState().setNotice(`Can't place here: ${result}`);
    return result;
  }
  useHud.getState().setNotice(null);
  refreshPlanning();
  publish();
  return null;
}

export function removeBarricadeAt(tx: number, ty: number): boolean {
  const w = game.world;
  if (!w.map) return false;
  const id = w.barricadeAt[ty * w.map.width + tx];
  if (!id) return false;
  removeBarricade(w, id);
  refreshPlanning();
  publish();
  return true;
}
