import {
  type ClientMessage,
  DEAD,
  DEFAULT_VIEW_SQUARES,
  matContains,
  type Point,
  type ResultMessage,
  type ServerMessage,
  type StateMessage,
  TOUCH_VIEW_SQUARES,
} from "@life-multi/shared";
import { bounds, type Cell, flip, rotate } from "./blueprints.ts";
import {
  type Camera,
  clampZoom,
  defaultZoom,
  dragBy,
  mod,
  pinchBy,
  screenToWorld,
  type Viewport,
  zoomAt,
} from "./camera.ts";
import { createLeaderboard } from "./leaderboard.ts";
import { type ChosenBlueprint, createLibrary } from "./library.ts";
import { drawMinimap, type MinimapLayout } from "./minimap.ts";
import { colorFor, draw, type StampSquare } from "./render.ts";
import { createTutorial } from "./tutorial.ts";
import "./style.css";

const KEY_STORAGE = "life-multi:key";
// Must match #minimap's size in style.css.
const MINIMAP_PX = 180;
const MINIMAP_COMPACT_PX = 112;
const TAP_SLOP_PX = 10;
const TOUCH_HINT =
  "Pinch to zoom, drag to pan. Tap squares on your mat, then press Place.";
const PAN_STEP_PX = 80;
const WHEEL_ZOOM_SPEED = 0.0015;
const KEY_ZOOM_FACTOR = 1.25;
const REMOVE_CONFIRM_MS = 3000;
const REMOVE_LABEL = "Remove my cells";
const WALL_HINT =
  "Building walls: select empty squares on your mat. Select one of your walls to remove it.";
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
// No text for "name" (the leaderboard dialog reports it) or "wall" (a drag sends one per square).
const SUCCESS_TEXT: Record<
  Exclude<ResultMessage["action"], "name" | "wall">,
  string
> = {
  join: "You have a mat. Select empty squares on it, then press Place.",
  place: "Placed.",
  removeCells: "Removed your cells from your mat.",
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
const inventoryRing =
  document.querySelector<SVGCircleElement>("#inventory-ring")!;
const matStatEl = element("mat-stat");
const matSizeEl = element("mat-size");
const matRing = document.querySelector<SVGCircleElement>("#mat-ring")!;
const aliveEl = element("alive");
const wallsEl = element("walls");
const wallModeButton = element<HTMLButtonElement>("wall-mode");
const placeButton = element<HTMLButtonElement>("place");
const clearButton = element<HTMLButtonElement>("clear");
const removeCellsButton = element<HTMLButtonElement>("remove-cells");
const homeButton = element<HTMLButtonElement>("home");
const blueprintsButton = element<HTMLButtonElement>("blueprints-open");
const stampCancelButton = element<HTMLButtonElement>("stamp-cancel");
const stampRotateButton = element<HTMLButtonElement>("stamp-rotate");
const stampFlipButton = element<HTMLButtonElement>("stamp-flip");
const tutorialButton = element<HTMLButtonElement>("tutorial-open");
const leaderboardButton = element<HTMLButtonElement>("leaderboard-open");
const messageEl = element("message");

type Drag =
  | { kind: "paint"; add: boolean }
  | { kind: "wall"; remove: boolean; visited: Set<number> }
  | { kind: "pan"; lastX: number; lastY: number };

let socket: WebSocket;
let memoryKey: string | null = null;
let accountId: number | null = null;
let state: StateMessage | null = null;
let cells: Uint16Array | null = null;
let staged = new Set<number>();
let wallOwners = new Map<number, number>();
let wallMode = false;
let lastCommit = new Set<number>();
let drag: Drag | null = null;
let viewport: Viewport = { width: 1, height: 1 };
let camera: Camera | null = null;
let followMat = true;
let minimapLayout: MinimapLayout | null = null;
let renderQueued = false;
let stamp: ChosenBlueprint | null = null;
let hover: Point | null = null;
let tapStart: Point | null = null;
let removeConfirmTimer: number | null = null;
const touches = new Map<number, Point>();
const coarsePointer = matchMedia("(pointer: coarse)").matches;
const compactLayout = matchMedia("(max-width: 600px)");
const viewSquares = coarsePointer ? TOUCH_VIEW_SQUARES : DEFAULT_VIEW_SQUARES;

const library = createLibrary(
  () => (accountId === null ? "#e5e7eb" : colorFor(accountId)),
  startStamping,
);

const leaderboard = createLeaderboard({
  accountId: () => accountId,
  currentName: () => state?.you?.name ?? null,
  onRename: (name) => send({ type: "name", name }),
});

const tutorial = createTutorial({
  hasAccount: () => accountId !== null,
  onJoin: () => send({ type: "join" }),
});

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
      wallOwners = new Map(
        message.walls.map((wall) => [wall.y * message.width + wall.x, wall.id]),
      );
      if (!camera) {
        measureViewport();
        camera = {
          x: message.width / 2,
          y: message.height / 2,
          zoom: defaultZoom(viewport, viewSquares),
        };
      }
      if (!message.you?.mat) {
        followMat = true;
        wallMode = false;
        stopStamping();
      } else if (followMat) {
        followMat = false;
        centerOnMat();
      }
      pruneStaged();
      break;
    case "leaderboard":
      leaderboard.update(message);
      break;
    case "result":
      if (message.action === "name") {
        leaderboard.showNameResult(message.ok, message.reason);
        break;
      }
      if (message.action === "wall") {
        if (!message.ok) messageEl.textContent = message.reason ?? "";
        break;
      }
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
    zoom: clampZoom(defaultZoom(viewport, viewSquares), viewport),
  };
  scheduleRender();
}

