/**
 * Slow motion (combat juice, D059): a short stretch where the sim runs slower than the speed the
 * player picked, easing back to it at the end. Wall-clock time, so it ends on time however slow
 * the sim runs. A separate multiplier on the sim's frame time (SimDriver), so the speed button,
 * pause and the cutscene freeze are untouched.
 */

/** Ease back to full speed over this last part of a slow-motion stretch (s). */
const EASE_OUT_S = 0.35;

const state = { until: 0, seconds: 0, factor: 1 };

/** Run the sim at `factor` of its speed for the next `seconds` (wall clock). */
export function slowMotion(seconds: number, factor: number, nowMs = performance.now()): void {
  state.until = nowMs + seconds * 1000;
  state.seconds = seconds;
  state.factor = factor;
}

/** The sim's speed multiplier right now: 1, or less during slow motion. */
export function slowMotionFactor(nowMs = performance.now()): number {
  const left = (state.until - nowMs) / 1000;
  if (left <= 0) return 1;
  if (left >= EASE_OUT_S) return state.factor;
  return state.factor + (1 - state.factor) * (1 - left / EASE_OUT_S);
}
