import { describe, expect, it } from "vitest";
import {
  bounds,
  BUILT_IN,
  type Cell,
  EDITOR_COLUMNS,
  EDITOR_GROW_STEP,
  EDITOR_ROWS,
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

describe("built-in blueprints", () => {
  it("includes a full Gosper glider gun", () => {
    const gun = BUILT_IN.find(
      (blueprint) => blueprint.id === "builtin:gosper-gun",
    );
    expect(gun?.cells).toHaveLength(36);
    expect(bounds(gun!.cells)).toEqual({ w: 36, h: 9 });
  });

  it("includes a lightweight spaceship with nine cells", () => {
    const lwss = BUILT_IN.find((blueprint) => blueprint.id === "builtin:lwss");
    expect(lwss?.cells).toHaveLength(9);
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
