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
    name: null,
    inventory: STARTING_INVENTORY,
    smoothedLive: 0,
    recentLive: [],
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

function putBlock(game: Game, x: number, y: number, color: number): void {
  const { width, height, cells } = game.board;
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    cells[((y + dy + height) % height) * width + ((x + dx + width) % width)] =
      color;
  }
}

function removeOnNextTick(
  game: Game,
  account: Account,
): string | null | undefined {
  let outcome: string | null | undefined;
  game.queueRemoveCells(account, (reason) => {
    outcome = reason;
  });
  game.tick();
  return outcome;
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

describe("removing cells", () => {
  it("removes only the player's own cells inside their mat", () => {
    const game = newGame();
    const player = joined(game, 1);
    const { x, y } = player.mat!;
    putBlock(game, x, y, 1);
    putBlock(game, x + 4, y + 4, 2);
    putBlock(game, x - 4, y - 4, 1);

    expect(removeOnNextTick(game, player)).toBeNull();
    expect(cellAt(game, x, y)).toBe(DEAD);
    expect(cellAt(game, x + 1, y + 1)).toBe(DEAD);
    expect(cellAt(game, x + 4, y + 4)).toBe(2);
    expect(cellAt(game, x - 4, y - 4)).toBe(1);
  });

  it("does not refund inventory", () => {
    const game = newGame();
    const player = joined(game, 1);
    const { x, y } = player.mat!;
    putBlock(game, x, y, 1);
    player.inventory = 5;

    removeOnNextTick(game, player);
    expect(player.inventory).toBeCloseTo(5 + TICK_MS / ACCRUAL_MS);
  });

  it("removes cells on a mat that wraps across the board edge", () => {
    const game = newGame();
    const player = joined(game, 1);
    player.home = { x: 1, y: 1 };
    player.mat = squareMat(player.home, 8, SIZE, SIZE);
    putBlock(game, 63, 63, 1);

    expect(removeOnNextTick(game, player)).toBeNull();
    for (const [cx, cy] of [
      [63, 63],
      [0, 63],
      [63, 0],
      [0, 0],
    ]) {
      expect(cellAt(game, cx, cy)).toBe(DEAD);
    }
  });

  it("refuses when the player has no mat", () => {
    const game = newGame();
    const player = newAccount(game, 1);
    putBlock(game, 10, 10, 1);

    expect(removeOnNextTick(game, player)).toMatch(/mat/);
    expect(cellAt(game, 10, 10)).toBe(1);
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

describe("smoothing", () => {
  it("keeps the smoothed count steady for a spaceship whose cell count alternates", () => {
    const game = newGame();
    const player = joined(game, 1);
    const { x, y } = player.mat!;
    const spaceship: [number, number][] = [
      [x + 1, y],
      [x + 4, y],
      [x, y + 1],
      [x, y + 2],
      [x + 4, y + 2],
      [x, y + 3],
      [x + 1, y + 3],
      [x + 2, y + 3],
      [x + 3, y + 3],
    ];
    expect(placeOnNextTick(game, player, spaceship)).toBeNull();
    for (let i = 0; i < 8; i++) game.tick();

    const liveCounts: number[] = [];
    const smoothed: number[] = [];
    for (let i = 0; i < 20; i++) {
      game.tick();
      liveCounts.push(player.liveCells);
      smoothed.push(player.smoothedLive);
    }
    expect(new Set(liveCounts).size).toBeGreaterThan(1);
    expect(new Set(smoothed)).toEqual(new Set([Math.max(...liveCounts)]));
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

describe("leaderboard", () => {
  it("ranks players by live cells and carries their names", () => {
    const game = newGame();
    const first = joined(game, 1);
    const second = joined(game, 2);
    first.liveCells = 3;
    second.liveCells = 9;
    game.rename(second, "Ada");

    const { entries, players } = game.leaderboard(10);
    expect(players).toBe(2);
    expect(entries).toEqual([
      { rank: 1, id: 2, name: "Ada", liveCells: 9 },
      { rank: 2, id: 1, name: null, liveCells: 3 },
    ]);
  });

  it("gives tied players the same rank and resumes after the tie", () => {
    const game = newGame();
    for (const id of [1, 2, 3]) joined(game, id);
    game.getAccount(1)!.liveCells = 5;
    game.getAccount(2)!.liveCells = 5;
    game.getAccount(3)!.liveCells = 1;

    const { ranks } = game.leaderboard(10);
    expect([ranks.get(1), ranks.get(2), ranks.get(3)]).toEqual([1, 1, 3]);
  });

  it("truncates the entries but still ranks and counts everyone", () => {
    const game = newGame();
    for (const id of [1, 2, 3]) {
      joined(game, id).liveCells = id;
    }

    const { entries, players, ranks } = game.leaderboard(2);
    expect(entries.map((entry) => entry.id)).toEqual([3, 2]);
    expect(players).toBe(3);
    expect(ranks.get(1)).toBe(3);
  });

  it("leaves out accounts with neither a mat nor live cells", () => {
    const game = newGame();
    const player = joined(game, 1);
    const watcher = newAccount(game, 2);
    game.free(player);

    expect(game.leaderboard(10).ranks.has(watcher.id)).toBe(false);

    player.liveCells = 2;
    expect(game.leaderboard(10).ranks.get(player.id)).toBe(1);
  });
});
