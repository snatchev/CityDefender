import { describe, expect, it } from 'vitest';
import {
  bracket,
  daylight,
  daylightMoving,
  DAYLIGHT,
  hourForWave,
  hoursForward,
  lerpBearing,
  setDaylightHour,
  stepDaylight,
} from './daylight';

describe('time-of-day keyframes', () => {
  const hours = [0, 6, 12, 20];

  it('blends between the two keys around an hour', () => {
    expect(bracket(hours, 9)).toEqual({ a: 1, b: 2, t: 0.5 });
    expect(bracket(hours, 12)).toEqual({ a: 2, b: 3, t: 0 });
  });

  it('wraps across midnight from the last key to the first', () => {
    // 20:00 → 24:00 (the first key, 0:00) is 4 hours: 22:00 is halfway.
    expect(bracket(hours, 22)).toEqual({ a: 3, b: 0, t: 0.5 });
    // Without a key at midnight, early hours still blend from the previous evening's key.
    const late = [6, 18];
    expect(bracket(late, 3)).toEqual({ a: 1, b: 0, t: 0.75 });
    expect(bracket(late, 24 + 3)).toEqual(bracket(late, 3));
    expect(bracket(late, -21)).toEqual(bracket(late, 3));
  });

  it('runs time forward only, through midnight', () => {
    expect(hoursForward(22, 1)).toBe(3);
    expect(hoursForward(1, 22)).toBe(21);
    expect(hoursForward(8, 8)).toBe(0);
  });

  it('turns the sun the short way round', () => {
    expect(lerpBearing(350, 10, 0.5)).toBeCloseTo(0);
    expect(lerpBearing(10, 350, 0.25)).toBeCloseTo(5);
  });
});

describe('the daylight clock', () => {
  const city = Object.keys(DAYLIGHT.waveHours)[0]!;

  it('snaps on load or resume, and eases forward only after a round ends', () => {
    setDaylightHour(null);
    // A resumed run lands straight on its wave's hour.
    stepDaylight(0.016, city, 9, 'prep');
    expect(daylight().hour).toBe(hourForWave(city, 9));
    expect(daylightMoving()).toBe(false);

    // Wave 10 ends; its debrief holds the hour, then wave 11's prep eases toward the next one.
    stepDaylight(0.016, city, 9, 'assault');
    stepDaylight(0.016, city, 9, 'debrief');
    expect(daylight().hour).toBe(hourForWave(city, 9));
    stepDaylight(0.016, city, 10, 'prep');
    expect(daylightMoving()).toBe(true);
    const from = hourForWave(city, 9);
    const to = hourForWave(city, 10);
    const passed = hoursForward(from, daylight().hour);
    expect(passed).toBeGreaterThanOrEqual(0);
    expect(passed).toBeLessThan(hoursForward(from, to));

    // It arrives after the transition time, and holds there.
    for (let t = 0; t < DAYLIGHT.transitionS + 1; t += 0.1) stepDaylight(0.1, city, 10, 'prep');
    expect(daylightMoving()).toBe(false);
    expect(daylight().hour).toBe(to);
  });

  it('finishes quickly if the wave is sent mid-transition', () => {
    setDaylightHour(null);
    stepDaylight(0.016, city, 3, 'debrief');
    stepDaylight(0.016, city, 4, 'prep');
    expect(daylightMoving()).toBe(true);
    stepDaylight(DAYLIGHT.assaultCatchUpS, city, 4, 'assault');
    expect(daylightMoving()).toBe(false);
    expect(daylight().hour).toBe(hourForWave(city, 4));
  });

  it('can be pinned to an hour and let go again', () => {
    setDaylightHour(23);
    stepDaylight(0.016, city, 0, 'prep');
    expect(daylight().hour).toBe(23);
    expect(daylight().night).toBe(1);
    setDaylightHour(null);
    stepDaylight(0.016, city, 0, 'prep');
    expect(daylight().hour).toBe(hourForWave(city, 0));
  });
});
