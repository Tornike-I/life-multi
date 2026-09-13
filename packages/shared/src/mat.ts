import { MAT_GAP, MAT_SPOT_STRIDE } from "./rules.ts";

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

export function mod(n: number, size: number): number {
  return ((n % size) + size) % size;
}

export function squareMat(
  home: Point,
  side: number,
  width: number,
  height: number,
): Rect {
  const half = Math.floor(side / 2);
  return {
    x: mod(home.x - half, width),
    y: mod(home.y - half, height),
    w: side,
    h: side,
  };
}

export function matContains(
  mat: Rect,
  point: Point,
  width: number,
  height: number,
): boolean {
  return (
    mod(point.x - mat.x, width) < mat.w && mod(point.y - mat.y, height) < mat.h
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
  return mod(b - a, size) < aLength || mod(a - b, size) < bLength;
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

export function growMat(
  home: Point,
  side: number,
  targetSide: number,
  others: readonly Rect[],
  width: number,
  height: number,
): number {
  const target = Math.min(targetSide, width, height);
  if (target <= side) return target;

  let grown = side;
  while (grown < target) {
    const next = squareMat(home, grown + 1, width, height);
    if (others.some((other) => matsTooClose(next, other, width, height))) {
      break;
    }
    grown++;
  }
  return grown;
}

function ringSegments(
  start: number,
  length: number,
  size: number,
): [number, number][] {
  if (length >= size) return [[0, size]];
  const from = mod(start, size);
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

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
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
  return {
    mat: best,
    home: { x: mod(best.x + half, width), y: mod(best.y + half, height) },
  };
}
