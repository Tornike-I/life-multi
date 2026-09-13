import { describe, expect, it } from "vitest";
import { ownExtent, ringSpan } from "./view.ts";

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
  const cornerMat = { x: 0, y: 0, w: 8, h: 8 };

  function cellsAt(...squares: [number, number, number?][]): Uint16Array {
    const cells = new Uint16Array(size * size);
    for (const [x, y, color = 1] of squares) cells[y * size + x] = color;
    return cells;
  }

  it("is null for a player without a mat, even with cells", () => {
    expect(ownExtent(cellsAt([10, 10]), size, size, 1, null)).toBeNull();
  });

  it("pads a lone mat up to the minimum minimap size", () => {
    const mat = { x: 100, y: 40, w: 8, h: 8 };
    expect(ownExtent(cellsAt(), size, size, 1, mat)).toEqual({
      x: 72,
      y: 12,
      w: 64,
      h: 64,
    });
  });

  it("covers a mat that wraps across the board edge", () => {
    const mat = { x: 250, y: 10, w: 8, h: 8 };
    expect(ownExtent(cellsAt(), size, size, 1, mat)).toEqual({
      x: 222,
      y: -18,
      w: 64,
      h: 64,
    });
  });

  it("follows the player's nearby cells across the wrapped edge and ignores other colors", () => {
    const mat = { x: 2, y: 10, w: 8, h: 8 };
    const cells = cellsAt([250, 10], [100, 10, 2]);
    expect(ownExtent(cells, size, size, 1, mat)).toEqual({
      x: 226,
      y: -18,
      w: 64,
      h: 64,
    });
  });

  it("grows beyond the minimum as nearby cells spread", () => {
    expect(ownExtent(cellsAt([60, 5]), size, size, 1, cornerMat)).toEqual({
      x: -16,
      y: -28,
      w: 93,
      h: 64,
    });
  });

  it("counts cells up to the range from the mat and ignores farther ones", () => {
    expect(ownExtent(cellsAt([71, 4]), size, size, 1, cornerMat)).toEqual({
      x: -16,
      y: -28,
      w: 104,
      h: 64,
    });
    expect(ownExtent(cellsAt([72, 4]), size, size, 1, cornerMat)).toEqual({
      x: -28,
      y: -28,
      w: 64,
      h: 64,
    });
  });

  it("measures the range around the wrapped board edge", () => {
    expect(ownExtent(cellsAt([192, 4]), size, size, 1, cornerMat)).toEqual({
      x: 176,
      y: -28,
      w: 104,
      h: 64,
    });
  });
});
