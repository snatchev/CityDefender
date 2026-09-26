import { Tile, type TileCoord, type TileMap } from './map';

/**
 * Parse a small ASCII map, used for unit-test fixtures so sim tests never depend on real city data.
 *
 *   #  building          .  street
 *   S  spawn (a street)  G  goal
 *
 * Leading/trailing blank lines are ignored and every row must have the same width.
 */
export function parseAsciiMap(src: string): TileMap {
  const rows = src.split('\n').map((r) => r.trimEnd());
  while (rows.length > 0 && rows[0]!.trim() === '') rows.shift();
  while (rows.length > 0 && rows[rows.length - 1]!.trim() === '') rows.pop();
  if (rows.length === 0) throw new Error('parseAsciiMap: empty map');

  const width = rows[0]!.length;
  const height = rows.length;
  const tiles = new Uint8Array(width * height);
  const spawns: TileCoord[] = [];
  const goal: TileCoord[] = [];

  rows.forEach((row, ty) => {
    if (row.length !== width) {
      throw new Error(`parseAsciiMap: row ${ty} has width ${row.length}, expected ${width}`);
    }
    for (let tx = 0; tx < width; tx++) {
      const ch = row[tx];
      const i = ty * width + tx;
      switch (ch) {
        case '#':
          tiles[i] = Tile.Building;
          break;
        case '.':
          tiles[i] = Tile.Street;
          break;
        case 'S':
          tiles[i] = Tile.Street;
          spawns.push([tx, ty]);
          break;
        case 'G':
          tiles[i] = Tile.Goal;
          goal.push([tx, ty]);
          break;
        default:
          throw new Error(`parseAsciiMap: unknown char '${ch}' at (${tx}, ${ty})`);
      }
    }
  });

  return { width, height, tiles, spawns, goal };
}
