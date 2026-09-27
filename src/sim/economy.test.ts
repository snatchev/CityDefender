import { describe, expect, it } from 'vitest';
import rulesData from '../data/rules.json';
import towersData from '../data/towers.json';
import { GRID } from './__fixtures__/maps';
import { parseAsciiMap } from './asciiMap';
import { startRun, startWave } from './phase';
import { placeTower, towerSellValue, type Tower } from './towers';
import { createWorld } from './world';

describe('selling', () => {
  it('refunds 100% during the prep a tower was built in, 70% after', () => {
    const w = createWorld(1, parseAsciiMap(GRID));
    startRun(w, [
      { groups: [{ spawnIndex: 0, type: 'skitterling', count: 1, hpMul: 1, intervalS: 1 }] },
    ]);
    const pad = w.slots!.pads[0]!;
    const t = placeTower(w, pad % w.map!.width, Math.floor(pad / w.map!.width)) as Tower;
    const cost = towersData.mgNest.tiers[0]!.cost;
    expect(towerSellValue(w, t)).toBe(cost); // free undo
    startWave(w);
    expect(towerSellValue(w, t)).toBe(Math.floor(cost * rulesData.sellRefund));
  });
});
