import { DEAD, type Rect, type StateMessage } from "@life-multi/shared";
import { type Camera, mod } from "./camera.ts";

const GOLDEN_ANGLE_DEG = 137.508;
const BACKGROUND = "#0b0d12";
const CONFLICT = "#ef4444";
const GRID_MIN_ZOOM = 6;
const CELL_GAP_MIN_ZOOM = 5;

export interface View {
  state: StateMessage;
  cells: Uint16Array;
  accountId: number | null;
  staged: ReadonlySet<number>;
  resizePreview: { rect: Rect; valid: boolean } | null;
  camera: Camera;
  width: number;
  height: number;
  dpr: number;
}

const solidColors: string[] = [];

export function colorFor(id: number, alpha = 1): string {
  return `hsl(${(id * GOLDEN_ANGLE_DEG) % 360} 80% 60% / ${alpha})`;
}

function solidColor(id: number): string {
  return (solidColors[id] ??= colorFor(id));
}

function copies(
  start: number,
  length: number,
  viewStart: number,
  viewEnd: number,
  size: number,
): number[] {
  const starts: number[] = [];
  const first = Math.floor((viewStart - length - start) / size) + 1;
  const last = Math.ceil((viewEnd - start) / size) - 1;
  for (let k = first; k <= last; k++) starts.push(start + k * size);
  return starts;
}

function strokeGrid(ctx: CanvasRenderingContext2D, rect: Rect): void {
  ctx.beginPath();
  for (let i = 1; i < rect.w; i++) {
    ctx.moveTo(rect.x + i, rect.y);
    ctx.lineTo(rect.x + i, rect.y + rect.h);
  }
  for (let j = 1; j < rect.h; j++) {
    ctx.moveTo(rect.x, rect.y + j);
    ctx.lineTo(rect.x + rect.w, rect.y + j);
  }
  ctx.stroke();
}

export function draw(ctx: CanvasRenderingContext2D, view: View): void {
  const { state, cells, accountId, staged, resizePreview, camera, dpr } = view;
  const { width, height } = state;
  const { zoom } = camera;
  const left = camera.x - view.width / 2 / zoom;
  const top = camera.y - view.height / 2 / zoom;
  const right = left + view.width / zoom;
  const bottom = top + view.height / zoom;
  const scale = zoom * dpr;
  const pixel = 1 / zoom;
  const inset = zoom >= CELL_GAP_MIN_ZOOM ? pixel : 0;

  const outlineSquare = (x: number, y: number, margin: number) => {
    const size = Math.max(pixel, 1 - 2 * margin);
    ctx.strokeRect(x + (1 - size) / 2, y + (1 - size) / 2, size, size);
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);

  ctx.strokeStyle = "rgb(255 255 255 / 0.12)";
  ctx.lineWidth = pixel;
  ctx.beginPath();
  for (let k = Math.ceil(left / width); k * width <= right; k++) {
    ctx.moveTo(k * width, top);
    ctx.lineTo(k * width, bottom);
  }
  for (let k = Math.ceil(top / height); k * height <= bottom; k++) {
    ctx.moveTo(left, k * height);
    ctx.lineTo(right, k * height);
  }
  ctx.stroke();

  for (const mat of state.mats) {
    const own = mat.id === accountId;
    for (const x of copies(mat.x, mat.w, left, right, width)) {
      for (const y of copies(mat.y, mat.h, top, bottom, height)) {
        ctx.fillStyle = colorFor(mat.id, own ? 0.16 : 0.08);
        ctx.fillRect(x, y, mat.w, mat.h);
        if (zoom >= GRID_MIN_ZOOM) {
          ctx.strokeStyle = colorFor(mat.id, own ? 0.35 : 0.18);
          ctx.lineWidth = 1 / scale;
          strokeGrid(ctx, { x, y, w: mat.w, h: mat.h });
        }
        ctx.strokeStyle = colorFor(mat.id, own ? 0.9 : 0.45);
        ctx.lineWidth = (own ? 2 : 1) * pixel;
        ctx.strokeRect(x, y, mat.w, mat.h);
      }
    }
  }

  const home = state.you?.home;
  if (home) {
    ctx.strokeStyle = "rgb(255 255 255 / 0.6)";
    ctx.lineWidth = pixel;
    for (const x of copies(home.x, 1, left, right, width)) {
      for (const y of copies(home.y, 1, top, bottom, height)) {
        outlineSquare(x, y, 2 * pixel);
      }
    }
  }

  const x0 = Math.floor(left);
  const x1 = Math.ceil(right);
  const y0 = Math.floor(top);
  const y1 = Math.ceil(bottom);
  const cellSize = 1 - 2 * inset;
  for (let y = y0; y < y1; y++) {
    const row = mod(y, height) * width;
    for (let x = x0; x < x1; x++) {
      const color = cells[row + mod(x, width)];
      if (color === DEAD) continue;
      ctx.fillStyle = solidColor(color);
      ctx.fillRect(x + inset, y + inset, cellSize, cellSize);
    }
  }

  if (accountId !== null) {
    ctx.lineWidth = 2 * pixel;
    for (const index of staged) {
      ctx.strokeStyle =
        cells[index] === DEAD ? solidColor(accountId) : CONFLICT;
      const bx = index % width;
      const by = Math.floor(index / width);
      for (const x of copies(bx, 1, left, right, width)) {
        for (const y of copies(by, 1, top, bottom, height)) {
          outlineSquare(x, y, pixel);
        }
      }
    }
  }

  if (resizePreview) {
    const { rect, valid } = resizePreview;
    ctx.setLineDash([6 * pixel, 4 * pixel]);
    ctx.strokeStyle = valid ? "#e5e7eb" : CONFLICT;
    ctx.lineWidth = 2 * pixel;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.setLineDash([]);
  }
}
