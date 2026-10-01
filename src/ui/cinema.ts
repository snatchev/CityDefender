import { create } from 'zustand';
import type { EliteType, MobType } from '../sim/mobs';

/**
 * Cutscenes (branch down-the-street, D054). Only ever started by the player (a click on the threat
 * board); render/Director.tsx plays them and CinemaOverlay.tsx draws their title cards.
 */
export type Cutscene =
  | { kind: 'breach'; station: number }
  | { kind: 'boss'; station: number; mob: MobType }
  | { kind: 'elite'; station: number; mob: MobType; elite: EliteType };

/** What the overlay shows right now. */
export type Card =
  | {
      kind: 'breach';
      station: string;
      lines: { count: number; label: string; tone: 'normal' | 'elite' | 'boss' }[];
    }
  | { kind: 'boss' | 'elite'; epithet: string; name: string; factoid: string };

interface CinemaState {
  /** The cutscene playing (with a fresh id per play), or null. */
  cut: (Cutscene & { id: number }) | null;
  card: Card | null;
  /** Bumped to ask the director to skip to the end. */
  skip: number;
}

export const useCinema = create<CinemaState>(() => ({ cut: null, card: null, skip: 0 }));

let nextId = 1;

export function playCutscene(c: Cutscene): void {
  if (useCinema.getState().cut) return; // one at a time
  useCinema.setState({ cut: { ...c, id: nextId++ }, card: null });
}

export function skipCutscene(): void {
  if (useCinema.getState().cut) useCinema.setState((s) => ({ skip: s.skip + 1 }));
}
