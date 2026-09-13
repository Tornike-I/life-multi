import { describe, expect, it } from "vitest";
import { MINIMAP_HISTORY_TICKS } from "./rules.ts";
import {
  extentFromLines,
  type Lines,
  mergeLines,
  ownExtent,
  ownLines,
  recordLines,
  ringSpan,
} from "./view.ts";

describe("ringSpan", () => {
  it("is null when nothing is occupied", () => {
    expect(ringSpan([0, 0, 0, 0], 4)).toBeNull();
  });

  it("covers everything outside the longest empty run", () => {
    expect(ringSpan([0, 1, 1, 0, 0, 0, 1, 0], 8)).toEqual({
      start: 6,
      length: 5,
    });
  });

  it("wraps around the edge", () => {
    expect(ringSpan([1, 0, 0, 0, 0, 0, 0, 1], 8)).toEqual({
      start: 7,
      length: 2,
    });
  });

  it("covers the whole ring when there is no gap", () => {
    expect(ringSpan([1, 1, 1], 3)).toEqual({ start: 0, length: 3 });
  });
});

describe("ownExtent", () => {
  const size = 256;

  it("is null for a player with no mat and no cells", () => {
    expect(
      ownExtent(new Uint16Array(size * size), size, size, 1, null),
    ).toBeNull();
  });

  it("pads a lone mat up to the minimum minimap size", () => {
    const mat = { x: 100, y: 40, w: 8, h: 8 };
    expect(ownExtent(new Uint16Array(size * size), size, size, 1, mat)).toEqual(
      {
        x: 72,
        y: 12,
        w: 64,
        h: 64,
      },
    );
  });

  it("covers a mat that wraps across the board edge", () => {
    const mat = { x: 250, y: 10, w: 8, h: 8 };
    expect(ownExtent(new Uint16Array(size * size), size, size, 1, mat)).toEqual(
      {
        x: 222,
        y: -18,
        w: 64,
        h: 64,
      },
    );
  });

  it("follows the player's cells across the wrapped edge and ignores other colors", () => {
    const cells = new Uint16Array(size * size);
    cells[10 * size + 250] = 1;
    cells[10 * size + 100] = 2;
    const mat = { x: 2, y: 10, w: 8, h: 8 };
    expect(ownExtent(cells, size, size, 1, mat)).toEqual({
      x: 226,
      y: -18,
      w: 64,
      h: 64,
    });
  });

  it("grows beyond the minimum as the player's cells spread", () => {
    const cells = new Uint16Array(size * size);
    cells[5 * size + 0] = 1;
    cells[5 * size + 100] = 1;
    expect(ownExtent(cells, size, size, 1, null)).toEqual({
      x: -16,
      y: -27,
      w: 133,
      h: 64,
    });
  });
});

describe("minimap history", () => {
  const size = 256;
  const mat = { x: 100, y: 100, w: 8, h: 8 };
  const withEdgeCell = { x: 84, y: 72, w: 113, h: 64 };
  const matOnly = { x: 72, y: 72, w: 64, h: 64 };

  function frame(cell: [number, number] | null): Lines {
    const cells = new Uint16Array(size * size);
    if (cell) cells[cell[1] * size + cell[0]] = 1;
    return ownLines(cells, size, size, 1, mat);
  }

  it("has no area before any frame is recorded", () => {
    expect(mergeLines([])).toBeNull();
  });

  it("keeps the area steady while a cell at its edge blinks", () => {
    const history: Lines[] = [];
    const extents = new Set<string>();
    for (let tick = 0; tick < 40; tick++) {
      recordLines(history, frame(tick % 2 === 0 ? [180, 104] : null));
      extents.add(JSON.stringify(extentFromLines(mergeLines(history)!)));
    }
    expect([...extents]).toEqual([JSON.stringify(withEdgeCell)]);
  });

  it("shrinks once a cell has been gone for the whole history", () => {
    const history: Lines[] = [];
    recordLines(history, frame([180, 104]));
    for (let tick = 1; tick < MINIMAP_HISTORY_TICKS; tick++) {
      recordLines(history, frame(null));
    }
    expect(extentFromLines(mergeLines(history)!)).toEqual(withEdgeCell);

    recordLines(history, frame(null));
    expect(extentFromLines(mergeLines(history)!)).toEqual(matOnly);
  });
});
