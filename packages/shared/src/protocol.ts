import type { Point, Rect } from "./mat.ts";

export const MAX_CELLS_PER_PLACE = 256;
export const MAX_KEY_LENGTH = 128;
export const MAX_PLAYER_NAME_LENGTH = 20;

// Bounds the work sanitizePlayerName does on a hostile client's string.
const MAX_RAW_NAME_LENGTH = 200;

// Stripped before BLANK, so that dropping a zero-width character joins the text
// around it while a tab or newline instead becomes a space.
const INVISIBLE = /\p{Cf}/gu;
const BLANK = /[\s\p{Cc}\p{Zl}\p{Zp}]+/gu;

export interface MatInfo extends Rect {
  id: number;
}

export interface WallInfo extends Point {
  id: number;
}

export interface PlayerStatus {
  id: number;
  name: string | null;
  inventory: number;
  inventoryCap: number;
  inventoryProgress: number;
  matProgress: number;
  matBlocked: boolean;
  liveCells: number;
  walls: number;
  wallCap: number;
  home: Point | null;
  mat: Rect | null;
}

export interface LeaderboardEntry {
  rank: number;
  id: number;
  name: string | null;
  liveCells: number;
}

export interface SessionMessage {
  type: "session";
  accountId: number | null;
  key?: string;
  keyRejected?: boolean;
}

// Always followed by a binary frame holding the board cells as a Uint16Array.
export interface StateMessage {
  type: "state";
  generation: number;
  width: number;
  height: number;
  mats: MatInfo[];
  walls: WallInfo[];
  you: PlayerStatus | null;
}

export interface LeaderboardMessage {
  type: "leaderboard";
  entries: LeaderboardEntry[];
  players: number;
  you: { rank: number; liveCells: number } | null;
}

export interface ResultMessage {
  type: "result";
  action: "join" | "place" | "removeCells" | "wall" | "name";
  ok: boolean;
  reason?: string;
}

export type ServerMessage =
  SessionMessage | StateMessage | LeaderboardMessage | ResultMessage;

export interface HelloMessage {
  type: "hello";
  key: string | null;
}

export interface JoinMessage {
  type: "join";
}

export interface PlaceMessage {
  type: "place";
  cells: [x: number, y: number][];
}

export interface RemoveCellsMessage {
  type: "removeCells";
}

export interface WallMessage extends Point {
  type: "wall";
  remove: boolean;
}

export interface NameMessage {
  type: "name";
  name: string;
}

export type ClientMessage =
  | HelloMessage
  | JoinMessage
  | PlaceMessage
  | RemoveCellsMessage
  | WallMessage
  | NameMessage;

export function sanitizePlayerName(raw: string): string | null {
  const cleaned = raw.replace(INVISIBLE, "").replace(BLANK, " ").trim();
  if (cleaned.length === 0) return null;
  return [...cleaned].length > MAX_PLAYER_NAME_LENGTH ? null : cleaned;
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;

  const message = data as Record<string, unknown>;
  switch (message.type) {
    case "hello":
      return parseHello(message.key);
    case "join":
      return { type: "join" };
    case "place":
      return parsePlace(message.cells);
    case "removeCells":
      return { type: "removeCells" };
    case "wall":
      return parseWall(message);
    case "name":
      return parseName(message.name);
    default:
      return null;
  }
}

function parseHello(key: unknown): HelloMessage | null {
  if (key === null) return { type: "hello", key };
  if (typeof key === "string" && key.length <= MAX_KEY_LENGTH) {
    return { type: "hello", key };
  }
  return null;
}

function parsePlace(cells: unknown): PlaceMessage | null {
  if (!Array.isArray(cells) || cells.length > MAX_CELLS_PER_PLACE) return null;
  const valid = cells.every(
    (cell) =>
      Array.isArray(cell) &&
      cell.length === 2 &&
      Number.isInteger(cell[0]) &&
      Number.isInteger(cell[1]),
  );
  return valid ? { type: "place", cells } : null;
}

function parseWall(message: Record<string, unknown>): WallMessage | null {
  const { x, y, remove } = message;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (typeof remove !== "boolean") return null;
  return { type: "wall", x: x as number, y: y as number, remove };
}

// Passes the name through unsanitized so the server can tell the player why a
// name was rejected rather than dropping the message.
function parseName(name: unknown): NameMessage | null {
  if (typeof name !== "string" || name.length > MAX_RAW_NAME_LENGTH) {
    return null;
  }
  return { type: "name", name };
}
