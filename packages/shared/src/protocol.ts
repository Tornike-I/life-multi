export const MAX_CELLS_PER_PLACE = 256;

export interface StateMessage {
  type: "state";
  generation: number;
  width: number;
  height: number;
  cells: number[];
}

export type ServerMessage = StateMessage;

export interface PlaceMessage {
  type: "place";
  cells: [x: number, y: number][];
}

export type ClientMessage = PlaceMessage;

export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;

  const { type, cells } = data as Record<string, unknown>;
  if (
    type !== "place" ||
    !Array.isArray(cells) ||
    cells.length > MAX_CELLS_PER_PLACE
  ) {
    return null;
  }

  const valid = cells.every(
    (cell) =>
      Array.isArray(cell) &&
      cell.length === 2 &&
      Number.isInteger(cell[0]) &&
      Number.isInteger(cell[1]),
  );
  return valid ? { type, cells } : null;
}
