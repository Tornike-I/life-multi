import { describe, expect, it } from "vitest";
import { type Board, createBoard, getCell, setCell, step } from "./board.ts";

function boardFrom(rows: string[]): Board {
  const board = createBoard(rows[0].length, rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((char, x) =>
      setCell(board, x, y, char === "." ? 0 : Number(char)),
    );
  });
  return board;
}

function rowsOf(board: Board): string[] {
  return Array.from({ length: board.height }, (_, y) =>
    Array.from({ length: board.width }, (_, x) =>
      String(getCell(board, x, y) || "."),
    ).join(""),
  );
}

describe("step", () => {
  it("keeps a block stable", () => {
    const block = ["....", ".11.", ".11.", "...."];
    expect(rowsOf(step(boardFrom(block), 0))).toEqual(block);
  });

  it("oscillates a blinker with period 2", () => {
    const horizontal = [".....", ".....", ".111.", ".....", "....."];
    const vertical = [".....", "..1..", "..1..", "..1..", "....."];

    const once = step(boardFrom(horizontal), 0);
    expect(rowsOf(once)).toEqual(vertical);
    expect(rowsOf(step(once, 1))).toEqual(horizontal);
  });

  it("wraps neighbors across the board edges", () => {
    const vertical = ["1....", "1....", ".....", ".....", "1...."];
    const horizontal = ["11..1", ".....", ".....", ".....", "....."];
    expect(rowsOf(step(boardFrom(vertical), 0))).toEqual(horizontal);
  });

  it("gives a newborn cell the majority color of its parents", () => {
    const before = ["......", ".12...", ".1....", "......", "......", "......"];
    const after = ["......", ".12...", ".11...", "......", "......", "......"];
    expect(rowsOf(step(boardFrom(before), 0))).toEqual(after);
  });

  it("keeps a surviving cell's color even when outnumbered", () => {
    const block = ["....", ".11.", ".12.", "...."];
    expect(rowsOf(step(boardFrom(block), 0))).toEqual(block);
  });

  describe("walls", () => {
    const wallsAt = (board: Board, squares: [number, number][]) => {
      const walls = new Uint8Array(board.width * board.height);
      for (const [x, y] of squares) walls[y * board.width + x] = 1;
      return walls;
    };

    it("stop a cell from being born on them", () => {
      const horizontal = boardFrom([
        ".....",
        ".....",
        ".111.",
        ".....",
        ".....",
      ]);
      const next = step(horizontal, 0, 0, wallsAt(horizontal, [[2, 1]]));
      expect(rowsOf(next)).toEqual([
        ".....",
        ".....",
        "..1..",
        "..1..",
        ".....",
      ]);
    });
  });

  describe("three-way birth ties", () => {
    const blinker = [".....", ".....", ".123.", ".....", "....."];
    const newborn = (generation: number, seed = 0) =>
      getCell(step(boardFrom(blinker), generation, seed), 2, 1);

    it("resolve identically for the same seed and generation", () => {
      const first = step(boardFrom(blinker), 7, 42);
      const second = step(boardFrom(blinker), 7, 42);
      expect(rowsOf(first)).toEqual(rowsOf(second));
    });

    it("pick each parent color about equally often", () => {
      const counts = new Map<number, number>();
      for (let generation = 0; generation < 3000; generation++) {
        const color = newborn(generation);
        counts.set(color, (counts.get(color) ?? 0) + 1);
      }
      expect([...counts.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3]);
      for (const count of counts.values()) {
        expect(count).toBeGreaterThan(900);
        expect(count).toBeLessThan(1100);
      }
    });
  });
});
