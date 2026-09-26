/** Tile types stored in a map's `tiles` array (one byte per tile). Pass 1+ extends this. */
export const Tile = {
  Building: 0,
  Street: 1,
  Goal: 2,
} as const;
export type TileType = (typeof Tile)[keyof typeof Tile];

export type TileCoord = readonly [tx: number, ty: number];

export interface TileMap {
  width: number;
  height: number;
  /** Row-major, index = ty * width + tx. */
  tiles: Uint8Array;
  spawns: TileCoord[];
  goal: TileCoord[];
}

export function tileIndex(map: TileMap, tx: number, ty: number): number {
  return ty * map.width + tx;
}

export function inBounds(map: TileMap, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
}

export function tileAt(map: TileMap, tx: number, ty: number): TileType {
  if (!inBounds(map, tx, ty)) return Tile.Building;
  return map.tiles[tileIndex(map, tx, ty)] as TileType;
}

export function isWalkable(t: TileType): boolean {
  return t === Tile.Street || t === Tile.Goal;
}
