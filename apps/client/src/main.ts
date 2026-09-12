import {
  type ClientMessage,
  DEAD,
  type Point,
  type Rect,
  rectContains,
  type ResultMessage,
  type ServerMessage,
  type StateMessage,
  validateMat,
} from "@life-multi/shared";
import { colorFor, draw } from "./render.ts";
import "./style.css";

const KEY_STORAGE = "life-multi:key";
const SUCCESS_TEXT: Record<ResultMessage["action"], string> = {
  join: "You have a mat. Select empty squares on it, then press Place.",
  place: "Placed.",
  resize: "Mat resized.",
};

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const canvas = element<HTMLCanvasElement>("board");
const ctx = canvas.getContext("2d")!;
const youEl = element("you");
const statusEl = element("status");
const generationEl = element("generation");
const joinButton = element<HTMLButtonElement>("join");
const playerEl = element("player");
const inventoryEl = element("inventory");
const matSizeEl = element("mat-size");
const aliveEl = element("alive");
const placeButton = element<HTMLButtonElement>("place");
const clearButton = element<HTMLButtonElement>("clear");
const resizeButton = element<HTMLButtonElement>("resize");
const messageEl = element("message");

type Drag =
  { kind: "paint"; add: boolean } | { kind: "resize"; from: Point; to: Point };

let socket: WebSocket;
let memoryKey: string | null = null;
let accountId: number | null = null;
let state: StateMessage | null = null;
let cells: Uint16Array | null = null;
let staged = new Set<number>();
let lastCommit = new Set<number>();
let resizing = false;
let drag: Drag | null = null;

function loadKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? memoryKey;
  } catch {
    return memoryKey;
  }
}

function saveKey(key: string | null): void {
  memoryKey = key;
  try {
    if (key === null) localStorage.removeItem(KEY_STORAGE);
    else localStorage.setItem(KEY_STORAGE, key);
  } catch {
    return;
  }
}

function send(message: ClientMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);
  socket.binaryType = "arraybuffer";

  socket.addEventListener("open", () => {
    statusEl.textContent = "connected";
    send({ type: "hello", key: loadKey() });
  });
  socket.addEventListener("close", () => {
    accountId = null;
    state = null;
    statusEl.textContent = "disconnected, retrying…";
    updateHud();
    setTimeout(connect, 1000);
  });
  socket.addEventListener("message", (event) => {
    if (event.data instanceof ArrayBuffer) {
      cells = new Uint16Array(event.data);
      render();
      return;
    }
    handle(JSON.parse(event.data as string) as ServerMessage);
  });
}

function handle(message: ServerMessage): void {
  switch (message.type) {
    case "session":
      accountId = message.accountId;
      if (message.key) saveKey(message.key);
      if (message.keyRejected) saveKey(null);
      break;
    case "state":
      state = message;
      pruneStaged();
      break;
    case "result":
      if (message.ok) {
        messageEl.textContent = SUCCESS_TEXT[message.action];
      } else {
        messageEl.textContent = message.reason ?? "That didn't work.";
        if (message.action === "place") {
          for (const index of lastCommit) staged.add(index);
        }
      }
      break;
  }
  updateHud();
}

function pruneStaged(): void {
  const mat = state?.you?.mat;
  for (const index of staged) {
    const square = state && {
      x: index % state.width,
      y: Math.floor(index / state.width),
    };
    if (!mat || !square || !rectContains(mat, square)) staged.delete(index);
  }
}

