import { ownExtent, type Rect, type StateMessage } from "@life-multi/shared";
import { type Camera, mod, type Viewport } from "./camera.ts";
import { colorFor } from "./render.ts";

export interface MinimapLayout {
  extent: Rect;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface MinimapView {
  state: StateMessage;
  cells: Uint16Array;
  accountId: number;
  camera: Camera;
  viewport: Viewport;
}

function nearestCopy(value: number, target: number, size: number): number {
  return value + size * Math.round((target - value) / size);
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  sizePx: number,
  dpr: number,
  view: MinimapView,
): MinimapLayout | null {
  const { state, cells, accountId, camera, viewport } = view;
  const { width, height } = state;
  const mat = state.you?.mat ?? null;
  const extent = ownExtent(cells, width, height, accountId, mat);
  if (!extent) return null;

  const scale = Math.min(sizePx / extent.w, sizePx / extent.h);
  const offsetX = (sizePx - extent.w * scale) / 2;
  const offsetY = (sizePx - extent.h * scale) / 2;
  const centerX = extent.x + extent.w / 2;
  const centerY = extent.y + extent.h / 2;
  const toX = (worldX: number) => offsetX + (worldX - extent.x) * scale;
  const toY = (worldY: number) => offsetY + (worldY - extent.y) * scale;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, sizePx, sizePx);
  ctx.fillStyle = "rgb(11 13 18 / 0.92)";
  ctx.fillRect(0, 0, sizePx, sizePx);
  ctx.fillStyle = "rgb(255 255 255 / 0.04)";
  ctx.fillRect(offsetX, offsetY, extent.w * scale, extent.h * scale);

  if (mat) {
    const x = nearestCopy(mat.x + mat.w / 2, centerX, width) - mat.w / 2;
    const y = nearestCopy(mat.y + mat.h / 2, centerY, height) - mat.h / 2;
    ctx.fillStyle = colorFor(accountId, 0.3);
    ctx.fillRect(toX(x), toY(y), mat.w * scale, mat.h * scale);
  }

  const dot = Math.max(scale, 1 / dpr);
  ctx.fillStyle = colorFor(accountId);
  for (let y = extent.y; y < extent.y + extent.h; y++) {
    const row = mod(y, height) * width;
    for (let x = extent.x; x < extent.x + extent.w; x++) {
      if (cells[row + mod(x, width)] === accountId) {
        ctx.fillRect(toX(x), toY(y), dot, dot);
      }
    }
  }

  const halfWidth = viewport.width / 2 / camera.zoom;
  const halfHeight = viewport.height / 2 / camera.zoom;
  const cameraX = nearestCopy(camera.x, centerX, width);
  const cameraY = nearestCopy(camera.y, centerY, height);
  ctx.strokeStyle = "rgb(255 255 255 / 0.8)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    toX(cameraX - halfWidth),
    toY(cameraY - halfHeight),
    2 * halfWidth * scale,
    2 * halfHeight * scale,
  );

  return { extent, scale, offsetX, offsetY };
}
