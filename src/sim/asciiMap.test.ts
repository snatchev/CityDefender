import { describe, expect, it } from 'vitest';
import { GRID, LOOP } from './__fixtures__/maps';
import { parseAsciiMap } from './asciiMap';
import { Tile, isWalkable, tileAt } from './map';

describe('parseAsciiMap', () => {
  it('parses the LOOP fixture', () => {
    const m = parseAsciiMap(LOOP);
    expect(m.width).toBe(9);
    expect(m.height).toBe(5);
    expect(m.spawns).toEqual([[1, 1]]);
    expect(m.goal).toEqual([[7, 1]]);
    expect(tileAt(m, 0, 0)).toBe(Tile.Building);
    expect(tileAt(m, 1, 1)).toBe(Tile.Street);
    expect(tileAt(m, 7, 1)).toBe(Tile.Goal);
    expect(isWalkable(tileAt(m, 4, 3))).toBe(true);
  });

  it('treats out-of-bounds as building', () => {
    const m = parseAsciiMap(LOOP);
    expect(tileAt(m, -1, 0)).toBe(Tile.Building);
    expect(tileAt(m, 99, 99)).toBe(Tile.Building);
  });

  it('finds four spawns and one goal in GRID', () => {
    const m = parseAsciiMap(GRID);
    expect(m.spawns).toHaveLength(4);
    expect(m.goal).toEqual([[5, 4]]);
  });

  it('rejects ragged rows and unknown characters', () => {
    expect(() => parseAsciiMap('###\n##')).toThrow(/width/);
    expect(() => parseAsciiMap('#x#')).toThrow(/unknown char/);
  });
});
