import {
  ACCRUAL_MS,
  allowanceFor,
  BASE_MAT_SIDE,
  type Board,
  DEAD,
  findMatSpot,
  growMat,
  inventoryProgress,
  type LeaderboardEntry,
  matContains,
  matGrowthProgress,
  type MatInfo,
  matSideFor,
  mod,
  type PlayerStatus,
  type Point,
  type Rect,
  recordLive,
  smoothLive,
  squareMat,
  step,
  TICK_MS,
} from "@life-multi/shared";

export interface Account {
  readonly id: number;
  readonly keyHash: string;
  name: string | null;
  inventory: number;
  smoothedLive: number;
  readonly recentLive: number[];
  liveCells: number;
  home: Point | null;
  mat: Rect | null;
  lastSeenAt: number;
}

export interface Ranking {
  entries: LeaderboardEntry[];
  players: number;
  ranks: Map<number, number>;
}

type ActionDone = (reason: string | null) => void;

type Action =
  | {
      kind: "place";
      account: Account;
      cells: [number, number][];
      done: ActionDone;
    }
  | { kind: "removeCells"; account: Account; done: ActionDone };

const NO_MAT = "You don't have a mat yet.";

export class Game {
  board: Board;
  generation: number;
  readonly seed: number;
  private readonly byId = new Map<number, Account>();
  private readonly byKeyHash = new Map<string, Account>();
  private actions: Action[] = [];
  private readonly liveCounts = new Uint32Array(65536);

  constructor(board: Board, generation: number, seed: number) {
    this.board = board;
    this.generation = generation;
    this.seed = seed;
  }

  addAccount(account: Account): void {
    this.byId.set(account.id, account);
    this.byKeyHash.set(account.keyHash, account);
  }

  getAccount(id: number): Account | undefined {
    return this.byId.get(id);
  }

  findByKeyHash(keyHash: string): Account | undefined {
    return this.byKeyHash.get(keyHash);
  }

  accounts(): Iterable<Account> {
    return this.byId.values();
  }

  accountCount(): number {
    return this.byId.size;
  }

  join(account: Account): string | null {
    if (account.mat) return null;
    const spot = findMatSpot(
      this.otherMats(account.id),
      BASE_MAT_SIDE,
      this.board.width,
      this.board.height,
    );
    if (!spot) return "No free space on the board right now.";
    account.mat = spot.mat;
    account.home = spot.home;
    return null;
  }

  free(account: Account): void {
    account.mat = null;
    account.home = null;
  }

  rename(account: Account, name: string): void {
    account.name = name;
  }

  leaderboard(size: number): Ranking {
    const ranked = [...this.byId.values()]
      .filter((account) => account.liveCells > 0 || account.mat !== null)
      .sort((a, b) => b.liveCells - a.liveCells || a.id - b.id);

    const ranks = new Map<number, number>();
    let rank = 0;
    let previous = -1;
    ranked.forEach((account, index) => {
      if (account.liveCells !== previous) {
        rank = index + 1;
        previous = account.liveCells;
      }
      ranks.set(account.id, rank);
    });

    return {
      entries: ranked.slice(0, size).map((account) => ({
        rank: ranks.get(account.id)!,
        id: account.id,
        name: account.name,
        liveCells: account.liveCells,
      })),
      players: ranked.length,
      ranks,
    };
  }

  queuePlacement(
    account: Account,
    cells: [number, number][],
    done: ActionDone,
  ): void {
    this.actions.push({ kind: "place", account, cells, done });
  }

  queueRemoveCells(account: Account, done: ActionDone): void {
    this.actions.push({ kind: "removeCells", account, done });
  }

  tick(): void {
    this.board = step(this.board, this.generation, this.seed);
    this.generation++;

    const actions = this.actions;
    this.actions = [];
    for (const action of actions) {
      action.done(
        action.kind === "place"
          ? this.place(action.account, action.cells)
          : this.removeCells(action.account),
      );
    }

    this.updateAccounts();
  }

  mats(): MatInfo[] {
    return [...this.byId.values()].flatMap((account) =>
      account.mat ? [{ id: account.id, ...account.mat }] : [],
    );
  }

  status(account: Account): PlayerStatus {
    const { inventoryCap } = allowanceFor(account.smoothedLive);
    const side = account.mat?.w ?? 0;
    return {
      id: account.id,
      name: account.name,
      inventory: Math.floor(account.inventory),
      inventoryCap,
      inventoryProgress: inventoryProgress(account.inventory, inventoryCap),
      matProgress: account.mat
        ? matGrowthProgress(account.smoothedLive, side)
        : 0,
      matBlocked:
        account.mat !== null && matSideFor(account.smoothedLive) > side,
      liveCells: account.liveCells,
      home: account.home,
      mat: account.mat,
    };
  }

  private otherMats(id: number): Rect[] {
    return this.mats().filter((mat) => mat.id !== id);
  }

  private place(account: Account, cells: [number, number][]): string | null {
    const { mat } = account;
    if (!mat) return NO_MAT;
    const { width, height } = this.board;

    const squares = new Set<number>();
    for (const [x, y] of cells) {
      const square = { x: mod(x, width), y: mod(y, height) };
      if (!matContains(mat, square, width, height)) {
        return "You can only place cells on your own mat.";
      }
      squares.add(square.y * width + square.x);
    }

    const available = Math.floor(account.inventory);
    if (squares.size === 0) return "Select at least one square.";
    if (squares.size > available) {
      return `You only have ${available} cells to place.`;
    }
    for (const index of squares) {
      if (this.board.cells[index] !== DEAD) {
        return "Some selected squares are no longer empty.";
      }
    }

    for (const index of squares) this.board.cells[index] = account.id;
    account.inventory -= squares.size;
    return null;
  }

  private removeCells(account: Account): string | null {
    const { mat } = account;
    if (!mat) return NO_MAT;
    const { width, height, cells } = this.board;
    for (let dy = 0; dy < mat.h; dy++) {
      const row = mod(mat.y + dy, height) * width;
      for (let dx = 0; dx < mat.w; dx++) {
        const index = row + mod(mat.x + dx, width);
        if (cells[index] === account.id) cells[index] = DEAD;
      }
    }
    return null;
  }

  private updateAccounts(): void {
    const { width, height } = this.board;
    const counts = this.liveCounts;
    counts.fill(0);
    for (const color of this.board.cells) counts[color]++;

    const accrual = TICK_MS / ACCRUAL_MS;
    for (const account of this.byId.values()) {
      account.liveCells = counts[account.id];
      account.smoothedLive = smoothLive(
        account.smoothedLive,
        recordLive(account.recentLive, account.liveCells),
      );
      const { mat, home } = account;
      if (!mat || !home) continue;

      const target = matSideFor(account.smoothedLive);
      if (target !== mat.w) {
        const others = target > mat.w ? this.otherMats(account.id) : [];
        const side = growMat(home, mat.w, target, others, width, height);
        if (side !== mat.w) account.mat = squareMat(home, side, width, height);
      }

      const { inventoryCap } = allowanceFor(account.smoothedLive);
      if (account.inventory < inventoryCap) {
        account.inventory = Math.min(inventoryCap, account.inventory + accrual);
      }
    }
  }
}
