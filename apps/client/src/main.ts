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
import { bounds, type Cell, flip, rotate } from "./blueprints.ts";
import {
  type Camera,
  clampZoom,
  defaultZoom,
  dragBy,
  mod,
  screenToWorld,
  type Viewport,
  zoomAt,
} from "./camera.ts";
import { type ChosenBlueprint, createLibrary } from "./library.ts";
import { drawMinimap, type MinimapLayout } from "./minimap.ts";
import { colorFor, draw, type StampSquare } from "./render.ts";
import "./style.css";

const KEY_STORAGE = "life-multi:key";
const MINIMAP_PX = 180;
const PAN_STEP_PX = 80;
const WHEEL_ZOOM_SPEED = 0.0015;
const KEY_ZOOM_FACTOR = 1.25;
const PAN_KEYS: Record<string, [number, number]> = {
  arrowleft: [-1, 0],
  a: [-1, 0],
  arrowright: [1, 0],
  d: [1, 0],
  arrowup: [0, -1],
  w: [0, -1],
  arrowdown: [0, 1],
  s: [0, 1],
};
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
const minimap = element<HTMLCanvasElement>("minimap");
const minimapCtx = minimap.getContext("2d")!;
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
const homeButton = element<HTMLButtonElement>("home");
const blueprintsButton = element<HTMLButtonElement>("blueprints-open");
const messageEl = element("message");

type Drag =
  | { kind: "paint"; add: boolean }
  | { kind: "resize"; from: Point; to: Point }
  | { kind: "pan"; lastX: number; lastY: number };

let socket: WebSocket;
let memoryKey: string | null = null;
let accountId: number | null = null;
let state: StateMessage | null = null;
let cells: Uint16Array | null = null;
let staged = new Set<number>();
let lastCommit = new Set<number>();
let resizing = false;
let drag: Drag | null = null;
let viewport: Viewport = { width: 1, height: 1 };
let camera: Camera | null = null;
let followMat = true;
let minimapLayout: MinimapLayout | null = null;
let renderQueued = false;
let stamp: ChosenBlueprint | null = null;
let hover: Point | null = null;

const library = createLibrary(
  () => (accountId === null ? "#e5e7eb" : colorFor(accountId)),
  startStamping,
);

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
      scheduleRender();
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
      if (!camera) {
        measureViewport();
        camera = {
          x: message.width / 2,
          y: message.height / 2,
          zoom: defaultZoom(viewport),
        };
      }
      if (!message.you?.mat) {
        followMat = true;
        stopStamping();
      } else if (followMat) {
        followMat = false;
        centerOnMat();
      }
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