function onOwnMat(square: Point): boolean {
  const mat = state?.you?.mat;
  return (
    state !== null &&
    mat !== null &&
    mat !== undefined &&
    matContains(mat, square, state.width, state.height)
  );
}

function pruneStaged(): void {
  if (!state) return;
  const { width } = state;
  for (const index of staged) {
    const square = { x: index % width, y: Math.floor(index / width) };
    if (!onOwnMat(square) || wallOwners.has(index)) staged.delete(index);
  }
}

function ownWallAt(index: number): boolean {
  return accountId !== null && wallOwners.get(index) === accountId;
}

function sendWall(index: number, remove: boolean): void {
  if (!state || !cells) return;
  const allowed = remove
    ? ownWallAt(index)
    : !wallOwners.has(index) && cells[index] === DEAD;
  if (!allowed) return;
  const { width } = state;
  send({
    type: "wall",
    x: index % width,
    y: Math.floor(index / width),
    remove,
  });
}

function setWallMode(on: boolean): void {
  stopStamping();
  wallMode = on;
  messageEl.textContent = on ? WALL_HINT : "";
  refresh();
}

function ownCellsOnMat(): boolean {
  const mat = state?.you?.mat;
  if (!state || !mat || !cells || accountId === null) return false;
  const { width, height } = state;
  for (let dy = 0; dy < mat.h; dy++) {
    const row = mod(mat.y + dy, height) * width;
    for (let dx = 0; dx < mat.w; dx++) {
      if (cells[row + mod(mat.x + dx, width)] === accountId) return true;
    }
  }
  return false;
}

function disarmRemove(): void {
  if (removeConfirmTimer !== null) clearTimeout(removeConfirmTimer);
  removeConfirmTimer = null;
  removeCellsButton.textContent = REMOVE_LABEL;
}

function removeCells(): void {
  if (removeConfirmTimer === null) {
    removeCellsButton.textContent = "Click again to confirm";
    removeConfirmTimer = window.setTimeout(disarmRemove, REMOVE_CONFIRM_MS);
    return;
  }
  disarmRemove();
  send({ type: "removeCells" });
}

