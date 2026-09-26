import { TICK_DT } from './constants';

/** Tolerance so float drift (0.12 - 0.1 + 0.03 = 0.04999…) can't swallow a whole step. */
const EPSILON = 1e-9;

/**
 * Converts variable frame deltas into a whole number of fixed simulation steps
 * ("fix your timestep"). The renderer calls `advance(frameDelta)` once per frame
 * and runs the returned number of ticks.
 */
export class FixedStepper {
  /** 0 = paused, 1 = normal, 2/3 = fast-forward. */
  timeScale = 1;

  private accumulator = 0;

  constructor(
    readonly stepSeconds: number = TICK_DT,
    /** Upper bound on ticks per frame, so a long stall can't trigger a death spiral. */
    readonly maxStepsPerFrame: number = 8,
    /** Frame deltas above this are clamped (tab switch, breakpoint). */
    readonly maxFrameSeconds: number = 0.25,
  ) {}

  get paused(): boolean {
    return this.timeScale === 0;
  }

  /** Fraction of a step left in the accumulator, for render interpolation. */
  get alpha(): number {
    return this.accumulator / this.stepSeconds;
  }

  advance(frameSeconds: number): number {
    if (!(frameSeconds > 0) || this.timeScale <= 0) return 0;
    this.accumulator += Math.min(frameSeconds, this.maxFrameSeconds) * this.timeScale;
    let steps = Math.floor(this.accumulator / this.stepSeconds + EPSILON);
    if (steps > this.maxStepsPerFrame) {
      steps = this.maxStepsPerFrame;
      this.accumulator = 0; // drop the backlog instead of spiralling
    } else {
      this.accumulator = Math.max(0, this.accumulator - steps * this.stepSeconds);
    }
    return steps;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
