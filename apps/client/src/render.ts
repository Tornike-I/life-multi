import { DEAD, type Rect, type StateMessage } from "@life-multi/shared";

const CELL_PX = 8;
const GOLDEN_ANGLE_DEG = 137.508;
const BACKGROUND = "#0b0d12";
const CONFLICT = "#ef4444";

export interface View {
  state: StateMessage;
  cells: Uint16Array;
  accountId: number | null;
  staged: ReadonlySet<number>;
  resizePreview: { rect: Rect; valid: boolean } | null;
}

const solidColors: string[] = [];

export function colorFor(id: number, alpha = 1): string {
  return `hsl(${(id * GOLDEN_ANGLE_DEG) % 360} 80% 60% / ${alpha})`;
}

function solidColor(id: number): string {
  return (solidColors[id] ??= colorFor(id));
}

function strokeRect(ctx: CanvasRenderingContext2D, rect: Rect): void {
  ctx.strokeRect(
    rect.x * CELL_PX + 1,
    rect.y * CELL_PX + 1,
    rect.w * CELL_PX - 2,
    rect.h * CELL_PX - 2,
  );
}

export function draw(ctx: CanvasRenderingContext2D, view: View): void {
  const { state, cells, accountId, staged, resizePreview } = view;
  const { width, height } = state;
  const { canvas } = ctx;
  if (canvas.width !== width * CELL_PX || canvas.height !== height * CELL_PX) {
    canvas.width = width * CELL_PX;
    canvas.height = height * CELL_PX;
  }

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const mat of state.mats) {
    const own = mat.id === accountId;
    ctx.fillStyle = colorFor(mat.id, own ? 0.16 : 0.08);
    ctx.fillRect(
      mat.x * CELL_PX,
      mat.y * CELL_PX,
      mat.w * CELL_PX,
      mat.h * CELL_PX,
    );
    ctx.strokeStyle = colorFor(mat.id, own ? 0.9 : 0.4);
    ctx.lineWidth = own ? 2 : 1;
    strokeRect(ctx, mat);
  }

  const home = state.you?.home;
  if (home) {
    ctx.strokeStyle = "rgb(255 255 255 / 0.6)";
    ctx.lineWidth = 1;
    strokeRect(ctx, { ...home, w: 1, h: 1 });
  }

  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === DEAD) continue;
    ctx.fillStyle = solidColor(cells[i]);
    ctx.fillRect(
      (i % width) * CELL_PX + 1,
      Math.floor(i / width) * CELL_PX + 1,
      CELL_PX - 2,
      CELL_PX - 2,
    );
  }

  if (accountId !== null) {
    ctx.lineWidth = 2;
    for (const i of staged) {
      ctx.strokeStyle = cells[i] === DEAD ? solidColor(accountId) : CONFLICT;
      strokeRect(ctx, { x: i % width, y: Math.floor(i / width), w: 1, h: 1 });
    }
  }

  if (resizePreview) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = resizePreview.valid ? "#e5e7eb" : CONFLICT;
    ctx.lineWidth = 2;
    strokeRect(ctx, resizePreview.rect);
    ctx.setLineDash([]);
  }
}
