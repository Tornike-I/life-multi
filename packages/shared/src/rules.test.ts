import { describe, expect, it } from "vitest";
import {
  inventoryProgress,
  LIVE_PEAK_TICKS,
  LIVE_SMOOTHING_DECAY,
  matGrowthProgress,
  matSideFor,
  recordLive,
  smoothLive,
  wallCapFor,
} from "./rules.ts";

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

describe("live cell smoothing", () => {
  it("holds steady while the count oscillates within the peak window", () => {
    const recent: number[] = [];
    let smoothed = 0;
    const seen = new Set<number>();
    for (let tick = 0; tick < 200; tick++) {
      const live = tick % 2 === 0 ? 18 : 17;
      smoothed = smoothLive(smoothed, recordLive(recent, live));
      seen.add(smoothed);
    }
    expect([...seen]).toEqual([18]);
    expect(matSideFor(smoothed)).toBe(10);
  });

  it("keeps the peak for the whole window, then decays", () => {
    const recent: number[] = [];
    let smoothed = smoothLive(0, recordLive(recent, 40));
    for (let tick = 1; tick < LIVE_PEAK_TICKS; tick++) {
      smoothed = smoothLive(smoothed, recordLive(recent, 0));
    }
    expect(smoothed).toBe(40);

    smoothed = smoothLive(smoothed, recordLive(recent, 0));
    expect(smoothed).toBeCloseTo(40 * LIVE_SMOOTHING_DECAY);
  });

  it("only remembers the last LIVE_PEAK_TICKS counts", () => {
    const recent: number[] = [];
    for (let tick = 0; tick < LIVE_PEAK_TICKS + 5; tick++) {
      recordLive(recent, tick);
    }
    expect(recent).toHaveLength(LIVE_PEAK_TICKS);
  });
});

describe("wallCapFor", () => {
  it.each([
    [0, 0],
    [8, 4],
    [9, 4],
    [36, 18],
  ])("gives a mat side of %s a limit of %s walls", (side, cap) => {
    expect(wallCapFor(side)).toBe(cap);
  });
});
