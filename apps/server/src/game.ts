import {
  ACCRUAL_MS,
  allowanceFor,
  BASE_MAT_SIDE,
  type Board,
  DEAD,
  findMatSpot,
  LIVE_SMOOTHING_DECAY,
  type MatInfo,
  type PlayerStatus,
  type Point,
  type Rect,
  rectContains,
  shrinkMat,
  step,
  TICK_MS,
  validateMat,
} from "@life-multi/shared";

export interface Account {
  readonly id: number;
  readonly keyHash: string;
  inventory: number;
  smoothedLive: number;
  liveCells: number;
  home: Point | null;
  mat: Rect | null;
  lastSeenAt: number;
}

type PlacementDone = (reason: string | null) => void;

interface Placement {
  account: Account;
  cells: [number, number][];
  done: PlacementDone;
}

const NO_MAT = "You don't have a mat yet.";

export class Game {
  board: Board;
  generation: number;
  readonly seed: number;
  private readonly byId = new Map<number, Account>();
  private readonly byKeyHash = new Map<string, Account>();
  private placements: Placement[] = [];
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

  resize(account: Account, mat: Rect): string | null {
    if (!account.mat || !account.home) return NO_MAT;
    const reason = validateMat(
      mat,
      account.home,
      allowanceFor(account.smoothedLive).matArea,
      this.otherMats(account.id),
      this.board.width,
      this.board.height,
    );
    if (reason) return reason;
    account.mat = { x: mat.x, y: mat.y, w: mat.w, h: mat.h };
    return null;
  }

  free(account: Account): void {
    account.mat = null;
    account.home = null;
  }

  queuePlacement(
    account: Account,
    cells: [number, number][],
    done: PlacementDone,
  ): void {
    this.placements.push({ account, cells, done });
  }

  tick(): void {
    this.board = step(this.board, this.generation, this.seed);
    this.generation++;

    const placements = this.placements;
    this.placements = [];
    for (const { account, cells, done } of placements) {
      done(this.place(account, cells));
    }

    this.updateAccounts();
  }

  mats(): MatInfo[] {
    return [...this.byId.values()].flatMap((account) =>
      account.mat ? [{ id: account.id, ...account.mat }] : [],
    );
  }

  status(account: Account): PlayerStatus {
    const { matArea, inventoryCap } = allowanceFor(account.smoothedLive);
    return {
      id: account.id,
      inventory: Math.floor(account.inventory),
      inventoryCap,
      matArea,
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

    const squares = new Set<number>();
    for (const [x, y] of cells) {
      if (!rectContains(mat, { x, y })) {
        return "You can only place cells on your own mat.";
      }
      squares.add(y * this.board.width + x);
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

  private updateAccounts(): void {
    const counts = this.liveCounts;
    counts.fill(0);
    for (const color of this.board.cells) counts[color]++;

    const accrual = TICK_MS / ACCRUAL_MS;
    for (const account of this.byId.values()) {
      account.liveCells = counts[account.id];
      account.smoothedLive = Math.max(
        account.liveCells,
        account.smoothedLive * LIVE_SMOOTHING_DECAY,
      );
      if (!account.mat || !account.home) continue;

      const { matArea, inventoryCap } = allowanceFor(account.smoothedLive);
      account.mat = shrinkMat(account.mat, account.home, matArea);
      if (account.inventory < inventoryCap) {
        account.inventory = Math.min(inventoryCap, account.inventory + accrual);
      }
    }
  }
}
