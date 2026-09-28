import type { TargetingMode } from './data/schema';
import { game, publish, restart } from './game';
import {
  barricadeSellValue,
  barricadeSpan,
  barricadeUpgrade,
  canEditBarricades,
  dismantleBarricade,
  placeBarricade,
  previewField,
  upgradeBarricade,
} from './sim/barricades';
import { TILE_M } from './sim/constants';
import { tracePath } from './sim/flow';
import {
  nearestTowerSite,
  placeTower,
  sellTower,
  setTargeting,
  siteHeight,
  TOWERS,
  towerRange,
  towerSellValue,
  upgradeCost,
  upgradeTower,
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

  // With a tower tool the preview snaps to the nearest free spot that type can use.
  const spot = tool?.kind === 'tower' ? snapTowerSpot(tx, ty, tool.type) : null;
  if (spot && tool?.kind === 'tower') {
    const [sx, sy] = spot;
    const range = towerRange(tool.type, siteHeight(w, sy * w.map.width + sx));
    const cost = TOWERS[tool.type].tiers[0]!.cost;
    usePlan.setState({
      ghost: {
        kind: 'tower',
        tx: sx,
        ty: sy,
        type: tool.type,
        name: TOWERS[tool.type].name,
        error: w.cash < cost ? `needs $${cost}` : null,
        rangeM: range.maxM,
        minRangeM: range.minM,
        sellValue: null,
      },
    });
    return;
  }

  if (tower) {
    const range = towerRange(tower.type, tower.heightM, tower.tier);
    usePlan.setState({
      ghost: {
        kind: 'tower',
        tx,
        ty,
        type: tower.type,
        name: TOWERS[tower.type].name,
        error: null,
        rangeM: range.maxM,
        minRangeM: range.minM,
        sellValue: towerSellValue(w, tower),
      },
    });
    return;
  }

  if (tool?.kind === 'tower') {
    usePlan.setState({ ghost: null }); // no spot for this tower nearby: no preview, no nagging
    return;
  }

  if (barricade && tool?.kind === 'barricade' && barricadeUpgrade(barricade)?.type === tool.type) {
    usePlan.setState({
      ghost: {
        kind: 'barricade',
        tx,
        ty,
        tiles: barricade.tiles,
        axis: barricade.axis,
        error: canEditBarricades(w) ? null : 'barricades change during prep only',
        sellValue: null,
        upgradeCost: barricadeUpgrade(barricade)!.cost,
        routes: [],
        detourM: 0,
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
          upgradeCost: null,
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
        upgradeCost: null,
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
export function buildAt(
  tx: number,
  ty: number,
  tool: BuildTool | null = usePlan.getState().tool,
): string | null {
  const w = game.world;
  if (!w.map) return 'no map';
  const i = ty * w.map.width + tx;
  if (!tool) {
    selectTower(w.towerAt[i] ? w.towerAt[i]! : null);
    return null;
  }
  const existing = w.barricades.find((b) => b.id === w.barricadeAt[i]);
  if (tool.kind === 'barricade' && existing && barricadeUpgrade(existing)?.type === tool.type) {
    const err = upgradeBarricade(w, existing.id);
    return afterEdit(err ? `Can't upgrade: ${err}` : null);
  }
  if (tool.kind === 'tower') {
    const spot = snapTowerSpot(tx, ty, tool.type);
    if (!spot) return null; // nowhere near a spot for this tower: ignore the click
    const result = placeTower(w, spot[0], spot[1], tool.type);
    return afterEdit(typeof result === 'string' ? `Can't build here: ${result}` : null);
  }
  const result = placeBarricade(w, tx, ty, tool.type);
  return afterEdit(typeof result === 'string' ? `Can't build here: ${result}` : null);
}

/**
 * A left click on the map. With a tower tool the tower goes exactly where its preview is showing
 * (hover and click pick tiles separately, and the see-through cutaway can shift between them, so
 * re-picking could land on a different roof). Everything else goes through `buildAt`.
 */
export function clickMap(tile: [number, number] | null): string | null {
  const tool = usePlan.getState().tool;
  const ghost = usePlan.getState().ghost;
  if (
    tool?.kind === 'tower' &&
    ghost?.kind === 'tower' &&
    ghost.sellValue === null &&
    ghost.type === tool.type
  ) {
    const result = placeTower(game.world, ghost.tx, ghost.ty, tool.type);
    return afterEdit(typeof result === 'string' ? `Can't build here: ${result}` : null);
  }
  return tile ? buildAt(tile[0], tile[1], tool) : null;
}

/**
 * Tower placement snaps to the nearest free spot for the type within this many tiles of the pointer
 * (spots are single tiles and hard to hit exactly, especially on roofs seen at an angle).
 */
const TOWER_SNAP_TILES = 4;

function snapTowerSpot(tx: number, ty: number, type: TowerType): [number, number] | null {
  return nearestTowerSite(game.world, tx, ty, type, TOWER_SNAP_TILES);
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

/** Upgrade the selected tower one tier. */
export function upgradeSelected(): string | null {
  const id = usePlan.getState().selected?.id;
  if (id === undefined) return null;
  const err = upgradeTower(game.world, id);
  if (!err) selectTower(id);
  return afterEdit(err ? `Can't upgrade: ${err}` : null);
}

/** Change the selected tower's targeting mode. */
export function setSelectedTargeting(mode: TargetingMode): void {
  const id = usePlan.getState().selected?.id;
  if (id === undefined) return;
  setTargeting(game.world, id, mode);
  selectTower(id);
}

/** Select a tower (null clears). The HUD shows its stats and sell button; the map shows its range. */
export function selectTower(id: number | null): void {
  const w = game.world;
  const t = id === null ? undefined : w.towers.find((x) => x.id === id);
  const range = t ? towerRange(t.type, t.heightM, t.tier) : null;
  usePlan.setState({
    selected: t
      ? {
          id: t.id,
          tx: t.tx,
          ty: t.ty,
          type: t.type,
          name: TOWERS[t.type].name,
          tier: t.tier + 1,
          tiers: TOWERS[t.type].tiers.length,
          upgradeCost: upgradeCost(t),
          targeting: t.targeting,
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
