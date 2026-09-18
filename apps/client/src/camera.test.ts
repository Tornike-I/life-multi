import { MIN_VIEW_SQUARES, type Point } from "@life-multi/shared";
import { describe, expect, it } from "vitest";
import { type Camera, pinchBy, screenToWorld } from "./camera.ts";

const viewport = { width: 400, height: 800 };
const camera: Camera = { x: 100, y: 100, zoom: 20 };

describe("pinchBy", () => {
  it("keeps the point between the fingers under their midpoint", () => {
    const from: [Point, Point] = [
      { x: 150, y: 400 },
      { x: 250, y: 400 },
    ];
    const to: [Point, Point] = [
      { x: 100, y: 300 },
      { x: 260, y: 300 },
    ];
    const before = screenToWorld(camera, viewport, 200, 400);
    const after = screenToWorld(
      pinchBy(camera, viewport, from, to),
      viewport,
      180,
      300,
    );
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("zooms by how much the fingers spread", () => {
    const next = pinchBy(
      camera,
      viewport,
      [
        { x: 150, y: 400 },
        { x: 250, y: 400 },
      ],
      [
        { x: 100, y: 400 },
        { x: 300, y: 400 },
      ],
    );
    expect(next.zoom).toBeCloseTo(40);
  });

  it("only pans when the fingers keep their distance", () => {
    const next = pinchBy(
      camera,
      viewport,
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 130, y: 140 },
        { x: 230, y: 140 },
      ],
    );
    expect(next).toEqual({ x: 98.5, y: 98, zoom: 20 });
  });

  it("stops at the closest zoom", () => {
    const next = pinchBy(
      camera,
      viewport,
      [
        { x: 190, y: 400 },
        { x: 210, y: 400 },
      ],
      [
        { x: 0, y: 400 },
        { x: 400, y: 400 },
      ],
    );
    expect(next.zoom).toBeCloseTo(800 / MIN_VIEW_SQUARES);
  });
});
