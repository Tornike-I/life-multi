import { describe, expect, it } from "vitest";
import {
  blockedMatPositions,
  findMatSpot,
  growMat,
  matContains,
  matsTooClose,
  squareMat,
} from "./mat.ts";

describe("squareMat", () => {
  it("centers the square on home, alternating the side that grows", () => {
    const home = { x: 10, y: 10 };
    expect(squareMat(home, 8, 64, 64)).toEqual({ x: 6, y: 6, w: 8, h: 8 });
    expect(squareMat(home, 9, 64, 64)).toEqual({ x: 6, y: 6, w: 9, h: 9 });
    expect(squareMat(home, 10, 64, 64)).toEqual({ x: 5, y: 5, w: 10, h: 10 });
  });

  it("wraps across the board edge", () => {
    const mat = squareMat({ x: 1, y: 1 }, 8, 64, 64);
    expect(mat).toEqual({ x: 61, y: 61, w: 8, h: 8 });
    expect(matContains(mat, { x: 62, y: 0 }, 64, 64)).toBe(true);
    expect(matContains(mat, { x: 4, y: 4 }, 64, 64)).toBe(true);
    expect(matContains(mat, { x: 5, y: 4 }, 64, 64)).toBe(false);
  });
});

describe("matsTooClose", () => {
  const mat = { x: 0, y: 0, w: 10, h: 10 };

  it("requires a gap to other mats", () => {
    expect(matsTooClose(mat, { x: 12, y: 0, w: 10, h: 10 }, 64, 64)).toBe(true);
    expect(matsTooClose(mat, { x: 13, y: 0, w: 10, h: 10 }, 64, 64)).toBe(
      false,
    );
  });

  it("measures the gap across the wrapped board edge", () => {
    expect(matsTooClose(mat, { x: 58, y: 0, w: 4, h: 10 }, 64, 64)).toBe(true);
    expect(matsTooClose(mat, { x: 57, y: 0, w: 4, h: 10 }, 64, 64)).toBe(false);
  });
});

describe("growMat", () => {
  const home = { x: 10, y: 4 };

  it("grows up to the target side when nothing is in the way", () => {
    expect(growMat(home, 8, 20, [], 64, 64)).toBe(20);
  });

  it("stops before the size that would break the gap", () => {
    const neighbor = { x: 20, y: 0, w: 8, h: 8 };
    const side = growMat(home, 8, 20, [neighbor], 64, 64);
    expect(side).toBe(14);
    expect(matsTooClose(squareMat(home, side, 64, 64), neighbor, 64, 64)).toBe(
      false,
    );
  });

  it("shrinks straight to a smaller target", () => {
    expect(growMat(home, 12, 9, [], 64, 64)).toBe(9);
  });

  it("never grows past the board", () => {
    expect(growMat(home, 8, 100, [], 64, 64)).toBe(64);
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
        if ((blocked[y * 64 + x] === 1) !== tooClose) {
          mismatches.push(`${x},${y}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("findMatSpot", () => {
  it("starts the first player near the middle of the board", () => {
    expect(findMatSpot([], 8, 64, 64)).toEqual({
      mat: { x: 24, y: 24, w: 8, h: 8 },
      home: { x: 28, y: 28 },
    });
  });

  it("keeps new spots clear of existing mats", () => {
    const first = { x: 24, y: 24, w: 8, h: 8 };
    const spot = findMatSpot([first], 8, 64, 64);
    expect(spot).not.toBeNull();
    expect(matsTooClose(spot!.mat, first, 64, 64)).toBe(false);
  });

  it("returns null when no spot is free", () => {
    expect(findMatSpot([{ x: 1, y: 1, w: 10, h: 10 }], 10, 12, 12)).toBeNull();
  });
});
