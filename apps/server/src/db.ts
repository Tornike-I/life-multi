import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BOARD_SIZE, createBoard, squareMat } from "@life-multi/shared";
import { Game } from "./game.ts";

export const DATABASE_PATH = process.env.DATABASE_PATH ?? "data/life-multi.db";

interface WorldRow {
  width: number;
  height: number;
  generation: number;
  seed: number;
  cells: Uint8Array;
}

interface AccountRow {
  id: number;
  key_hash: string;
  name: string | null;
  last_seen_at: number;
  inventory: number;
  smoothed_live: number;
  live_cells: number;
  home_x: number | null;
  home_y: number | null;
  mat_x: number | null;
  mat_y: number | null;
  mat_w: number | null;
  mat_h: number | null;
}

export interface AdminAction {
  action: string;
  accountId: number;
}

export function openDatabase(path = DATABASE_PATH): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      name TEXT,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      inventory REAL NOT NULL,
      smoothed_live REAL NOT NULL DEFAULT 0,
      live_cells INTEGER NOT NULL DEFAULT 0,
      home_x INTEGER,
      home_y INTEGER,
      mat_x INTEGER,
      mat_y INTEGER,
      mat_w INTEGER,
      mat_h INTEGER
    );

    CREATE TABLE IF NOT EXISTS world (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      generation INTEGER NOT NULL,
      seed INTEGER NOT NULL,
      cells BLOB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_actions (
      id INTEGER PRIMARY KEY,
      action TEXT NOT NULL,
      account_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      applied_at INTEGER
    );
  `);
  addMissingColumns(db);
  return db;
}

function addMissingColumns(db: DatabaseSync): void {
  const existing = new Set(
    (
      db.prepare("PRAGMA table_info(accounts)").all() as unknown as {
        name: string;
      }[]
    ).map((column) => column.name),
  );
  if (!existing.has("name")) {
    db.exec("ALTER TABLE accounts ADD COLUMN name TEXT");
  }
}

export function loadGame(db: DatabaseSync, newSeed: () => number): Game {
  const world = db
    .prepare("SELECT width, height, generation, seed, cells FROM world")
    .get() as unknown as WorldRow | undefined;
  const saved =
    world?.width === BOARD_SIZE && world.height === BOARD_SIZE
      ? world
      : undefined;

  const board = createBoard(BOARD_SIZE, BOARD_SIZE);
  if (saved) {
    const { buffer, byteOffset, byteLength } = saved.cells;
    board.cells.set(
      new Uint16Array(buffer.slice(byteOffset, byteOffset + byteLength)),
    );
  }
  const game = new Game(
    board,
    saved?.generation ?? 0,
    saved?.seed ?? newSeed(),
  );

  const rows = db
    .prepare("SELECT * FROM accounts")
    .all() as unknown as AccountRow[];
  for (const row of rows) {
    const hasMat =
      saved !== undefined &&
      row.home_x !== null &&
      row.home_y !== null &&
      row.mat_x !== null &&
      row.mat_y !== null &&
      row.mat_w !== null &&
      row.mat_h !== null;
    game.addAccount({
      id: row.id,
      keyHash: row.key_hash,
      name: row.name,
      lastSeenAt: row.last_seen_at,
      inventory: row.inventory,
      smoothedLive: row.smoothed_live,
      recentLive: [],
      liveCells: row.live_cells,
      home: hasMat ? { x: row.home_x!, y: row.home_y! } : null,
      mat: hasMat
        ? squareMat(
            { x: row.home_x!, y: row.home_y! },
            Math.min(row.mat_w!, row.mat_h!),
            BOARD_SIZE,
            BOARD_SIZE,
          )
        : null,
    });
  }
  return game;
}

export function saveGame(db: DatabaseSync, game: Game): void {
  const { board } = game;
  const cells = new Uint8Array(
    board.cells.buffer,
    board.cells.byteOffset,
    board.cells.byteLength,
  );

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO world (id, width, height, generation, seed, cells)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         width = excluded.width, height = excluded.height,
         generation = excluded.generation, seed = excluded.seed,
         cells = excluded.cells`,
    ).run(board.width, board.height, game.generation, game.seed, cells);

    const update = db.prepare(
      `UPDATE accounts SET
         name = ?, last_seen_at = ?, inventory = ?, smoothed_live = ?,
         live_cells = ?, home_x = ?, home_y = ?,
         mat_x = ?, mat_y = ?, mat_w = ?, mat_h = ?
       WHERE id = ?`,
    );
    for (const account of game.accounts()) {
      const { home, mat } = account;
      update.run(
        account.name,
        account.lastSeenAt,
        account.inventory,
        account.smoothedLive,
        account.liveCells,
        home?.x ?? null,
        home?.y ?? null,
        mat?.x ?? null,
        mat?.y ?? null,
        mat?.w ?? null,
        mat?.h ?? null,
        account.id,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function insertAccount(
  db: DatabaseSync,
  keyHash: string,
  now: number,
  inventory: number,
): number {
  const result = db
    .prepare(
      "INSERT INTO accounts (key_hash, created_at, last_seen_at, inventory) VALUES (?, ?, ?, ?)",
    )
    .run(keyHash, now, now, inventory);
  return Number(result.lastInsertRowid);
}

export function takeAdminActions(db: DatabaseSync): AdminAction[] {
  const rows = db
    .prepare(
      "SELECT id, action, account_id FROM admin_actions WHERE applied_at IS NULL ORDER BY id",
    )
    .all() as unknown as { id: number; action: string; account_id: number }[];
  const markApplied = db.prepare(
    "UPDATE admin_actions SET applied_at = ? WHERE id = ?",
  );
  for (const row of rows) markApplied.run(Date.now(), row.id);
  return rows.map((row) => ({ action: row.action, accountId: row.account_id }));
}

export function queueAdminAction(
  db: DatabaseSync,
  action: "free",
  accountId: number,
): void {
  db.prepare(
    "INSERT INTO admin_actions (action, account_id, created_at) VALUES (?, ?, ?)",
  ).run(action, accountId, Date.now());
}

export function accountExists(db: DatabaseSync, id: number): boolean {
  return (
    db.prepare("SELECT 1 FROM accounts WHERE id = ?").get(id) !== undefined
  );
}

export function listAccounts(db: DatabaseSync): unknown[] {
  return db
    .prepare(
      `SELECT id,
         COALESCE(name, '-') AS name,
         datetime(last_seen_at / 1000, 'unixepoch') AS last_seen_utc,
         live_cells,
         CASE WHEN mat_x IS NULL THEN '-'
           ELSE mat_w || 'x' || mat_h || ' at ' || mat_x || ',' || mat_y END AS mat
       FROM accounts ORDER BY id`,
    )
    .all();
}
