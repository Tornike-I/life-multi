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
export const EDITOR_MARGIN = 2;
export const EDITOR_GROW_STEP = 16;

export interface Grid {
  columns: number;
  rows: number;
}

export interface Growth {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

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

export function gridFor(cells: readonly Cell[]): Grid {
  const { w, h } = bounds(cells);
  return {
    columns: Math.max(EDITOR_COLUMNS, w + EDITOR_GROW_STEP),
    rows: Math.max(EDITOR_ROWS, h + EDITOR_GROW_STEP),
  };
}

export function growthFor(cells: readonly Cell[], grid: Grid): Growth {
  if (cells.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 };
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const grow = (gap: number) => (gap < EDITOR_MARGIN ? EDITOR_GROW_STEP : 0);
  return {
    left: grow(Math.min(...xs)),
    top: grow(Math.min(...ys)),
    right: grow(grid.columns - 1 - Math.max(...xs)),
    bottom: grow(grid.rows - 1 - Math.max(...ys)),
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

// Too plain for the library, but the tutorial teaches still lifes and oscillators with them.
const TUTORIAL_BASICS: readonly Blueprint[] = [
  { id: "builtin:block", name: "Block", cells: parsePattern(["##", "##"]) },
  { id: "builtin:blinker", name: "Blinker", cells: parsePattern(["###"]) },
  {
    id: "builtin:beehive",
    name: "Beehive",
    cells: parsePattern([".##.", "#..#", ".##."]),
  },
];

export const BUILT_IN: readonly Blueprint[] = [
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
    id: "builtin:mwss",
    name: "Middleweight spaceship",
    cells: parsePattern(["...#..", ".#...#", "#.....", "#....#", "#####."]),
  },
  {
    id: "builtin:hwss",
    name: "Heavyweight spaceship",
    cells: parsePattern([
      "...##..",
      ".#....#",
      "#......",
      "#.....#",
      "######.",
    ]),
  },
  {
    id: "builtin:pulsar",
    name: "Pulsar",
    cells: parsePattern([
      "..###...###..",
      ".............",
      "#....#.#....#",
      "#....#.#....#",
      "#....#.#....#",
      "..###...###..",
      ".............",
      "..###...###..",
      "#....#.#....#",
      "#....#.#....#",
      "#....#.#....#",
      ".............",
      "..###...###..",
    ]),
  },
  {
    id: "builtin:pentadecathlon",
    name: "Pentadecathlon",
    cells: parsePattern(["..#....#..", "##.####.##", "..#....#.."]),
  },
  {
    id: "builtin:r-pentomino",
    name: "R-pentomino",
    cells: parsePattern([".##", "##.", ".#."]),
  },
  {
    id: "builtin:diehard",
    name: "Diehard",
    cells: parsePattern(["......#.", "##......", ".#...###"]),
  },
  {
    id: "builtin:acorn",
    name: "Acorn",
    cells: parsePattern([".#.....", "...#...", "##..###"]),
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

export function findPattern(id: string): Blueprint | undefined {
  return [...BUILT_IN, ...TUTORIAL_BASICS].find((entry) => entry.id === id);
}

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