function setRing(ring: SVGCircleElement, progress: number): void {
  ring.style.strokeDashoffset = String(1 - progress);
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
  playerEl.style.setProperty("--player", colorFor(you.id));
  inventoryEl.textContent = `cells ${you.inventory}/${you.inventoryCap}`;
  setRing(inventoryRing, you.inventoryProgress);
  matSizeEl.textContent = `mat ${mat.w}×${mat.h}`;
  setRing(matRing, you.matProgress);
  matStatEl.classList.toggle("blocked", you.matBlocked);
  matStatEl.title = you.matBlocked
    ? "Can't grow: another player's mat is too close."
    : `Grows to ${mat.w + 1}×${mat.h + 1} when the ring fills.`;
  aliveEl.textContent = `alive ${you.liveCells}`;
  wallsEl.textContent = `walls ${you.walls}/${you.wallCap}`;
  wallModeButton.setAttribute("aria-pressed", String(wallMode));
  stampCancelButton.hidden = stamp === null;
  stampRotateButton.hidden = stamp === null;
  stampFlipButton.hidden = stamp === null;
  placeButton.textContent = `Place ${staged.size}`;
  placeButton.disabled =
    staged.size === 0 || staged.size > you.inventory || blocked;
  removeCellsButton.disabled = !ownCellsOnMat();
  if (removeCellsButton.disabled) disarmRemove();
}

function stampSquares(): StampSquare[] | null {
  if (!stamp || !hover || !state || !cells) return null;
  const board = state;
  const current = cells;
  const { w, h } = bounds(stamp.cells);
  const originX = hover.x - Math.floor(w / 2);
  const originY = hover.y - Math.floor(h / 2);
  return stamp.cells.map(([dx, dy]) => {
    const x = originX + dx;
    const y = originY + dy;
    const square = boardSquare({ x, y }, board);
    const index = square.y * board.width + square.x;
    const ok =
      onOwnMat(square) && current[index] === DEAD && !wallOwners.has(index);
    return { x, y, index, ok };
  });
}

function stampHint(): string {
  if (!stamp) return "";
  const inventory = state?.you?.inventory ?? 0;
  return `${stamp.name}: ${stamp.cells.length} cells (you have ${inventory}). Tap or click to select it. Rotate (R) and Flip (F) turn it.`;
}

