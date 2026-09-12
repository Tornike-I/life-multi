import type { Point, Rect } from "./mat.ts";

export const MAX_CELLS_PER_PLACE = 256;
export const MAX_KEY_LENGTH = 128;

export interface MatInfo extends Rect {
  id: number;
}

export interface PlayerStatus {
  id: number;
  inventory: number;
  inventoryCap: number;
  matArea: number;
  liveCells: number;
  home: Point | null;
  mat: Rect | null;
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
  you: PlayerStatus | null;
}

export interface ResultMessage {
  type: "result";
  action: "join" | "place" | "resize";
  ok: boolean;
  reason?: string;
}

export type ServerMessage = SessionMessage | StateMessage | ResultMessage;

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

export interface ResizeMessage {
  type: "resize";
  mat: Rect;
}

export type ClientMessage =
  HelloMessage | JoinMessage | PlaceMessage | ResizeMessage;

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
    case "resize":
      return parseResize(message.mat);
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

function parseResize(mat: unknown): ResizeMessage | null {
  if (typeof mat !== "object" || mat === null) return null;
  const { x, y, w, h } = mat as Record<string, unknown>;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof w !== "number" ||
    typeof h !== "number" ||
    ![x, y, w, h].every(Number.isInteger)
  ) {
    return null;
  }
  return { type: "resize", mat: { x, y, w, h } };
}
