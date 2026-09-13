import {
  ACCRUAL_MS,
  allowanceFor,
  createBoard,
  DEAD,
  matsTooClose,
  squareMat,
  STARTING_INVENTORY,
  TICK_MS,
} from "@life-multi/shared";
import { describe, expect, it } from "vitest";
import { type Account, Game } from "./game.ts";

const SIZE = 64;

function newGame(size = SIZE): Game {
  return new Game(createBoard(size, size), 0, 1);
}

function newAccount(game: Game, id: number): Account {
  const account: Account = {
    id,
    keyHash: `key-${id}`,
    inventory: STARTING_INVENTORY,
    smoothedLive: 0,
    liveCells: 0,
    home: null,
    mat: null,
    lastSeenAt: 0,
  };
  game.addAccount(account);
  return account;
}

function joined(game: Game, id: number): Account {
  const account = newAccount(game, id);
  expect(game.join(account)).toBeNull();
  return account;
}

function placeOnNextTick(
  game: Game,
  account: Account,
  cells: [number, number][],
): string | null | undefined {
  let outcome: string | null | undefined;
  game.queuePlacement(account, cells, (reason) => {
    outcome = reason;
  });
  game.tick();
  return outcome;
}

function cellAt(game: Game, x: number, y: number): number {
  return game.board.cells[y * game.board.width + x];
}

describe("placement", () => {
  it("places a group on empty squares of the player's mat and spends inventory", () => {
    const game = newGame();
    const player = joined(game, 1);
    const { x, y } = player.mat!;
    const block: [number, number][] = [
      [x, y],
      [x + 1, y],
      [x, y + 1],
      [x + 1, y + 1],
    ];

    expect(placeOnNextTick(game, player, block)).toBeNull();
    expect(block.map(([cx, cy]) => cellAt(game, cx, cy))).toEqual([1, 1, 1, 1]);
    expect(player.inventory).toBeCloseTo(
      STARTING_INVENTORY - 4 + TICK_MS / ACCRUAL_MS,
    );
  });

  it("rejects the whole group when a square is outside the mat", () => {
    const game = newGame();
    const player = joined(game, 1);
    const { x, y } = player.mat!;

    const reason = placeOnNextTick(game, player, [
      [x, y],
      [x - 1, y],
    ]);
    expect(reason).toMatch(/own mat/);
    expect(cellAt(game, x, y)).toBe(DEAD);
  });

  it("rejects the whole group when a square is already filled", () => {
    const game = newGame();
    const player = joined(game, 1);
    const { x, y } = player.mat!;
    placeOnNextTick(game, player, [
      [x, y],
      [x + 1, y],
      [x, y + 1],
      [x + 1, y + 1],
    ]);

    const reason = placeOnNextTick(game, player, [
      [x, y],
      [x + 4, y],
    ]);
    expect(reason).toMatch(/no longer empty/);
    expect(cellAt(game, x + 4, y)).toBe(DEAD);
  });

  it("rejects groups larger than the inventory", () => {
    const game = newGame();
    const player = joined(game, 1);
    player.inventory = 3;
    const { x, y } = player.mat!;

    const reason = placeOnNextTick(game, player, [
      [x, y],
      [x + 1, y],
      [x + 2, y],
      [x + 3, y],
    ]);
    expect(reason).toMatch(/only have 3/);
  });

  it("places on a mat that wraps across the board edge", () => {
    const game = newGame();
    const player = joined(game, 1);
    player.home = { x: 1, y: 1 };
    player.mat = squareMat(player.home, 8, SIZE, SIZE);

    expect(
      placeOnNextTick(game, player, [
        [62, 0],
        [-2, 1],
        [3, 3],
      ]),
    ).toBeNull();
    expect(cellAt(game, 62, 0)).toBe(1);
    expect(cellAt(game, 62, 1)).toBe(1);
    expect(cellAt(game, 3, 3)).toBe(1);
  });
});

describe("mats", () => {
  it("keeps different players' mats apart", () => {
    const game = newGame();
    const first = joined(game, 1);
    const second = joined(game, 2);
    expect(matsTooClose(first.mat!, second.mat!, SIZE, SIZE)).toBe(false);
  });

  it("refuses to join when there is no space left", () => {
    const game = newGame(12);
    joined(game, 1);
    expect(game.join(newAccount(game, 2))).toMatch(/No free space/);
  });

  it("grows the mat one square around home when the allowance reaches the next square", () => {
    const game = newGame();
    const player = joined(game, 1);
    player.smoothedLive = 9;

    game.tick();
    expect(player.mat).toEqual(squareMat(player.home!, 9, SIZE, SIZE));
  });

  it("shrinks the mat straight to the allowed side", () => {
    const game = newGame();
    const player = joined(game, 1);
    player.mat = squareMat(player.home!, 12, SIZE, SIZE);

    game.tick();
    expect(player.mat).toEqual(squareMat(player.home!, 8, SIZE, SIZE));
  });

  it("stops growing before another mat's gap and reports it as blocked", () => {
    const game = newGame();
    const first = joined(game, 1);
    const second = joined(game, 2);
    first.smoothedLive = 5000;

    game.tick();
    expect(first.mat!.w).toBeGreaterThan(8);
    expect(matsTooClose(first.mat!, second.mat!, SIZE, SIZE)).toBe(false);
    expect(game.status(first).matBlocked).toBe(true);
    expect(game.status(second).matBlocked).toBe(false);
  });

  it("gives a freed account a new spot when it joins again", () => {
    const game = newGame();
    const player = joined(game, 1);
    game.free(player);
    expect(player.mat).toBeNull();

    expect(game.join(player)).toBeNull();
    expect(player.mat).not.toBeNull();
  });
});

describe("inventory", () => {
  it("accrues up to the cap and no further", () => {
    const game = newGame();
    const player = joined(game, 1);
    const { inventoryCap } = allowanceFor(0);
    player.inventory = inventoryCap - 0.01;

    for (let i = 0; i < 10; i++) game.tick();
    expect(player.inventory).toBe(inventoryCap);
  });

  it("reports progress toward the next cell and the next mat size", () => {
    const game = newGame();
    const player = joined(game, 1);
    player.inventory = 3.5;
    player.smoothedLive = 4.25;

    const status = game.status(player);
    expect(status.inventory).toBe(3);
    expect(status.inventoryProgress).toBe(0.5);
    expect(status.matProgress).toBe(0.5);
    expect(status.matBlocked).toBe(false);
  });
});
