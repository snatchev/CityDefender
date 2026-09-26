import { create } from 'zustand';

/** A route from a station to City Hall, as tile indices. */
export interface Route {
  tiles: number[];
  lengthM: number;
  /** True if the route runs through a barricade, i.e. the bugs will besiege it. */
  siege: boolean;
}

/** Placement preview for the hovered street tile. */
export interface Ghost {
  tx: number;
  ty: number;
  /** Tiles the barricade would cover (empty when placement is invalid). */
  tiles: number[];
  axis: 'x' | 'y';
  /** Why the barricade can't go here, if it can't. */
  error: string | null;
  /** Route from the selected station if this barricade were placed. */
  route: Route | null;
  /** Change in route length versus now, in metres. */
  detourM: number;
}

/**
 * Planning UI state (selected station, its current route, the hover preview). Written by
 * src/planning.ts when the hovered tile, the selection, or the flow field changes: event rate only.
 */
interface PlanState {
  selectedStation: number;
  route: Route | null;
  ghost: Ghost | null;
}

export const usePlan = create<PlanState>()(() => ({
  selectedStation: 0,
  route: null,
  ghost: null,
}));
