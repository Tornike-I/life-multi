export const BOARD_SIZE = 512;
export const TICK_MS = 100;
// Account ids double as cell colors, which are stored in a Uint16Array.
export const MAX_ACCOUNTS = 65535;

export const MAT_GAP = 3;
export const BASE_MAT_SIDE = 8;
export const MAT_AREA_PER_LIVE_CELL = 2;
export const MAT_SPOT_STRIDE = 8;

export const STARTING_INVENTORY = 12;
export const BASE_INVENTORY_CAP = 12;
export const INVENTORY_CAP_PER_LIVE_CELL = 0.1;
export const ACCRUAL_MS = 4000;

export const LIVE_SMOOTHING_DECAY = 0.995;
export const LIVE_PEAK_TICKS = 30;

export const MAX_VIEW_SQUARES = 128;
export const DEFAULT_VIEW_SQUARES = 48;
export const TOUCH_VIEW_SQUARES = 24;
export const MIN_VIEW_SQUARES = 12;
export const MINIMAP_PADDING = 16;
export const MINIMAP_MIN_SQUARES = 64;
export const MINIMAP_HISTORY_TICKS = 50;

export interface Allowance {
  matArea: number;
  inventoryCap: number;
}

function exactMatArea(smoothedLive: number): number {
  return BASE_MAT_SIDE ** 2 + MAT_AREA_PER_LIVE_CELL * smoothedLive;
}

export function allowanceFor(smoothedLive: number): Allowance {
  return {
    matArea: Math.floor(exactMatArea(smoothedLive)),
    inventoryCap: Math.floor(
      BASE_INVENTORY_CAP + INVENTORY_CAP_PER_LIVE_CELL * smoothedLive,
    ),
  };
}

export function matSideFor(smoothedLive: number): number {
  return Math.floor(Math.sqrt(allowanceFor(smoothedLive).matArea));
}

export function matGrowthProgress(smoothedLive: number, side: number): number {
  const progress = (exactMatArea(smoothedLive) - side * side) / (2 * side + 1);
  return Math.min(1, Math.max(0, progress));
}

export function inventoryProgress(inventory: number, cap: number): number {
  return inventory >= cap ? 1 : inventory - Math.floor(inventory);
}

export function recordLive(recent: number[], liveCells: number): number {
  recent.push(liveCells);
  if (recent.length > LIVE_PEAK_TICKS) recent.shift();
  return Math.max(...recent);
}

export function smoothLive(previous: number, recentPeak: number): number {
  return Math.max(recentPeak, previous * LIVE_SMOOTHING_DECAY);
}
