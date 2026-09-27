import towersData from './data/towers.json';
import { game, publish, restart } from './game';
import {
  barricadeSellValue,
  barricadeSpan,
  canEditBarricades,
  dismantleBarricade,
  placeBarricade,
  previewField,
} from './sim/barricades';
import { TILE_M } from './sim/constants';
import { tracePath } from './sim/flow';
import {
  placeTower,
  sellTower,
  siteHeight,
  towerRange,
  towerSellValue,
  towerSiteError,
  type TowerType,
} from './sim/towers';
import { usePlan, type BuildTool, type Route } from './ui/planStore';
import { useHud } from './ui/store';

/**
 * Planning glue between input and the sim: hover previews (ghost barricade + ghost routes + detour
 * meter on streets, ghost tower + range on rooftops, sell value on existing builds), building,
 * selling, tower selection, and the routes from the stations active this wave. Recomputes only when
 * the hovered tile, the wave or the flow field changes.
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
  const i = ty * w.map.width + tx;
  const tool = usePlan.getState().tool;
  const tower = w.towers.find((t) => t.id === w.towerAt[i]);
  const barricade = w.barricades.find((b) => b.id === w.barricadeAt[i]);

  if (tower || tool?.kind === 'tower') {
    const type = tower?.type ?? (tool as { type: TowerType }).type;
    const range = towerRange(type, tower?.heightM ?? siteHeight(w, i));
    usePlan.setState({
      ghost: {
        kind: 'tower',
        tx,
        ty,
        error: tower ? null : towerSiteError(w, tx, ty),
        rangeM: range.maxM,
        minRangeM: range.minM,
        sellValue: tower ? towerSellValue(w, tower) : null,
      },
    });
    return;
  }

  if (barricade || tool?.kind === 'barricade') {
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
          sellValue: barricade && canEditBarricades(w) ? barricadeSellValue(w, barricade) : null,
          routes: [],
          detourM: 0,
        },
      });
      return;
    }
    const preview = previewField(w, span);
    const routes = routesFrom(preview.field, preview.extraCost);
    const now = usePlan.getState().routes;
    const len = (rs: Route[]) => rs.reduce((sum, r) => sum + r.lengthM, 0);
    usePlan.setState({
      ghost: {
        kind: 'barricade',
        tx,
        ty,
        tiles: span.tiles,
        axis: span.axis,
        error: null,
        sellValue: null,
        routes,
        detourM: len(routes) - len(now),
      },
    });
    return;
  }

  usePlan.setState({ ghost: null }); // no tool and nothing built here: no preview
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

/** Start a new run (optionally with a new seed) and reset the planning UI with it. */
export function restartRun(seed?: number): void {
  restart(seed);
  hovered = null;
  usePlan.setState({ ghost: null, selected: null });
  useHud.getState().setNotice(null);
  refreshPlanning(true);
}

/** Refresh the selected tower's stats (kills, sell value); call at event rate. */
export function refreshSelection(): void {
  const sel = usePlan.getState().selected;
  if (sel) selectTower(game.world.towers.some((t) => t.id === sel.id) ? sel.id : null);
}

export function hoverTile(tile: [number, number] | null): void {
  if (tile && hovered && tile[0] === hovered[0] && tile[1] === hovered[1]) return;
  if (!tile && !hovered) return;
  hovered = tile;
  refreshGhost();
}

/** Choose what left clicks build (null: clicks select towers). Clears any tower selection. */
export function selectTool(tool: BuildTool | null): void {
  usePlan.setState({ tool, selected: null });
  useHud.getState().setNotice(null);
  refreshGhost();
}

/**
 * Left click: build with the selected tool, or with no tool select the tower on this tile.
 * The tool stays selected so several can be placed in a row. Returns an error, or null.
 */
export function buildAt(tx: number, ty: number): string | null {
  const w = game.world;
  if (!w.map) return 'no map';
  const i = ty * w.map.width + tx;
  const tool = usePlan.getState().tool;
  if (!tool) {
    selectTower(w.towerAt[i] ? w.towerAt[i]! : null);
    return null;
  }
  const result =
    tool.kind === 'tower' ? placeTower(w, tx, ty, tool.type) : placeBarricade(w, tx, ty, tool.type);
  return afterEdit(typeof result === 'string' ? `Can't build here: ${result}` : null);
}

/** Right click: sell the tower or dismantle the barricade on this tile. */
export function sellAt(tx: number, ty: number): string | null {
  const w = game.world;
  if (!w.map) return 'no map';
  const i = ty * w.map.width + tx;
  if (w.towerAt[i]) return sellTowerById(w.towerAt[i]!);
  const id = w.barricadeAt[i];
  if (!id) return null;
  const err = dismantleBarricade(w, id);
  return afterEdit(err ? `Can't sell: ${err}` : null);
}

/** Sell a tower (the selected one by default). */
export function sellTowerById(id = usePlan.getState().selected?.id): string | null {
  if (id === undefined) return null;
  const err = sellTower(game.world, id);
  if (!err && usePlan.getState().selected?.id === id) selectTower(null);
  return afterEdit(err ? `Can't sell: ${err}` : null);
}

/** Select a tower (null clears). The HUD shows its stats and sell button; the map shows its range. */
export function selectTower(id: number | null): void {
  const w = game.world;
  const t = id === null ? undefined : w.towers.find((x) => x.id === id);
  const range = t ? towerRange(t.type, t.heightM) : null;
  usePlan.setState({
    selected: t
      ? {
          id: t.id,
          tx: t.tx,
          ty: t.ty,
          name: towersData[t.type].name,
          rangeM: range!.maxM,
          minRangeM: range!.minM,
          heightM: t.heightM,
          kills: t.kills,
          sellValue: towerSellValue(w, t),
        }
      : null,
  });
}

function afterEdit(error: string | null): string | null {
  useHud.getState().setNotice(error);
  refreshPlanning(true);
  refreshGhost();
  publish();
  return error;
}
