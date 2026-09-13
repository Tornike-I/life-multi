import {
  MAT_GAP,
  MAT_MAX_ASPECT,
  MAT_MIN_SIDE,
  MAT_SPOT_STRIDE,
} from "./rules.ts";

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

function ringSegments(
  start: number,
  length: number,
  size: number,
): [number, number][] {
  if (length >= size) return [[0, size]];
  const from = ((start % size) + size) % size;
  const to = from + length;
  return to <= size
    ? [[from, to]]
    : [
        [from, size],
        [0, to - size],
      ];
}

export function blockedMatPositions(
  others: readonly Rect[],
  side: number,
  width: number,
  height: number,
): Uint8Array {
  const stride = width + 1;
  const diff = new Int32Array(stride * (height + 1));
  for (const other of others) {
    const columns = ringSegments(
      other.x - side - MAT_GAP + 1,
      other.w + side + 2 * MAT_GAP - 1,
      width,
    );
    const rows = ringSegments(
      other.y - side - MAT_GAP + 1,
      other.h + side + 2 * MAT_GAP - 1,
      height,
    );
    for (const [x0, x1] of columns) {
      for (const [y0, y1] of rows) {
        diff[y0 * stride + x0]++;
        diff[y0 * stride + x1]--;
        diff[y1 * stride + x0]--;
        diff[y1 * stride + x1]++;
      }
    }
  }

  const blocked = new Uint8Array(width * height);
  const sums = new Int32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * stride + x;
      const left = x > 0 ? sums[i - 1] : 0;
      const up = y > 0 ? sums[i - stride] : 0;
      const diagonal = x > 0 && y > 0 ? sums[i - stride - 1] : 0;
      sums[i] = diff[i] + left + up - diagonal;
      blocked[y * width + x] = sums[i] > 0 ? 1 : 0;
    }
  }
  return blocked;
}

function bestSpot(
  blocked: Uint8Array,
  others: readonly Rect[],
  side: number,
  width: number,
  height: number,
  stride: number,
): Rect | null {
  const wholeBoard = { x: 0, y: 0, w: width, h: height };
  let best: Rect | null = null;
  let bestScore = -Infinity;

  for (let y = 0; y + side <= height; y += stride) {
    for (let x = 0; x + side <= width; x += stride) {
      if (blocked[y * width + x]) continue;
      const mat = { x, y, w: side, h: side };
      let score =
        others.length === 0
          ? -centerDistance(mat, wholeBoard, width, height)
          : Infinity;
      for (const other of others) {
        score = Math.min(score, centerDistance(mat, other, width, height));
      }
      if (score > bestScore) {
        best = mat;
        bestScore = score;
      }
    }
  }
  return best;
}

export function findMatSpot(
  others: readonly Rect[],
  side: number,
  width: number,
  height: number,
): { mat: Rect; home: Point } | null {
  const blocked = blockedMatPositions(others, side, width, height);
  const best =
    bestSpot(blocked, others, side, width, height, MAT_SPOT_STRIDE) ??
    bestSpot(blocked, others, side, width, height, 1);
  if (!best) return null;
  const half = Math.floor(side / 2);
  return { mat: best, home: { x: best.x + half, y: best.y + half } };
}
