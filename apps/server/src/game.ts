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
  wallCapFor,
  type WallInfo,
} from "@life-multi/shared";

export interface Account {
  readonly id: number;
  readonly keyHash: string;
  name: string | null;
  inventory: number;
  smoothedLive: number;
  readonly recentLive: number[];
  liveCells: number;
  readonly walls: Set<number>;
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
  | { kind: "removeCells"; account: Account; done: ActionDone }
  | {
      kind: "wall";
      account: Account;
      square: Point;
      remove: boolean;
      done: ActionDone;
    };

const NO_MAT = "You don't have a mat yet.";

export class Game {
  board: Board;
  generation: number;
  readonly seed: number;
  private readonly byId = new Map<number, Account>();
  private readonly byKeyHash = new Map<string, Account>();
  private actions: Action[] = [];
  private readonly liveCounts = new Uint32Array(65536);
  private readonly wallMask: Uint8Array;

  constructor(board: Board, generation: number, seed: number) {
    this.board = board;
    this.generation = generation;
    this.seed = seed;
    this.wallMask = new Uint8Array(board.width * board.height);
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
    for (const index of account.walls) this.removeWall(account, index);
    account.mat = null;
    account.home = null;
  }

  // For loading a saved world: skips the limit, which a shrunk mat may already exceed.
  restoreWall(account: Account, index: number): void {
    const { mat } = account;
    const { width, height, cells } = this.board;
    const square = { x: index % width, y: Math.floor(index / width) };
    if (!mat || index < 0 || index >= cells.length) return;
    if (!matContains(mat, square, width, height)) return;
    if (this.wallMask[index] || cells[index] !== DEAD) return;
    this.addWall(account, index);
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

  queueWall(
    account: Account,
    square: Point,
    remove: boolean,
    done: ActionDone,
  ): void {
    this.actions.push({ kind: "wall", account, square, remove, done });
  }

  tick(): void {
    this.board = step(this.board, this.generation, this.seed, this.wallMask);
    this.generation++;

    const actions = this.actions;
    this.actions = [];
    for (const action of actions) action.done(this.apply(action));

    this.updateAccounts();
  }

  mats(): MatInfo[] {
    return [...this.byId.values()].flatMap((account) =>
      account.mat ? [{ id: account.id, ...account.mat }] : [],
    );
  }

  walls(): WallInfo[] {
    const { width } = this.board;
    return [...this.byId.values()].flatMap((account) =>
      [...account.walls].map((index) => ({
        id: account.id,
        x: index % width,
        y: Math.floor(index / width),
      })),
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
      walls: account.walls.size,
      wallCap: wallCapFor(side),
      home: account.home,
      mat: account.mat,
    };
  }

  private otherMats(id: number): Rect[] {
    return this.mats().filter((mat) => mat.id !== id);
  }

  private apply(action: Action): string | null {
    switch (action.kind) {
      case "place":
        return this.place(action.account, action.cells);
      case "removeCells":
        return this.removeCells(action.account);
      case "wall":
        return action.remove
          ? this.takeDownWall(action.account, action.square)
          : this.putUpWall(action.account, action.square);
    }
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
      if (this.wallMask[index]) return "Some selected squares have walls.";
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

  private putUpWall(account: Account, point: Point): string | null {
    const { mat } = account;
    if (!mat) return NO_MAT;
    const { width, height } = this.board;
    const square = { x: mod(point.x, width), y: mod(point.y, height) };
    const index = square.y * width + square.x;
    if (!matContains(mat, square, width, height)) {
      return "You can only place walls on your own mat.";
    }
    if (this.wallMask[index]) return "That square already has a wall.";
    if (this.board.cells[index] !== DEAD) {
      return "Walls can only go on empty squares.";
    }
    const cap = wallCapFor(mat.w);
    if (account.walls.size >= cap) {
      return `Your mat allows ${cap} walls. Remove one first.`;
    }
    this.addWall(account, index);
    return null;
  }

  private takeDownWall(account: Account, point: Point): string | null {
    const { width, height } = this.board;
    const index = mod(point.y, height) * width + mod(point.x, width);
    if (!account.walls.has(index)) return "You can only remove your own walls.";
    this.removeWall(account, index);
    return null;
  }

  private addWall(account: Account, index: number): void {
    account.walls.add(index);
    this.wallMask[index] = 1;
  }

  private removeWall(account: Account, index: number): void {
    account.walls.delete(index);
    this.wallMask[index] = 0;
  }

  private removeWallsOutsideMat(account: Account, mat: Rect): void {
    const { width, height } = this.board;
    for (const index of account.walls) {
      const square = { x: index % width, y: Math.floor(index / width) };
      if (!matContains(mat, square, width, height)) {
        this.removeWall(account, index);
      }
    }
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
        if (side !== mat.w) {
          account.mat = squareMat(home, side, width, height);
          if (side < mat.w) this.removeWallsOutsideMat(account, account.mat);
        }
      }

      const { inventoryCap } = allowanceFor(account.smoothedLive);
      if (account.inventory < inventoryCap) {
        account.inventory = Math.min(inventoryCap, account.inventory + accrual);
      }
    }
  }
}
