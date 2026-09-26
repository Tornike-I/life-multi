import { createBoard, getCell, setCell, step } from "@life-multi/shared";
import { describe, expect, it } from "vitest";
import { findPattern } from "./blueprints.ts";
import {
  colorLesson,
  isOscillator,
  isSpaceship,
  isStillLife,
  NEIGHBOR,
  placePattern,
  PLAYER,
  TUTORIAL_SIZE,
} from "./tutorialChecks.ts";

function boardWith(id: string, x = 10, y = 10) {
  const board = createBoard(TUTORIAL_SIZE, TUTORIAL_SIZE);
  const blueprint = findPattern(id)!;
  placePattern(board, blueprint.cells, x, y, PLAYER);
  return board;
}

describe("shape families", () => {
  it.each([
    ["builtin:block", true, false, false],
    ["builtin:beehive", true, false, false],
    ["builtin:blinker", false, true, false],
    ["builtin:glider", false, false, true],
    ["builtin:lwss", false, false, true],
  ])(
    "classifies %s (still life %s, oscillator %s, spaceship %s)",
    (id, still, oscillator, spaceship) => {
      const board = boardWith(id);
      expect(isStillLife(board)).toBe(still);
      expect(isOscillator(board)).toBe(oscillator);
      expect(isSpaceship(board)).toBe(spaceship);
    },
  );

  it("recognizes a spaceship that wraps across the board edge", () => {
    expect(isSpaceship(boardWith("builtin:glider", 22, 22))).toBe(true);
  });

  it("recognizes nothing on an empty board", () => {
    const board = createBoard(TUTORIAL_SIZE, TUTORIAL_SIZE);
    expect(isStillLife(board)).toBe(false);
    expect(isOscillator(board)).toBe(false);
    expect(isSpaceship(board)).toBe(false);
  });

  it("doesn't count a block and a glider together as a spaceship", () => {
    const board = boardWith("builtin:glider", 2, 2);
    placePattern(
      board,
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
      15,
      15,
      PLAYER,
    );
    expect(isSpaceship(board)).toBe(false);
  });
});

describe("colorLesson", () => {
  it("is born in the player's color when they add the third parent", () => {
    const { board, target } = colorLesson();
    setCell(board, target.x, target.y + 1, PLAYER);
    expect(getCell(step(board, 0), target.x, target.y)).toBe(PLAYER);
  });

  it("is born in the other color when that color has two parents", () => {
    const { board, target } = colorLesson();
    setCell(board, target.x, target.y + 1, NEIGHBOR);
    expect(getCell(step(board, 0), target.x, target.y)).toBe(NEIGHBOR);
  });

  it("stays empty without a third parent", () => {
    const { board, target } = colorLesson();
    setCell(board, 3, 3, PLAYER);
    expect(getCell(step(board, 0), target.x, target.y)).toBe(0);
  });
});
