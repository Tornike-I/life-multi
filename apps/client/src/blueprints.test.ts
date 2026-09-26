import { createBoard, DEAD, setCell, step } from "@life-multi/shared";
import { describe, expect, it } from "vitest";
import {
  bounds,
  BUILT_IN,
  type Cell,
  EDITOR_COLUMNS,
  EDITOR_GROW_STEP,
  EDITOR_ROWS,
  findPattern,
  flip,
  gridFor,
  growthFor,
  normalize,
  parsePattern,
  parseSaved,
  rotate,
} from "./blueprints.ts";

const glider = parsePattern([".#.", "..#", "###"]);

describe("patterns", () => {
  it("parses rows into cells relative to the top-left corner", () => {
    expect(parsePattern(["..", ".#", "##"])).toEqual([
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
  });

  it("normalizes by shifting to the origin and dropping duplicates", () => {
    expect(
      normalize([
        [5, 7],
        [6, 7],
        [5, 7],
      ]),
    ).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it("rotates clockwise", () => {
    expect(rotate(glider)).toEqual(parsePattern(["#..", "#.#", "##."]));
  });

  it("returns to the original after four rotations or two flips", () => {
    expect(rotate(rotate(rotate(rotate(glider))))).toEqual(glider);
    expect(flip(flip(glider))).toEqual(glider);
  });

  it("mirrors left to right", () => {
    expect(flip(glider)).toEqual(parsePattern([".#.", "#..", "###"]));
  });
});

describe("editor grid", () => {
  it("starts at the default size for small or empty drawings", () => {
    const grid = { columns: EDITOR_COLUMNS, rows: EDITOR_ROWS };
    expect(gridFor([])).toEqual(grid);
    expect(gridFor(glider)).toEqual(grid);
  });

  it("leaves room around patterns larger than the default size", () => {
    const wide: Cell[] = [
      [0, 0],
      [99, 59],
    ];
    expect(gridFor(wide)).toEqual({
      columns: 100 + EDITOR_GROW_STEP,
      rows: 60 + EDITOR_GROW_STEP,
    });
  });

  it("doesn't grow while drawing stays clear of the edges", () => {
    expect(growthFor([[10, 10]], { columns: 48, rows: 24 })).toEqual({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
    expect(growthFor([], { columns: 48, rows: 24 })).toEqual({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
  });

  it("grows only the sides a drawing reaches", () => {
    const cells: Cell[] = [
      [0, 10],
      [47, 23],
    ];
    expect(growthFor(cells, { columns: 48, rows: 24 })).toEqual({
      left: EDITOR_GROW_STEP,
      top: 0,
      right: EDITOR_GROW_STEP,
      bottom: EDITOR_GROW_STEP,
    });
  });
});

function evolve(cells: readonly Cell[], generations: number): Cell[] {
  let board = createBoard(64, 64);
  for (const [x, y] of cells) setCell(board, x + 24, y + 24, 1);
  for (let generation = 0; generation < generations; generation++) {
    board = step(board, generation);
  }
  const live: Cell[] = [];
  board.cells.forEach((color, index) => {
    if (color !== DEAD) live.push([index % 64, Math.floor(index / 64)]);
  });
  return live;
}

function pattern(id: string): Cell[] {
  return findPattern(id)!.cells;
}

describe("built-in blueprints", () => {
  it("leaves the tutorial's basic shapes out of the library", () => {
    const ids = BUILT_IN.map((blueprint) => blueprint.id);
    for (const id of ["builtin:block", "builtin:blinker", "builtin:beehive"]) {
      expect(ids).not.toContain(id);
      expect(findPattern(id)).toBeDefined();
    }
  });

  it.each([
    ["builtin:lwss", 9],
    ["builtin:mwss", 11],
    ["builtin:hwss", 13],
    ["builtin:pulsar", 48],
    ["builtin:pentadecathlon", 12],
    ["builtin:diehard", 7],
    ["builtin:acorn", 7],
    ["builtin:snark", 52],
  ])("%s has %i cells", (id, count) => {
    expect(pattern(id)).toHaveLength(count);
  });

  it.each([
    ["builtin:pulsar", 3],
    ["builtin:pentadecathlon", 15],
  ])("%s repeats every %i generations", (id, period) => {
    const start = evolve(pattern(id), 0);
    expect(evolve(pattern(id), period)).toEqual(start);
    expect(evolve(pattern(id), 1)).not.toEqual(start);
  });

  it.each(["builtin:glider", "builtin:lwss", "builtin:mwss", "builtin:hwss"])(
    "%s travels, keeping its shape",
    (id) => {
      const start = evolve(pattern(id), 0);
      const later = evolve(pattern(id), 4);
      expect(normalize(later)).toEqual(normalize(start));
      expect(later).not.toEqual(start);
    },
  );

  it("turns a glider 90 degrees with a snark, which stays intact", () => {
    const snark = pattern("builtin:snark");
    const still = evolve(snark, 0);
    expect(evolve(snark, 1)).toEqual(still);

    const incoming: Cell[] = [
      [3, 20],
      [4, 20],
      [2, 21],
      [4, 21],
      [4, 22],
    ];
    const snarkKeys = new Set(still.map(([x, y]) => `${x},${y}`));
    const glider = (generations: number) => {
      const live = evolve([...snark, ...incoming], generations);
      for (const key of snarkKeys) {
        expect(live.map(([x, y]) => `${x},${y}`)).toContain(key);
      }
      return live.filter(([x, y]) => !snarkKeys.has(`${x},${y}`));
    };

    const outgoing = glider(80);
    expect(outgoing).toHaveLength(5);
    expect(glider(100)).toEqual(outgoing.map(([x, y]): Cell => [x + 5, y + 5]));
  });

  it("dies out at generation 130 with a diehard", () => {
    expect(evolve(pattern("builtin:diehard"), 129)).not.toEqual([]);
    expect(evolve(pattern("builtin:diehard"), 130)).toEqual([]);
  });

  it("includes a full Gosper glider gun", () => {
    const gun = BUILT_IN.find(
      (blueprint) => blueprint.id === "builtin:gosper-gun",
    );
    expect(gun?.cells).toHaveLength(36);
    expect(bounds(gun!.cells)).toEqual({ w: 36, h: 9 });
  });
});

describe("parseSaved", () => {
  it("keeps valid blueprints and normalizes their cells", () => {
    const json = JSON.stringify([
      {
        id: "a",
        name: "Pair",
        cells: [
          [3, 3],
          [4, 3],
        ],
      },
    ]);
    expect(parseSaved(json)).toEqual([
      {
        id: "a",
        name: "Pair",
        cells: [
          [0, 0],
          [1, 0],
        ],
      },
    ]);
  });

  it("keeps blueprints larger than the editor's starting size", () => {
    const cells = Array.from({ length: 200 * 10 }, (_, i) => [
      i % 200,
      Math.floor(i / 200),
    ]);
    const [blueprint] = parseSaved(
      JSON.stringify([{ id: "big", name: "Big", cells }]),
    );
    expect(bounds(blueprint!.cells)).toEqual({ w: 200, h: 10 });
  });

  it.each([
    null,
    "not json",
    '{"id":"a"}',
    '[{"id":"a","name":"","cells":[[0,0]]}]',
    '[{"id":"a","name":"Empty","cells":[]}]',
    '[{"id":"a","name":"Bad","cells":[[0.5,0]]}]',
    '[{"name":"No id","cells":[[0,0]]}]',
  ])("drops invalid storage %s", (json) => {
    expect(parseSaved(json)).toEqual([]);
  });
});
