import type { TargetingMode } from './data/schema';
import { game, publish, restart } from './game';
import {
  BARRICADES,
  barricadeCost,
  barricadeSellValue,
  barricadeSpan,
  barricadeUpgrade,
  canEditBarricades,
  dismantleBarricade,
  placeBarricade,
  previewField,
  repairBarricade,
  repairCost,
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
  upgradeOptions,
  towerRangeOf,
  towerPrice,
  siteRangeMul,
  upgradeTower,
  type TowerType,
} from './sim/towers';
import { usePlan, type BuildTool, type Route, type TrackAt } from './ui/planStore';
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
  const barricade =
    w.barricades.find((b) => b.id === w.barricadeAt[i]) ??
    w.traps.find((b) => b.id === w.trapAt[i]);

  // With a tower tool the preview snaps to the nearest free spot that type can use.
  const spot = tool?.kind === 'tower' ? snapTowerSpot(tx, ty, tool.type) : null;
  if (spot && tool?.kind === 'tower') {
    const [sx, sy] = spot;
    const i2 = sy * w.map.width + sx;
    const range = towerRange(tool.type, siteHeight(w, i2), undefined, siteRangeMul(w, i2));
    const cost = towerPrice(w, tool.type);
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
    const range = towerRangeOf(w, tower);
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
        cost: null,
        trap: false,
      },
    });
    return;
  }

  if (barricade || tool?.kind === 'barricade') {
    const type = tool?.kind === 'barricade' ? tool.type : 'sawhorse';
    const trap = BARRICADES[type].kind === 'trap';
    const span = canEditBarricades(w)
      ? barricadeSpan(w, tx, ty, BARRICADES[type].kind)
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
          cost: null,
          trap,
        },
      });
      return;
    }
    const cost = barricadeCost(type, span.tiles.length);
    const preview = previewField(w, span, type);
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
        error: w.cash < cost ? `needs $${cost}` : null,
        sellValue: null,
        upgradeCost: null,
        routes: trap ? [] : routes,
        detourM: trap ? 0 : len(routes) - len(now),
        cost,
        trap,
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
  // The camera's track stays put when its station goes quiet (the rail keeps the old line).
  usePlan.setState({ routes: routesFrom(w.field, w.extraCost) });
  refreshGhost();
}

/** Start a new run (optionally with a new seed) and reset the planning UI with it. */
export function restartRun(seed?: number): void {
  restart(seed);
  hovered = null;
  usePlan.setState({ ghost: null, selected: null, selectedWall: null, focus: null });
  useHud.getState().setNotice(null);
  refreshPlanning(true);
}

