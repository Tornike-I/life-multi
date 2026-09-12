import { MAT_GAP, MAT_MAX_ASPECT, MAT_MIN_SIDE } from "./rules.ts";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.w &&
    point.y >= rect.y &&
    point.y < rect.y + rect.h
  );
}

function ringOverlap(
  a: number,
  aLength: number,
  b: number,
  bLength: number,
  size: number,
): boolean {
  if (aLength >= size || bLength >= size) return true;
  const mod = (n: number) => ((n % size) + size) % size;
  return mod(b - a) < aLength || mod(a - b) < bLength;
}

export function matsTooClose(
  a: Rect,
  b: Rect,
  width: number,
  height: number,
): boolean {
  return (
    ringOverlap(a.x - MAT_GAP, a.w + 2 * MAT_GAP, b.x, b.w, width) &&
    ringOverlap(a.y - MAT_GAP, a.h + 2 * MAT_GAP, b.y, b.h, height)
  );
}

export function validateMat(
  mat: Rect,
  home: Point,
  maxArea: number,
  others: readonly Rect[],
  width: number,
  height: number,
): string | null {
  const { x, y, w, h } = mat;
  if (![x, y, w, h].every(Number.isInteger)) {
    return "Mat edges must line up with squares.";
  }
  if (w < MAT_MIN_SIDE || h < MAT_MIN_SIDE) {
    return `Each side must be at least ${MAT_MIN_SIDE} squares.`;
  }
  if (x < 0 || y < 0 || x + w > width || y + h > height) {
    return "Mat must fit inside the board.";
  }
  if (Math.max(w, h) > MAT_MAX_ASPECT * Math.min(w, h)) {
    return `The long side can be at most ${MAT_MAX_ASPECT}× the short side.`;
  }
  if (w * h > maxArea) {
    return `Your mat can cover at most ${maxArea} squares.`;
  }
  if (!rectContains(mat, home)) {
    return "Mat must contain your home square.";
  }
  if (others.some((other) => matsTooClose(mat, other, width, height))) {
    return `Mat must stay ${MAT_GAP} squares away from other mats.`;
  }
  return null;
}

export function shrinkMat(mat: Rect, home: Point, maxArea: number): Rect {
  let { x, y, w, h } = mat;
  while (w * h > maxArea) {
    const shrinkWidth = h <= MAT_MIN_SIDE || (w >= h && w > MAT_MIN_SIDE);
    if (shrinkWidth) {
      if (w <= MAT_MIN_SIDE) break;
      if (home.x - x > x + w - 1 - home.x) x++;
      w--;
    } else {
      if (home.y - y > y + h - 1 - home.y) y++;
      h--;
    }
  }
  return { x, y, w, h };
}

function ringDistance(a: number, b: number, size: number): number {
  const d = Math.abs(a - b) % size;
  return Math.min(d, size - d);
}

function centerDistance(
  a: Rect,
  b: Rect,
  width: number,
  height: number,
): number {
  return Math.hypot(
    ringDistance(a.x + a.w / 2, b.x + b.w / 2, width),
    ringDistance(a.y + a.h / 2, b.y + b.h / 2, height),
  );
}

export function findMatSpot(
  others: readonly Rect[],
  side: number,
  width: number,
  height: number,
): { mat: Rect; home: Point } | null {
  const wholeBoard = { x: 0, y: 0, w: width, h: height };
  let best: Rect | null = null;
  let bestScore = -Infinity;

  for (let y = 0; y + side <= height; y++) {
    for (let x = 0; x + side <= width; x++) {
      const mat = { x, y, w: side, h: side };
      let score =
        others.length === 0
          ? -centerDistance(mat, wholeBoard, width, height)
          : Infinity;
      for (const other of others) {
        if (matsTooClose(mat, other, width, height)) {
          score = -Infinity;
          break;
        }
        score = Math.min(score, centerDistance(mat, other, width, height));
      }
      if (score > bestScore) {
        best = mat;
        bestScore = score;
      }
    }
  }

  if (!best) return null;
  const half = Math.floor(side / 2);
  return { mat: best, home: { x: best.x + half, y: best.y + half } };
}
