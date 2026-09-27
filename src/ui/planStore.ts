import { create } from 'zustand';
import type { TargetingMode } from '../data/schema';
import type { BarricadeType } from '../sim/barricades';
import type { TowerType } from '../sim/towers';

/** What a left click on the map builds (chosen in the build bar), or null to select towers. */
export type BuildTool =
  { kind: 'tower'; type: TowerType } | { kind: 'barricade'; type: BarricadeType };

/** A route from a station to City Hall, as tile indices. */
export interface Route {
  station: number;
  tiles: number[];
  lengthM: number;
  /** True if the route runs through a barricade, i.e. the bugs will besiege it. */
  siege: boolean;
}

/** Placement preview for the hovered tile: a barricade on a street, or a tower on a rooftop. */
export type Ghost =
  | {
      kind: 'barricade';
      tx: number;
      ty: number;
      /** Tiles the barricade would cover (empty when placement is invalid). */
      tiles: number[];
      axis: 'x' | 'y';
      /** Why it can't go here, if it can't. */
      error: string | null;
      /** Refund for right-clicking an existing barricade here, if there is one. */
      sellValue: number | null;
      /** Set when the tool upgrades the barricade already here: the price difference. */
      upgradeCost: number | null;
      /** Routes from the active stations if this barricade were placed. */
      routes: Route[];
      /** Total change in route length versus now, in metres. */
      detourM: number;
    }
  | {
      kind: 'tower';
      tx: number;
      ty: number;
      /** Tower name (the tool's, or the existing tower's). */
      name: string;
      error: string | null;
      rangeM: number;
      /** Raised towers can't hit closer than this (0 at street level). */
      minRangeM: number;
      /** Set when hovering a tower that already exists: its right-click refund. */
      sellValue: number | null;
    };

/**
 * Planning UI state: current routes from the active stations and the hover preview. Written by
 * src/planning.ts when the hovered tile, the wave, or the flow field changes: event rate only.
 */
interface PlanState {
  routes: Route[];
  ghost: Ghost | null;
  /** Selected tower (click an existing tower), shown with its range and a sell button. */
  selected: SelectedTower | null;
  /** Map debug overlay (street graph, slots), toggled in the debug menu or with M. */
  debugMap: boolean;
  tool: BuildTool | null;
}

export interface SelectedTower {
  id: number;
  tx: number;
  ty: number;
  type: TowerType;
  name: string;
  /** 1-based tier and how many there are. */
  tier: number;
  tiers: number;
  /** Cost of the next tier, or null at the top. */
  upgradeCost: number | null;
  targeting: TargetingMode;
  rangeM: number;
  minRangeM: number;
  /** Gameplay height the tower stands at (0 on a street corner). */
  heightM: number;
  kills: number;
  sellValue: number;
}

export const usePlan = create<PlanState>()(() => ({
  routes: [],
  ghost: null,
  selected: null,
  debugMap: false,
  tool: null,
}));
