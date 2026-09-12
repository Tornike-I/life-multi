import {
  ACCRUAL_MS,
  allowanceFor,
  createBoard,
  DEAD,
  matsTooClose,
  rectContains,
  STARTING_INVENTORY,
  TICK_MS,
} from "@life-multi/shared";
import { describe, expect, it } from "vitest";
import { type Account, Game } from "./game.ts";

function newGame(size = 64): Game {
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

function joined(game: Game, id: number): Account & { mat: object } {
  const account = newAccount(game, id);
  expect(game.join(account)).toBeNull();
  return account as Account & { mat: object };
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
});

describe("mats", () => {
  it("keeps different players' mats apart", () => {
    const game = newGame();
    const first = joined(game, 1);
    const second = joined(game, 2);
    expect(matsTooClose(first.mat!, second.mat!, 64, 64)).toBe(false);
  });

  it("refuses to join when there is no space left", () => {
    const game = newGame(12);
    joined(game, 1);
    expect(game.join(newAccount(game, 2))).toMatch(/No free space/);
  });

  it("shrinks a mat that exceeds the allowance while keeping home", () => {
    const game = newGame();
    const player = joined(game, 1);
    player.mat = { x: player.mat!.x, y: player.mat!.y, w: 20, h: 10 };

    game.tick();
    const { mat, home } = player;
    expect(mat!.w * mat!.h).toBeLessThanOrEqual(allowanceFor(0).matArea);
    expect(rectContains(mat!, home!)).toBe(true);
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
});
