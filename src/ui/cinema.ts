import { create } from 'zustand';
import type { EliteType, MobType } from '../sim/mobs';

/**
 * Cutscenes (D054, D057): introductions. When a station breaks open with
 * a boss, an elite group or a kind of bug the run hasn't met yet, the camera cuts to it, the game
 * freezes and a title card names it. They start on their own (render/ThreatTracker.tsx queues
 * them) and play one at a time; render/Director.tsx plays them and CinemaOverlay.tsx draws the
 * card. The burst at the station is separate: it always plays (render/StationBursts.tsx).
 */
export type IntroKind = 'boss' | 'elite' | 'new';

export interface Cutscene {
  kind: IntroKind;
  station: number;
  mob: MobType;
  /** Elite intros: the affix. */
  elite?: EliteType;
}

/** What the overlay shows right now. */
export interface Card {
  kind: IntroKind;
  epithet: string;
  name: string;
  factoid: string;
}

interface CinemaState {
  /** The cutscene playing (with a fresh id per play), or null. */
  cut: (Cutscene & { id: number }) | null;
  card: Card | null;
  /** Bumped to ask the director to skip to the end. */
  skip: number;
}

export const useCinema = create<CinemaState>(() => ({ cut: null, card: null, skip: 0 }));

let nextId = 1;
const waiting: Cutscene[] = [];

/** Play a cutscene now, or after the ones already playing or waiting. */
export function playCutscene(c: Cutscene): void {
  if (useCinema.getState().cut) waiting.push(c);
  else useCinema.setState({ cut: { ...c, id: nextId++ }, card: null });
}

/** The director is done with the current cutscene: on to the next one waiting, if any. */
export function endCutscene(): void {
  const next = waiting.shift();
  useCinema.setState({ cut: next ? { ...next, id: nextId++ } : null, card: null });
}

/** Drop everything waiting (a new run). */
export function clearCutscenes(): void {
  waiting.length = 0;
}

export function skipCutscene(): void {
  if (useCinema.getState().cut) useCinema.setState((s) => ({ skip: s.skip + 1 }));
}