/** Refresh the selected tower's stats (kills, sell value); call at event rate. */
export function refreshSelection(): void {
  const { selected, selectedWall } = usePlan.getState();
  if (selected)
    selectTower(game.world.towers.some((t) => t.id === selected.id) ? selected.id : null);
  if (selectedWall) {
    selectWall(
      game.world.barricades.some((b) => b.id === selectedWall.id) ? selectedWall.id : null,
    );
  }
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
  /** With no tool: the route the pointer was over on screen (render/pointer.ts), if known. */
  routeStation?: number | null,
): string | null {
  const w = game.world;
  if (!w.map) return 'no map';
  const i = ty * w.map.width + tx;
  if (!tool) {
    // No tool: a click selects the tower (or failing that the wall) on this tile, and failing
    // both, a click on a route moves the camera onto that track, at the clicked spot.
    selectTower(w.towerAt[i] ? w.towerAt[i]! : null);
    selectWall(!w.towerAt[i] && w.barricadeAt[i] ? w.barricadeAt[i]! : null);
    if (!w.towerAt[i] && !w.barricadeAt[i]) {
      if (routeStation === undefined) focusRouteAt(tx, ty);
      else if (routeStation !== null) focusRoute(routeStation, { kind: 'tile', tx, ty });
    }
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
export function clickMap(
  tile: [number, number] | null,
  routeStation?: number | null,
): string | null {
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
  return tile ? buildAt(tile[0], tile[1], tool, routeStation) : null;
}

/** A click this many tiles from a route line still counts as on it (streets are wider than the line). */
const ROUTE_CLICK_TILES = 1;

/**
 * Put the camera on the track through (or next to) a tile, at that tile (D049, D054). A tile on no
 * route does nothing. Where routes overlap, the current track keeps priority, then the one listed
 * first. Returns the station, or null.
 */
export function focusRouteAt(tx: number, ty: number): number | null {
  const map = game.world.map;
  if (!map) return null;
  const { routes, focus } = usePlan.getState();
  const near = (r: Route) =>
    r.tiles.some((i) => {
      const x = i % map.width;
      const y = (i - x) / map.width;
      return Math.abs(x - tx) <= ROUTE_CLICK_TILES && Math.abs(y - ty) <= ROUTE_CLICK_TILES;
    });
  const hits = routes.filter(near);
  const hit = hits.find((r) => r.station === focus?.station) ?? hits[0];
  return hit ? focusRoute(hit.station, { kind: 'tile', tx, ty }) : null;
}

/**
 * Put the camera on a station's track (render/RailCamera.tsx, D054), at `at`, gliding there unless
 * `fly` is false. Asking again for the same track moves the camera again. Returns the station, or
 * null if that station has no route this wave.
 */
export function focusRoute(
  station: number,
  at: TrackAt = { kind: 'start' },
  fly = true,
): number | null {
  const { routes, focus } = usePlan.getState();
  if (!routes.some((r) => r.station === station)) return null;
  usePlan.setState({ focus: { station, seq: (focus?.seq ?? 0) + 1, at, fly } });
  return station;
}

/** Tactical view on/off (D050; render/TacticalView.tsx does the camera, Scene the squash). */
export function toggleTactical(): void {
  usePlan.setState((p) => ({ tactical: !p.tactical }));
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
  const id = w.barricadeAt[i] || w.trapAt[i];
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

/** Upgrade the selected tower one tier (at the last tier, to the chosen tier-3 branch). */
export function upgradeSelected(branch: string | null = null): string | null {
  const id = usePlan.getState().selected?.id;
  if (id === undefined) return null;
  const err = upgradeTower(game.world, id, branch);
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
  const range = t ? towerRangeOf(w, t) : null;
  const def = t ? TOWERS[t.type] : null;
  usePlan.setState({
    selected: t
      ? {
          id: t.id,
          tx: t.tx,
          ty: t.ty,
          type: t.type,
          name: TOWERS[t.type].name,
          tier: t.tier + 1,
          tiers: def!.tiers.length + (def!.branches ? 1 : 0),
          branchName: t.branch ? def!.branches!.find((b) => b.id === t.branch)!.name : null,
          upgrades: upgradeOptions(w, t),
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

/** Select a wall (null clears): the HUD shows its HP, repair, upgrade and sell. */
export function selectWall(id: number | null): void {
  const w = game.world;
  const b = id === null ? undefined : w.barricades.find((x) => x.id === id);
  const up = b ? barricadeUpgrade(b, w.mods) : null;
  usePlan.setState({
    selectedWall: b
      ? {
          id: b.id,
          type: b.type,
          name: BARRICADES[b.type].name,
          hp: Math.ceil(b.hp),
          maxHp: b.maxHp,
          repairCost: repairCost(w, b),
          upgrade: up ? { name: BARRICADES[up.type].name, cost: up.cost } : null,
          sellValue: barricadeSellValue(w, b),
          canEdit: canEditBarricades(w),
        }
      : null,
  });
}

/** Repair, upgrade or sell the selected wall. */
export function repairSelectedWall(): string | null {
  const id = usePlan.getState().selectedWall?.id;
  if (id === undefined) return null;
  const err = repairBarricade(game.world, id);
  selectWall(id);
  return afterEdit(err ? `Can't repair: ${err}` : null);
}

export function upgradeSelectedWall(): string | null {
  const id = usePlan.getState().selectedWall?.id;
  if (id === undefined) return null;
  const err = upgradeBarricade(game.world, id);
  selectWall(id);
  return afterEdit(err ? `Can't upgrade: ${err}` : null);
}

export function sellSelectedWall(): string | null {
  const id = usePlan.getState().selectedWall?.id;
  if (id === undefined) return null;
  const err = dismantleBarricade(game.world, id);
  if (!err) selectWall(null);
  return afterEdit(err ? `Can't sell: ${err}` : null);
}

function afterEdit(error: string | null): string | null {
  useHud.getState().setNotice(error);
  refreshPlanning(true);
  refreshGhost();
  publish();
  return error;
}
