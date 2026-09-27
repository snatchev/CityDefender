import { describe, expect, it } from 'vitest';
import towersData from '../data/towers.json';
import { GRID, LOOP } from './__fixtures__/maps';
import { parseAsciiMap } from './asciiMap';
import { placeBarricade } from './barricades';
import { N4, Tile, tileAt } from './map';
import { towerRange } from './towers';
import { createWorld } from './world';

describe('street graph and slots', () => {
  it('splits the grid into crossings and the block faces between them', () => {
    const w = createWorld(1, parseAsciiMap(GRID));
    const { nodes, segments, segmentOf } = w.slots!;
    // Crossings are tiles whose horizontal and vertical street runs are both longer than any
    // street is wide (maxBarricadeSpanTiles). GRID has 4: where streets 4 and 6 cross rows 1 and 7.
    // Row 4 is cut by the goal, so its junctions have short runs and stay part of their segments.
    expect(nodes.filter((n) => !n.station)).toHaveLength(4);
    expect(nodes.filter((n) => n.station)).toHaveLength(4);
    // Every segment ends at a node, and every street tile is in exactly one segment or node.
    for (const s of segments) expect(s.nodes.length).toBeGreaterThan(0);
    const map = w.map!;
    for (let i = 0; i < map.tiles.length; i++) {
      if (map.tiles[i] !== Tile.Street) continue;
      expect((segmentOf[i]! >= 0 ? 1 : 0) + (w.slots!.nodeOf[i]! >= 0 ? 1 : 0)).toBe(1);
    }
  });

  it('puts roof pads on street-facing rooftops', () => {
    const w = createWorld(1, parseAsciiMap(GRID));
    const map = w.map!;
    expect(w.slots!.pads.length).toBeGreaterThan(0);
    for (const p of w.slots!.pads) {
      const x = p % map.width;
      const y = Math.floor(p / map.width);
      expect(map.tiles[p]).toBe(Tile.Building);
      expect(N4.some(([dx, dy]) => tileAt(map, x + dx, y + dy) === Tile.Street)).toBe(true);
    }
  });

  it('allows one barricade per block face', () => {
    // LOOP: the station splits the loop into a top and a bottom block face.
    const w = createWorld(1, parseAsciiMap(LOOP));
    expect(typeof placeBarricade(w, 3, 1)).toBe('object');
    expect(placeBarricade(w, 5, 1)).toBe('this block already has a barricade');
    expect(typeof placeBarricade(w, 4, 3)).toBe('object');
  });
});

describe('tower range and height (DESIGN §7)', () => {
  const s = towersData.mgNest;
  const rangeM = s.tiers[0]!.rangeM;
  it('gives street-level towers the base range and no minimum', () => {
    expect(towerRange('mgNest', 0)).toEqual({ minM: 0, maxM: rangeM });
  });
  it('extends range with height up to the cap, with a minimum range below', () => {
    const mid = towerRange('mgNest', 20);
    expect(mid.maxM).toBeCloseTo(rangeM * (1 + s.rangeHeightFactor * 20));
    expect(mid.minM).toBeCloseTo(s.minRangePerHeight * 20);
    expect(towerRange('mgNest', 10_000).maxM).toBeCloseTo(rangeM * s.rangeMaxMul);
  });
});