function updateHud(): void {
  const you = state?.you ?? null;
  const mat = you?.mat ?? null;

  youEl.textContent =
    accountId === null ? "spectating" : `■ player ${accountId}`;
  youEl.style.color = accountId === null ? "" : colorFor(accountId);
  generationEl.textContent = state ? `generation ${state.generation}` : "";
  joinButton.hidden = !state || mat !== null;
  joinButton.textContent =
    accountId === null ? "Join the game" : "Claim a new spot";
  playerEl.hidden = !you || !mat;
  if (!you || !mat) return;

  const board = cells;
  const blocked =
    board !== null && [...staged].some((index) => board[index] !== DEAD);
  inventoryEl.textContent = `cells ${you.inventory}/${you.inventoryCap}`;
  matSizeEl.textContent = `mat ${mat.w * mat.h}/${you.matArea}`;
  aliveEl.textContent = `alive ${you.liveCells}`;
  placeButton.textContent = `Place ${staged.size}`;
  placeButton.disabled =
    staged.size === 0 || staged.size > you.inventory || blocked;
  resizeButton.textContent = resizing ? "Cancel resize" : "Resize mat";
}

function resizeProblem(rect: Rect): string | null {
  const home = state?.you?.home;
  if (!state || !home) return "You don't have a mat yet.";
  return validateMat(
    rect,
    home,
    state.you!.matArea,
    state.mats.filter((mat) => mat.id !== accountId),
    state.width,
    state.height,
  );
}

function rectBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x) + 1,
    h: Math.abs(a.y - b.y) + 1,
  };
}

function render(): void {
  if (!state || !cells) return;
  const rect = drag?.kind === "resize" ? rectBetween(drag.from, drag.to) : null;
  draw(ctx, {
    state,
    cells,
    accountId,
    staged,
    resizePreview: rect && { rect, valid: resizeProblem(rect) === null },
  });
}

function refresh(): void {
  render();
  updateHud();
}

function squareAt(event: PointerEvent): Point | null {
  if (!state) return null;
  const bounds = canvas.getBoundingClientRect();
  const clamp = (fraction: number, size: number) =>
    Math.min(size - 1, Math.max(0, Math.floor(fraction * size)));
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width, state.width),
    y: clamp((event.clientY - bounds.top) / bounds.height, state.height),
  };
}

function paint(square: Point): void {
  const mat = state?.you?.mat;
  if (!state || !mat || drag?.kind !== "paint") return;
  if (!rectContains(mat, square)) return;
  const index = square.y * state.width + square.x;
  if (drag.add) staged.add(index);
  else staged.delete(index);
}

function commit(): void {
  if (!state || placeButton.disabled || playerEl.hidden) return;
  const { width } = state;
  send({
    type: "place",
    cells: [...staged].map((index): [number, number] => [
      index % width,
      Math.floor(index / width),
    ]),
  });
  lastCommit = staged;
  staged = new Set();
  refresh();
}

canvas.addEventListener("pointerdown", (event) => {
  const mat = state?.you?.mat;
  const square = squareAt(event);
  if (!state || !mat || !square) return;

  if (resizing) {
    drag = { kind: "resize", from: square, to: square };
  } else {
    if (!rectContains(mat, square)) return;
    drag = {
      kind: "paint",
      add: !staged.has(square.y * state.width + square.x),
    };
    paint(square);
  }
  canvas.setPointerCapture(event.pointerId);
  refresh();
});

canvas.addEventListener("pointermove", (event) => {
  const square = squareAt(event);
  if (!drag || !square) return;
  if (drag.kind === "resize") drag.to = square;
  else paint(square);
  refresh();
});

canvas.addEventListener("pointerup", () => {
  if (drag?.kind === "resize") {
    const rect = rectBetween(drag.from, drag.to);
    const problem = resizeProblem(rect);
    if (problem) messageEl.textContent = problem;
    else send({ type: "resize", mat: rect });
    resizing = false;
  }
  drag = null;
  refresh();
});

canvas.addEventListener("pointercancel", () => {
  drag = null;
  refresh();
});

joinButton.addEventListener("click", () => send({ type: "join" }));
placeButton.addEventListener("click", commit);

clearButton.addEventListener("click", () => {
  staged.clear();
  refresh();
});

resizeButton.addEventListener("click", () => {
  resizing = !resizing;
  messageEl.textContent = resizing
    ? "Drag a rectangle that contains your home square."
    : "";
  refresh();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Enter") commit();
  if (event.key === "Escape") {
    staged.clear();
    resizing = false;
    drag = null;
    refresh();
  }
});

connect();
