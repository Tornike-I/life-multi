export type Cell = [x: number, y: number];

export interface Blueprint {
  id: string;
  name: string;
  cells: Cell[];
}

const STORAGE_KEY = "life-multi:blueprints";
export const MAX_NAME_LENGTH = 40;
export const EDITOR_COLUMNS = 48;
export const EDITOR_ROWS = 24;

export function normalize(cells: readonly Cell[]): Cell[] {
  if (cells.length === 0) return [];
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  const unique = new Map<string, Cell>();
  for (const [x, y] of cells) unique.set(`${x},${y}`, [x - minX, y - minY]);
  return [...unique.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

export function parsePattern(rows: readonly string[]): Cell[] {
  const cells: Cell[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (char !== ".") cells.push([x, y]);
    });
  });
  return normalize(cells);
}

export function bounds(cells: readonly Cell[]): { w: number; h: number } {
  if (cells.length === 0) return { w: 0, h: 0 };
  return {
    w: Math.max(...cells.map(([x]) => x)) + 1,
    h: Math.max(...cells.map(([, y]) => y)) + 1,
  };
}

export function rotate(cells: readonly Cell[]): Cell[] {
  const { h } = bounds(cells);
  return normalize(cells.map(([x, y]): Cell => [h - 1 - y, x]));
}

export function flip(cells: readonly Cell[]): Cell[] {
  const { w } = bounds(cells);
  return normalize(cells.map(([x, y]): Cell => [w - 1 - x, y]));
}

export const BUILT_IN: readonly Blueprint[] = [
  { id: "builtin:block", name: "Block", cells: parsePattern(["##", "##"]) },
  { id: "builtin:blinker", name: "Blinker", cells: parsePattern(["###"]) },
  {
    id: "builtin:beehive",
    name: "Beehive",
    cells: parsePattern([".##.", "#..#", ".##."]),
  },
  {
    id: "builtin:glider",
    name: "Glider",
    cells: parsePattern([".#.", "..#", "###"]),
  },
  {
    id: "builtin:lwss",
    name: "Lightweight spaceship",
    cells: parsePattern([".#..#", "#....", "#...#", "####."]),
  },
  {
    id: "builtin:r-pentomino",
    name: "R-pentomino",
    cells: parsePattern([".##", "##.", ".#."]),
  },
  {
    id: "builtin:gosper-gun",
    name: "Gosper glider gun",
    cells: parsePattern([
      "........................#...........",
      "......................#.#...........",
      "............##......##............##",
      "...........#...#....##............##",
      "##........#.....#...##..............",
      "##........#...#.##....#.#...........",
      "..........#.....#.......#...........",
      "...........#...#....................",
      "............##......................",
    ]),
  },
];

export function parseSaved(json: string | null): Blueprint[] {
  if (!json) return [];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  return data.flatMap((entry): Blueprint[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const { id, name, cells } = entry as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string") return [];
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) return [];
    if (!Array.isArray(cells) || cells.length === 0) return [];
    if (cells.length > EDITOR_COLUMNS * EDITOR_ROWS) return [];
    const valid = cells.every(
      (cell) =>
        Array.isArray(cell) &&
        cell.length === 2 &&
        Number.isInteger(cell[0]) &&
        Number.isInteger(cell[1]),
    );
    return valid ? [{ id, name, cells: normalize(cells as Cell[]) }] : [];
  });
}

export function loadSaved(): Blueprint[] {
  try {
    return parseSaved(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveAll(blueprints: readonly Blueprint[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blueprints));
    return true;
  } catch {
    return false;
  }
}