function centerOnMat(): void {
  const mat = state?.you?.mat;
  if (!mat) return;
  camera = {
    x: mat.x + mat.w / 2,
    y: mat.y + mat.h / 2,
    zoom: clampZoom(defaultZoom(viewport), viewport),
  };
  scheduleRender();
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

function toBoardRect(rect: Rect, board: StateMessage): Rect {
  return {
    x: mod(rect.x, board.width),
    y: mod(rect.y, board.height),
    w: rect.w,
    h: rect.h,
  };
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

function stampSquares(): StampSquare[] | null {
  if (!stamp || !hover || !state || !cells) return null;
  const board = state;
  const current = cells;
  const mat = board.you?.mat;
  const { w, h } = bounds(stamp.cells);
  const originX = hover.x - Math.floor(w / 2);
  const originY = hover.y - Math.floor(h / 2);
  return stamp.cells.map(([dx, dy]) => {
    const x = originX + dx;
    const y = originY + dy;
    const square = boardSquare({ x, y }, board);
    const index = square.y * board.width + square.x;
    const ok =
      mat !== undefined &&
      mat !== null &&
      rectContains(mat, square) &&
      current[index] === DEAD;
    return { x, y, index, ok };
  });
}

function stampHint(): string {
  if (!stamp) return "";
  const inventory = state?.you?.inventory ?? 0;
  return `${stamp.name}: ${stamp.cells.length} cells (you have ${inventory}). Click to select it, R rotate, F flip, Esc to stop.`;
}

function startStamping(blueprint: ChosenBlueprint): void {
  stamp = blueprint;
  resizing = false;
  messageEl.textContent = stampHint();
  refresh();
}

function stopStamping(): void {
  if (!stamp) return;
  stamp = null;
  hover = null;
  messageEl.textContent = "";
}

function transformStamp(change: (cells: readonly Cell[]) => Cell[]): void {
  if (!stamp) return;
  stamp = { ...stamp, cells: change(stamp.cells) };
  scheduleRender();
}

function stampHere(): void {
  const squares = stampSquares();
  if (!squares) return;
  if (!squares.every((square) => square.ok)) {
    messageEl.textContent = `${stamp!.name} has to fit on empty squares of your mat.`;
    return;
  }
  for (const { index } of squares) staged.add(index);
  messageEl.textContent = `Selected ${stamp!.name}. Press Place, or click to select another.`;
  refresh();
}

function scheduleRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function render(): void {
  if (!state || !cells || !camera) return;
  const board = state;
  const dpr = window.devicePixelRatio || 1;
  const rect = drag?.kind === "resize" ? rectBetween(drag.from, drag.to) : null;
  draw(ctx, {
    state,
    cells,
    accountId,
    staged,
    camera,
    dpr,
    width: viewport.width,
    height: viewport.height,
    resizePreview: rect && {
      rect,
      valid: resizeProblem(toBoardRect(rect, board)) === null,
    },
    stampPreview: stampSquares(),
  });

  if (accountId === null) {
    minimapLayout = null;
  } else {
    const backing = Math.round(MINIMAP_PX * dpr);
    if (minimap.width !== backing) {
      minimap.width = backing;
      minimap.height = backing;
    }
    minimapLayout = drawMinimap(minimapCtx, MINIMAP_PX, dpr, {
      state,
      cells,
      accountId,
      camera,
      viewport,
    });
  }
  minimap.hidden = minimapLayout === null;
}

function refresh(): void {
  scheduleRender();
  updateHud();
}

function measureViewport(): void {
  const dpr = window.devicePixelRatio || 1;
  viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
  canvas.width = Math.max(1, Math.round(viewport.width * dpr));
  canvas.height = Math.max(1, Math.round(viewport.height * dpr));
  if (camera) camera = { ...camera, zoom: clampZoom(camera.zoom, viewport) };
  scheduleRender();
}

function worldSquareAt(event: MouseEvent): Point | null {
  if (!camera) return null;
  const bounds = canvas.getBoundingClientRect();
  const point = screenToWorld(
    camera,
    viewport,
    event.clientX - bounds.left,
    event.clientY - bounds.top,
  );
  return { x: Math.floor(point.x), y: Math.floor(point.y) };
}

function boardSquare(world: Point, board: StateMessage): Point {
  return { x: mod(world.x, board.width), y: mod(world.y, board.height) };
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

new ResizeObserver(measureViewport).observe(canvas);

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

canvas.addEventListener("mousedown", (event) => {
  if (event.button === 1) event.preventDefault();
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button === 1 || event.button === 2) {
    drag = { kind: "pan", lastX: event.clientX, lastY: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  const mat = state?.you?.mat;
  const world = worldSquareAt(event);
  if (!state || !mat || !world || event.button !== 0) return;

  if (stamp) {
    hover = world;
    stampHere();
    return;
  }

  if (resizing) {
    drag = { kind: "resize", from: world, to: world };
  } else {
    const square = boardSquare(world, state);
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
  if (stamp) {
    hover = worldSquareAt(event);
    scheduleRender();
  }
  if (!drag) return;
  if (drag.kind === "pan") {
    if (camera) {
      camera = dragBy(
        camera,
        event.clientX - drag.lastX,
        event.clientY - drag.lastY,
      );
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    scheduleRender();
    return;
  }

  const world = worldSquareAt(event);
  if (!world || !state) return;
  if (drag.kind === "resize") drag.to = world;
  else paint(boardSquare(world, state));
  refresh();
});

canvas.addEventListener("pointerleave", () => {
  if (!stamp) return;
  hover = null;
  scheduleRender();
});

canvas.addEventListener("pointerup", () => {
  if (drag?.kind === "resize" && state) {
    const rect = toBoardRect(rectBetween(drag.from, drag.to), state);
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

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (!camera) return;
    const bounds = canvas.getBoundingClientRect();
    camera = zoomAt(
      camera,
      viewport,
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED),
    );
    scheduleRender();
  },
  { passive: false },
);

function jumpFromMinimap(event: PointerEvent): void {
  if (!minimapLayout || !camera) return;
  const bounds = minimap.getBoundingClientRect();
  const { extent, scale, offsetX, offsetY } = minimapLayout;
  camera = {
    ...camera,
    x: extent.x + (event.clientX - bounds.left - offsetX) / scale,
    y: extent.y + (event.clientY - bounds.top - offsetY) / scale,
  };
  scheduleRender();
}

minimap.addEventListener("pointerdown", (event) => {
  minimap.setPointerCapture(event.pointerId);
  jumpFromMinimap(event);
});

minimap.addEventListener("pointermove", (event) => {
  if (event.buttons & 1) jumpFromMinimap(event);
});

joinButton.addEventListener("click", () => send({ type: "join" }));
placeButton.addEventListener("click", commit);
homeButton.addEventListener("click", centerOnMat);
blueprintsButton.addEventListener("click", () => library.open());

clearButton.addEventListener("click", () => {
  staged.clear();
  refresh();
});

resizeButton.addEventListener("click", () => {
  stopStamping();
  resizing = !resizing;
  messageEl.textContent = resizing
    ? "Drag a rectangle that contains your home square."
    : "";
  refresh();
});

window.addEventListener("keydown", (event) => {
  if (library.dialog.open) return;
  const key = event.key.toLowerCase();
  if (key === "enter") {
    commit();
  } else if (key === "escape") {
    if (stamp) stopStamping();
    else staged.clear();
    resizing = false;
    drag = null;
    refresh();
  } else if (key === "r" && stamp) {
    transformStamp(rotate);
  } else if (key === "f" && stamp) {
    transformStamp(flip);
  } else if (key === "h") {
    centerOnMat();
  } else if (camera && (key === "+" || key === "=" || key === "-")) {
    const factor = key === "-" ? 1 / KEY_ZOOM_FACTOR : KEY_ZOOM_FACTOR;
    camera = zoomAt(
      camera,
      viewport,
      viewport.width / 2,
      viewport.height / 2,
      factor,
    );
    scheduleRender();
  } else if (camera && key in PAN_KEYS) {
    const [dx, dy] = PAN_KEYS[key];
    camera = dragBy(camera, -dx * PAN_STEP_PX, -dy * PAN_STEP_PX);
    event.preventDefault();
    scheduleRender();
  }
});

connect();
