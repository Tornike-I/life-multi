import { describe, expect, it } from "vitest";
import { inventoryProgress, matGrowthProgress, matSideFor } from "./rules.ts";

describe("matSideFor", () => {
  it.each([
    [0, 8],
    [8.4, 8],
    [8.5, 9],
    [616, 36],
  ])("gives %s smoothed live cells a side of %s", (smoothedLive, side) => {
    expect(matSideFor(smoothedLive)).toBe(side);
  });
});

describe("matGrowthProgress", () => {
  it("measures the unfloored allowance between the current and next square", () => {
    expect(matGrowthProgress(0, 8)).toBe(0);
    expect(matGrowthProgress(4.25, 8)).toBe(0.5);
    expect(matGrowthProgress(8.5, 8)).toBe(1);
  });

  it("stays within 0 and 1", () => {
    expect(matGrowthProgress(1000, 8)).toBe(1);
    expect(matGrowthProgress(0, 12)).toBe(0);
  });
});

describe("inventoryProgress", () => {
  it("is the fraction toward the next whole cell", () => {
    expect(inventoryProgress(3.5, 12)).toBe(0.5);
  });

  it("is full at or above the cap", () => {
    expect(inventoryProgress(12, 12)).toBe(1);
    expect(inventoryProgress(14.2, 12)).toBe(1);
  });
});