function startStamping(blueprint: ChosenBlueprint): void {
  stamp = blueprint;
  wallMode = false;
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
  messageEl.textContent = `Selected ${stamp!.name}. Press Place, or tap to select another.`;
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
  const dpr = window.devicePixelRatio || 1;
  draw(ctx, {
    state,
    cells,
    accountId,
    staged,
    camera,
    dpr,
    width: viewport.width,
    height: viewport.height,
    stampPreview: stampSquares(),
  });

  if (accountId === null) {
    minimapLayout = null;
  } else {
    const size = compactLayout.matches ? MINIMAP_COMPACT_PX : MINIMAP_PX;
    const backing = Math.round(size * dpr);
    if (minimap.width !== backing) {
      minimap.width = backing;
      minimap.height = backing;
    }
    minimapLayout = drawMinimap(minimapCtx, size, dpr, {
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
  if (!state || drag?.kind !== "paint" || !onOwnMat(square)) return;
  const index = square.y * state.width + square.x;
  if (!drag.add) staged.delete(index);
  else if (!wallOwners.has(index)) staged.add(index);
}

function buildWall(square: Point): void {
  if (!state || drag?.kind !== "wall" || !onOwnMat(square)) return;
  const index = square.y * state.width + square.x;
  if (drag.visited.has(index)) return;
  drag.visited.add(index);
  sendWall(index, drag.remove);
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

function tap(event: PointerEvent): void {
  const world = worldSquareAt(event);
  if (!state || !state.you?.mat || !world) return;
  if (stamp) {
    hover = world;
    stampHere();
    return;
  }
  const square = boardSquare(world, state);
  if (!onOwnMat(square)) return;
  const index = square.y * state.width + square.x;
  if (wallMode || ownWallAt(index)) {
    sendWall(index, ownWallAt(index));
    return;
  }
  if (staged.has(index)) staged.delete(index);
  else if (!wallOwners.has(index)) staged.add(index);
  refresh();
}

function touchStart(event: PointerEvent): void {
  const point = { x: event.clientX, y: event.clientY };
  tapStart = touches.size === 0 ? point : null;
  touches.set(event.pointerId, point);
  canvas.setPointerCapture(event.pointerId);
}

function touchMove(event: PointerEvent): void {
  const last = touches.get(event.pointerId);
  if (!last || !camera) return;
  const next = { x: event.clientX, y: event.clientY };
  if (tapStart) {
    if (Math.hypot(next.x - tapStart.x, next.y - tapStart.y) < TAP_SLOP_PX) {
      return;
    }
    tapStart = null;
  }
  const other = [...touches].find(([id]) => id !== event.pointerId)?.[1];
  if (other) {
    const bounds = canvas.getBoundingClientRect();
    const local = (point: Point): Point => ({
      x: point.x - bounds.left,
      y: point.y - bounds.top,
    });
    camera = pinchBy(
      camera,
      viewport,
      [local(last), local(other)],
      [local(next), local(other)],
    );
  } else {
    camera = dragBy(camera, next.x - last.x, next.y - last.y);
  }
  touches.set(event.pointerId, next);
  scheduleRender();
}

function touchEnd(event: PointerEvent): void {
  touches.delete(event.pointerId);
  if (touches.size > 0) return;
  if (tapStart) tap(event);
  tapStart = null;
}

new ResizeObserver(measureViewport).observe(canvas);

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

canvas.addEventListener("mousedown", (event) => {
  if (event.button === 1) event.preventDefault();
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") {
    touchStart(event);
    return;
  }
  if (event.button === 1 || event.button === 2) {
    drag = { kind: "pan", lastX: event.clientX, lastY: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  const world = worldSquareAt(event);
  if (!state || !state.you?.mat || !world || event.button !== 0) return;

  if (stamp) {
    hover = world;
    stampHere();
    return;
  }

  const square = boardSquare(world, state);
  if (!onOwnMat(square)) return;
  const index = square.y * state.width + square.x;
  if (wallMode || ownWallAt(index)) {
    drag = { kind: "wall", remove: ownWallAt(index), visited: new Set() };
    buildWall(square);
  } else {
    drag = { kind: "paint", add: !staged.has(index) };
    paint(square);
  }
  canvas.setPointerCapture(event.pointerId);
  refresh();
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") {
    touchMove(event);
    return;
  }
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
  const square = boardSquare(world, state);
  if (drag.kind === "wall") buildWall(square);
  else paint(square);
  refresh();
});

canvas.addEventListener("pointerleave", (event) => {
  if (!stamp || event.pointerType === "touch") return;
  hover = null;
  scheduleRender();
});

canvas.addEventListener("pointerup", (event) => {
  if (event.pointerType === "touch") {
    touchEnd(event);
    return;
  }
  drag = null;
  refresh();
});

canvas.addEventListener("pointercancel", (event) => {
  touches.delete(event.pointerId);
  tapStart = null;
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

joinButton.addEventListener("click", () => {
  if (accountId === null) tutorial.open(true);
  else send({ type: "join" });
});
tutorialButton.addEventListener("click", () => tutorial.open(false));
placeButton.addEventListener("click", commit);
removeCellsButton.addEventListener("click", removeCells);
homeButton.addEventListener("click", centerOnMat);
blueprintsButton.addEventListener("click", () => library.open());
leaderboardButton.addEventListener("click", () => leaderboard.open());

stampCancelButton.addEventListener("click", () => {
  stopStamping();
  refresh();
});

stampRotateButton.addEventListener("click", () => transformStamp(rotate));
stampFlipButton.addEventListener("click", () => transformStamp(flip));

wallModeButton.addEventListener("click", () => setWallMode(!wallMode));

clearButton.addEventListener("click", () => {
  staged.clear();
  refresh();
});

window.addEventListener("keydown", (event) => {
  if (library.dialog.open || tutorial.dialog.open || leaderboard.dialog.open) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === "enter") {
    commit();
  } else if (key === "escape") {
    if (stamp) stopStamping();
    else if (wallMode) setWallMode(false);
    else staged.clear();
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

if (coarsePointer) messageEl.textContent = TOUCH_HINT;
connect();
