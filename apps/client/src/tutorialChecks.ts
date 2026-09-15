import {
  type Board,
  createBoard,
  DEAD,
  mod,
  type Point,
  setCell,
  step,
} from "@life-multi/shared";
import type { Cell } from "./blueprints.ts";

export const TUTORIAL_SIZE = 24;
export const PLAYER = 1;
export const NEIGHBOR = 2;

const MAX_PERIOD = 4;
const MAX_SHIFT = 2;

export function placePattern(
  board: Board,
  cells: readonly Cell[],
  x: number,
  y: number,
  color: number,
): void {
  for (const [dx, dy] of cells) setCell(board, x + dx, y + dy, color);
}

export function isEmpty(board: Board): boolean {
  return board.cells.every((color) => color === DEAD);
}

export function sameShape(a: Board, b: Board, dx = 0, dy = 0): boolean {
  const { width, height } = a;
  for (let y = 0; y < height; y++) {
    const shiftedRow = mod(y + dy, height) * width;
    for (let x = 0; x < width; x++) {
      const aAlive = a.cells[y * width + x] !== DEAD;
      const bAlive = b.cells[shiftedRow + mod(x + dx, width)] !== DEAD;
      if (aAlive !== bAlive) return false;
    }
  }
  return true;
}

export function isStillLife(board: Board): boolean {
  return !isEmpty(board) && sameShape(board, step(board, 0));
}

export function isOscillator(board: Board): boolean {
  if (isEmpty(board) || isStillLife(board)) return false;
  let next = board;
  for (let period = 1; period <= MAX_PERIOD; period++) {
    next = step(next, period);
    if (sameShape(board, next)) return true;
  }
  return false;
}

export function isSpaceship(board: Board): boolean {
  if (isEmpty(board)) return false;
  let next = board;
  for (let period = 1; period <= MAX_PERIOD; period++) {
    next = step(next, period);
    for (let dy = -MAX_SHIFT; dy <= MAX_SHIFT; dy++) {
      for (let dx = -MAX_SHIFT; dx <= MAX_SHIFT; dx++) {
        if ((dx !== 0 || dy !== 0) && sameShape(board, next, dx, dy)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function colorLesson(): { board: Board; target: Point } {
  const board = createBoard(TUTORIAL_SIZE, TUTORIAL_SIZE);
  const target = { x: 12, y: 12 };
  setCell(board, target.x - 1, target.y - 1, PLAYER);
  setCell(board, target.x + 1, target.y - 1, NEIGHBOR);
  return { board, target };
}
