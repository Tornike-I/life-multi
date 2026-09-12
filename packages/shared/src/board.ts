export interface Board {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
}

export function createBoard(width: number, height: number): Board {
  return { width, height, cells: new Uint8Array(width * height) };
}

export function randomBoard(
  width: number,
  height: number,
  density: number,
  random: () => number = Math.random,
): Board {
  const board = createBoard(width, height);
  for (let i = 0; i < board.cells.length; i++) {
    board.cells[i] = random() < density ? 1 : 0;
  }
  return board;
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

export function step(board: Board): Board {
  const { width, height, cells } = board;
  const next = new Uint8Array(cells.length);

  for (let y = 0; y < height; y++) {
    const up = ((y - 1 + height) % height) * width;
    const row = y * width;
    const down = ((y + 1) % height) * width;

    for (let x = 0; x < width; x++) {
      const left = (x - 1 + width) % width;
      const right = (x + 1) % width;
      const neighbors =
        cells[up + left] +
        cells[up + x] +
        cells[up + right] +
        cells[row + left] +
        cells[row + right] +
        cells[down + left] +
        cells[down + x] +
        cells[down + right];
      const alive = cells[row + x] === 1;
      next[row + x] = neighbors === 3 || (alive && neighbors === 2) ? 1 : 0;
    }
  }

  return { width, height, cells: next };
}
