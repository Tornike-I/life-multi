import { describe, expect, it } from "vitest";
import {
  bounds,
  BUILT_IN,
  flip,
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
