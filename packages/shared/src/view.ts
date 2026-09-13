import type { Rect } from "./mat.ts";
import {
  MINIMAP_HISTORY_TICKS,
  MINIMAP_MIN_SQUARES,
  MINIMAP_PADDING,
} from "./rules.ts";

export interface Span {
  start: number;
  length: number;
}

export interface Lines {
  columns: Uint8Array;
  rows: Uint8Array;
}

export function ringSpan(
  occupied: ArrayLike<number>,
  size: number,
): Span | null {
  let first = -1;
  for (let i = 0; i < size; i++) {
    if (occupied[i]) {
      first = i;
      break;
    }
  }
  if (first === -1) return null;

  let gapStart = 0;
  let gapLength = 0;
  let runStart = 0;
  let runLength = 0;
  for (let k = 1; k <= size; k++) {
    const i = (first + k) % size;
    if (occupied[i]) {
      if (runLength > gapLength) {
        gapStart = runStart;
        gapLength = runLength;
      }
      runLength = 0;
    } else {
      if (runLength === 0) runStart = i;
      runLength++;
    }
  }

  if (gapLength === 0) return { start: 0, length: size };
  return { start: (gapStart + gapLength) % size, length: size - gapLength };
}

function padSpan(span: Span, size: number): [start: number, length: number] {
  const length = Math.min(
    size,
    Math.max(MINIMAP_MIN_SQUARES, span.length + 2 * MINIMAP_PADDING),
  );
  return [Math.floor(span.start + (span.length - length) / 2), length];
}

export function ownLines(
  cells: ArrayLike<number>,
  width: number,
  height: number,
  color: number,
  mat: Rect | null,
): Lines {
  const columns = new Uint8Array(width);
  const rows = new Uint8Array(height);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== color) continue;
    columns[i % width] = 1;
    rows[Math.floor(i / width)] = 1;
  }
  if (mat) {
    for (let i = 0; i < mat.w; i++) columns[(mat.x + i) % width] = 1;
    for (let j = 0; j < mat.h; j++) rows[(mat.y + j) % height] = 1;
  }
  return { columns, rows };
}

export function recordLines(history: Lines[], lines: Lines): void {
  history.push(lines);
  if (history.length > MINIMAP_HISTORY_TICKS) history.shift();
}

export function mergeLines(history: readonly Lines[]): Lines | null {
  if (history.length === 0) return null;
  const columns = new Uint8Array(history[0].columns.length);
  const rows = new Uint8Array(history[0].rows.length);
  for (const lines of history) {
    for (let i = 0; i < columns.length; i++) columns[i] |= lines.columns[i];
    for (let j = 0; j < rows.length; j++) rows[j] |= lines.rows[j];
  }
  return { columns, rows };
}

export function extentFromLines(lines: Lines): Rect | null {
  const width = lines.columns.length;
  const height = lines.rows.length;
  const columnSpan = ringSpan(lines.columns, width);
  const rowSpan = ringSpan(lines.rows, height);
  if (!columnSpan || !rowSpan) return null;

  const [x, w] = padSpan(columnSpan, width);
  const [y, h] = padSpan(rowSpan, height);
  return { x, y, w, h };
}

export function ownExtent(
  cells: ArrayLike<number>,
  width: number,
  height: number,
  color: number,
  mat: Rect | null,
): Rect | null {
  return extentFromLines(ownLines(cells, width, height, color, mat));
}
