import { describe, expect, it } from "vitest";
import {
  blockedMatPositions,
  findMatSpot,
  matsTooClose,
  rectContains,
  shrinkMat,
  validateMat,
} from "./mat.ts";

describe("validateMat", () => {
  const home = { x: 5, y: 5 };
  const mat = { x: 0, y: 0, w: 10, h: 10 };

  it("accepts a mat that follows the rules", () => {
    expect(validateMat(mat, home, 100, [], 64, 64)).toBeNull();
  });

  it.each([
    ["larger than the allowance", { x: 0, y: 0, w: 11, h: 10 }],
    ["thinner than the minimum side", { x: 4, y: 0, w: 3, h: 30 }],
    ["too stretched", { x: 4, y: 0, w: 4, h: 13 }],
    ["outside the board", { x: -1, y: 0, w: 10, h: 10 }],
    ["missing the home square", { x: 6, y: 0, w: 10, h: 10 }],
  ])("rejects a mat %s", (_, candidate) => {
    expect(validateMat(candidate, home, 100, [], 64, 64)).not.toBeNull();
  });

  it("requires a gap to other mats", () => {
    const tooClose = { x: 12, y: 0, w: 10, h: 10 };
    const farEnough = { x: 13, y: 0, w: 10, h: 10 };
    expect(validateMat(mat, home, 100, [tooClose], 64, 64)).not.toBeNull();
    expect(validateMat(mat, home, 100, [farEnough], 64, 64)).toBeNull();
  });

  it("measures the gap across the wrapped board edge", () => {
    const tooClose = { x: 58, y: 0, w: 4, h: 10 };
    const farEnough = { x: 57, y: 0, w: 4, h: 10 };
    expect(matsTooClose(mat, tooClose, 64, 64)).toBe(true);
    expect(matsTooClose(mat, farEnough, 64, 64)).toBe(false);
  });
});

describe("shrinkMat", () => {
  it("fits the allowance while keeping the home square", () => {
    const home = { x: 2, y: 5 };
    const shrunk = shrinkMat({ x: 0, y: 0, w: 30, h: 10 }, home, 100);
    expect(shrunk).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(rectContains(shrunk, home)).toBe(true);
  });
});

describe("blockedMatPositions", () => {
  it("marks exactly the positions that would be too close to another mat", () => {
    const others = [
      { x: 3, y: 50, w: 10, h: 6 },
      { x: 58, y: 2, w: 5, h: 12 },
      { x: 30, y: 30, w: 4, h: 4 },
    ];
    const blocked = blockedMatPositions(others, 8, 64, 64);
    const mismatches: string[] = [];
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const candidate = { x, y, w: 8, h: 8 };
        const tooClose = others.some((other) =>
          matsTooClose(candidate, other, 64, 64),
        );
        if ((blocked[y * 64 + x] === 1) !== tooClose)
          mismatches.push(`${x},${y}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("findMatSpot", () => {
  it("starts the first player near the middle of the board", () => {
    expect(findMatSpot([], 10, 64, 64)).toEqual({
      mat: { x: 24, y: 24, w: 10, h: 10 },
      home: { x: 29, y: 29 },
    });
  });

  it("keeps new spots clear of existing mats", () => {
    const first = { x: 27, y: 27, w: 10, h: 10 };
    const spot = findMatSpot([first], 10, 64, 64);
    expect(spot).not.toBeNull();
    expect(matsTooClose(spot!.mat, first, 64, 64)).toBe(false);
  });

  it("returns null when no spot is free", () => {
    expect(findMatSpot([{ x: 1, y: 1, w: 10, h: 10 }], 10, 12, 12)).toBeNull();
  });
});
