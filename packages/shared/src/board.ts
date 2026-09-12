export const DEAD = 0;

export interface Board {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint16Array;
}

export function createBoard(width: number, height: number): Board {
  return { width, height, cells: new Uint16Array(width * height) };
}

function indexOf(board: Board, x: number, y: number): number {
  const wx = ((x % board.width) + board.width) % board.width;
  const wy = ((y % board.height) + board.height) % board.height;
  return wy * board.width + wx;
}

export function getCell(board: Board, x: number, y: number): number {
  return board.cells[indexOf(board, x, y)];
}

export function setCell(
  board: Board,
  x: number,
  y: number,
  value: number,
): void {
  board.cells[indexOf(board, x, y)] = value;
}

function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function birthColor(
  a: number,
  b: number,
  c: number,
  seed: number,
  generation: number,
  index: number,
): number {
  if (a === b || a === c) return a;
  if (b === c) return b;
  // Hashed rather than Math.random so a generation is reproducible from (seed, generation).
  const pick = mix(mix(mix(seed) ^ generation) ^ index) % 3;
  return pick === 0 ? a : pick === 1 ? b : c;
}

export function step(board: Board, generation: number, seed = 0): Board {
  const { width, height, cells } = board;
  const next = new Uint16Array(cells.length);
  const neighbors = new Int32Array(8);

  for (let y = 0; y < height; y++) {
    const up = ((y - 1 + height) % height) * width;
    const row = y * width;
    const down = ((y + 1) % height) * width;

    for (let x = 0; x < width; x++) {
      const left = (x - 1 + width) % width;
      const right = (x + 1) % width;
      neighbors[0] = up + left;
      neighbors[1] = up + x;
      neighbors[2] = up + right;
      neighbors[3] = row + left;
      neighbors[4] = row + right;
      neighbors[5] = down + left;
      neighbors[6] = down + x;
      neighbors[7] = down + right;

      let count = 0;
      let a = DEAD;
      let b = DEAD;
      let c = DEAD;
      for (let k = 0; k < 8; k++) {
        const color = cells[neighbors[k]];
        if (color === DEAD) continue;
        count++;
        if (count === 1) a = color;
        else if (count === 2) b = color;
        else if (count === 3) c = color;
        else break;
      }

      const i = row + x;
      if (cells[i] !== DEAD) {
        if (count === 2 || count === 3) next[i] = cells[i];
      } else if (count === 3) {
        next[i] = birthColor(a, b, c, seed, generation, i);
      }
    }
  }

  return { width, height, cells: next };
}
