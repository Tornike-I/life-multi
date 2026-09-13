export const BOARD_SIZE = 512;
export const TICK_MS = 100;
// Account ids double as cell colors, which are stored in a Uint16Array.
export const MAX_ACCOUNTS = 65535;

export const MAT_GAP = 3;
export const MAT_MIN_SIDE = 4;
export const MAT_MAX_ASPECT = 3;
export const BASE_MAT_SIDE = 8;
export const MAT_AREA_PER_LIVE_CELL = 2;
export const MAT_SPOT_STRIDE = 8;

export const STARTING_INVENTORY = 12;
export const BASE_INVENTORY_CAP = 12;
export const INVENTORY_CAP_PER_LIVE_CELL = 0.1;
export const ACCRUAL_MS = 4000;

export const LIVE_SMOOTHING_DECAY = 0.995;

export const MAX_VIEW_SQUARES = 128;
export const DEFAULT_VIEW_SQUARES = 48;
export const MIN_VIEW_SQUARES = 12;
export const MINIMAP_PADDING = 16;
export const MINIMAP_MIN_SQUARES = 64;

export interface Allowance {
  matArea: number;
  inventoryCap: number;
}

export function allowanceFor(smoothedLive: number): Allowance {
  return {
    matArea: Math.floor(
      BASE_MAT_SIDE ** 2 + MAT_AREA_PER_LIVE_CELL * smoothedLive,
    ),
    inventoryCap: Math.floor(
      BASE_INVENTORY_CAP + INVENTORY_CAP_PER_LIVE_CELL * smoothedLive,
    ),
  };
}
