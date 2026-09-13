import {
  DEFAULT_VIEW_SQUARES,
  MAX_VIEW_SQUARES,
  MIN_VIEW_SQUARES,
  type Point,
} from "@life-multi/shared";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export function mod(n: number, size: number): number {
  return ((n % size) + size) % size;
}

function longestSide(viewport: Viewport): number {
  return Math.max(viewport.width, viewport.height, 1);
}

export function defaultZoom(viewport: Viewport): number {
  return longestSide(viewport) / DEFAULT_VIEW_SQUARES;
}

export function clampZoom(zoom: number, viewport: Viewport): number {
  const longest = longestSide(viewport);
  return Math.min(
    longest / MIN_VIEW_SQUARES,
    Math.max(longest / MAX_VIEW_SQUARES, zoom),
  );
}

export function screenToWorld(
  camera: Camera,
  viewport: Viewport,
  screenX: number,
  screenY: number,
): Point {
  return {
    x: camera.x + (screenX - viewport.width / 2) / camera.zoom,
    y: camera.y + (screenY - viewport.height / 2) / camera.zoom,
  };
}

export function zoomAt(
  camera: Camera,
  viewport: Viewport,
  screenX: number,
  screenY: number,
  factor: number,
): Camera {
  const anchor = screenToWorld(camera, viewport, screenX, screenY);
  const zoom = clampZoom(camera.zoom * factor, viewport);
  return {
    zoom,
    x: anchor.x - (screenX - viewport.width / 2) / zoom,
    y: anchor.y - (screenY - viewport.height / 2) / zoom,
  };
}

export function dragBy(camera: Camera, dx: number, dy: number): Camera {
  return {
    ...camera,
    x: camera.x - dx / camera.zoom,
    y: camera.y - dy / camera.zoom,
  };
}
