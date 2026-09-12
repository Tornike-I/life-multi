import { describe, expect, it } from "vitest";
import { type Board, createBoard, getCell, setCell, step } from "./board.ts";

function boardFrom(rows: string[]): Board {
  const board = createBoard(rows[0].length, rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => setCell(board, x, y, char === "#" ? 1 : 0));
  });
  return board;
}

function rowsOf(board: Board): string[] {
  return Array.from({ length: board.height }, (_, y) =>
    Array.from({ length: board.width }, (_, x) =>
      getCell(board, x, y) ? "#" : ".",
    ).join(""),
  );
}

describe("step", () => {
  it("keeps a block stable", () => {
    const block = ["....", ".##.", ".##.", "...."];
    expect(rowsOf(step(boardFrom(block)))).toEqual(block);
  });

  it("oscillates a blinker with period 2", () => {
    const horizontal = [".....", ".....", ".###.", ".....", "....."];
    const vertical = [".....", "..#..", "..#..", "..#..", "....."];

    const once = step(boardFrom(horizontal));
    expect(rowsOf(once)).toEqual(vertical);
    expect(rowsOf(step(once))).toEqual(horizontal);
  });

  it("wraps neighbors across the board edges", () => {
    const vertical = ["#....", "#....", ".....", ".....", "#...."];
    const horizontal = ["##..#", ".....", ".....", ".....", "....."];
    expect(rowsOf(step(boardFrom(vertical)))).toEqual(horizontal);
  });
});
