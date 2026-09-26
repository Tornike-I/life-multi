import {
  BASE_MAT_SIDE,
  type Board,
  createBoard,
  DEAD,
  getCell,
  matContains,
  matSideFor,
  mod,
  type Point,
  type Rect,
  recordLive,
  setCell,
  smoothLive,
  squareMat,
  STARTING_INVENTORY,
  step,
} from "@life-multi/shared";
import { bounds, type Cell, findPattern } from "./blueprints.ts";
import { colorFor } from "./render.ts";
import {
  colorLesson,
  isOscillator,
  isSpaceship,
  isStillLife,
  placePattern,
  PLAYER,
  TUTORIAL_SIZE,
} from "./tutorialChecks.ts";

const CELL_PX = 18;
const TUTORIAL_TICK_MS = 250;
const HOME: Point = { x: 12, y: 12 };

interface World {
  board: Board;
  generation: number;
  steps: number;
  mat: Rect | null;
  inventory: number | null;
  smoothedLive: number;
  recentLive: number[];
  target: Point | null;
}

interface Task {
  label: string;
  check: (world: World) => boolean;
}

interface Chapter {
  title: string;
  paragraphs: string[];
  tasks: Task[];
  patterns: string[];
  playing: boolean;
  editable: boolean;
  simulationControls: boolean;
  setup: () => World;
}

export interface Tutorial {
  dialog: HTMLDialogElement;
  open(offerJoin: boolean): void;
}

function emptyWorld(): World {
  return {
    board: createBoard(TUTORIAL_SIZE, TUTORIAL_SIZE),
    generation: 0,
    steps: 0,
    mat: null,
    inventory: null,
    smoothedLive: 0,
    recentLive: [],
    target: null,
  };
}

function liveCount(board: Board): number {
  let live = 0;
  for (const color of board.cells) if (color === PLAYER) live++;
  return live;
}

function blueprint(id: string): { name: string; cells: Cell[] } {
  return findPattern(id)!;
}

function worldWith(placements: [id: string, x: number, y: number][]): World {
  const world = emptyWorld();
  for (const [id, x, y] of placements) {
    placePattern(world.board, blueprint(id).cells, x, y, PLAYER);
  }
  return world;
}

const CHAPTERS: Chapter[] = [
  {
    title: "Welcome to life-multi",
    paragraphs: [
      "Conway's Game of Life, shared by everyone on one board that never stops.",
      "This practice board doesn't affect the real game.",
    ],
    tasks: [],
    patterns: [],
    playing: true,
    editable: false,
    simulationControls: false,
    setup: () =>
      worldWith([
        ["builtin:glider", 3, 3],
        ["builtin:lwss", 16, 15],
      ]),
  },
  {
    title: "How cells live and die",
    paragraphs: [
      "An empty square with exactly 3 live neighbors comes alive. A cell with 2 or 3 neighbors survives. The rest die.",
      "Press Step to watch.",
    ],
    tasks: [{ label: "Step 4 times", check: (world) => world.steps >= 4 }],
    patterns: [],
    playing: false,
    editable: false,
    simulationControls: true,
    setup: () =>
      worldWith([
        ["builtin:block", 6, 11],
        ["builtin:blinker", 15, 12],
      ]),
  },
  {
    title: "Try some shapes",
    paragraphs: [
      "Tap squares to add or remove cells, or pick a pattern and tap the board to drop it.",
      "Still lifes never change, oscillators repeat, spaceships travel. Reset between tries.",
    ],
    tasks: [
      {
        label: "Build a still life",
        check: (world) => isStillLife(world.board),
      },
      {
        label: "Build an oscillator",
        check: (world) => isOscillator(world.board),
      },
      {
        label: "Launch a spaceship",
        check: (world) => isSpaceship(world.board),
      },
    ],
    patterns: [
      "builtin:block",
      "builtin:beehive",
      "builtin:blinker",
      "builtin:glider",
      "builtin:lwss",
    ],
    playing: true,
    editable: true,
    simulationControls: true,
    setup: emptyWorld,
  },
  {
    title: "Colors",
    paragraphs: [
      "A newborn cell takes the color most of its 3 parents share.",
      "Add one of your cells next to the mark, then press Step.",
    ],
    tasks: [
      {
        label: "Turn the marked square your color",
        check: (world) =>
          world.target !== null &&
          getCell(world.board, world.target.x, world.target.y) === PLAYER,
      },
    ],
    patterns: [],
    playing: false,
    editable: true,
    simulationControls: true,
    setup: () => ({ ...emptyWorld(), ...colorLesson() }),
  },
  {
    title: "Growing your territory",
    paragraphs: [
      "You can only place cells on your mat, and each one uses a cell from your inventory.",
      "The more of your cells stay alive, the bigger your mat grows. Keep 9 alive.",
    ],
    tasks: [
      {
        label: "Grow your mat to 9 × 9",
        check: (world) => (world.mat?.w ?? 0) >= 9,
      },
    ],
    patterns: [
      "builtin:block",
      "builtin:beehive",
      "builtin:blinker",
      "builtin:lwss",
    ],
    playing: true,
    editable: true,
    simulationControls: true,
    setup: () => ({
      ...emptyWorld(),
      mat: squareMat(HOME, BASE_MAT_SIDE, TUTORIAL_SIZE, TUTORIAL_SIZE),
      inventory: STARTING_INVENTORY,
    }),
  },
  {
    title: "You're ready",
    paragraphs: [
      "On the real board you get your own mat. Select squares on it and press Place.",
      "Replay this any time from the Tutorial button.",
    ],
    tasks: [],
    patterns: [],
    playing: true,
    editable: false,
    simulationControls: false,
    setup: () => worldWith([["builtin:glider", 3, 3]]),
  },
];

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function paragraph(text: string, tag = "p"): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

export function createTutorial(options: {
  hasAccount: () => boolean;
  onJoin: () => void;
}): Tutorial {
  const dialog = byId<HTMLDialogElement>("tutorial");
  const canvas = byId<HTMLCanvasElement>("tutorial-canvas");
  const ctx = canvas.getContext("2d")!;
  const progressEl = byId("tutorial-progress");
  const titleEl = byId("tutorial-title");
  const copyEl = byId("tutorial-copy");
  const tasksEl = byId("tutorial-tasks");
  const statsEl = byId("tutorial-stats");
  const messageEl = byId("tutorial-message");
  const generationEl = byId("tutorial-generation");
  const simulationEl = byId("tutorial-simulation");
  const patternsEl = byId("tutorial-patterns");
  const playButton = byId<HTMLButtonElement>("tutorial-play");
  const stepButton = byId<HTMLButtonElement>("tutorial-step");
  const resetButton = byId<HTMLButtonElement>("tutorial-reset");
  const closeButton = byId<HTMLButtonElement>("tutorial-close");
  const backButton = byId<HTMLButtonElement>("tutorial-back");
  const nextButton = byId<HTMLButtonElement>("tutorial-next");

  let offerJoin = false;
  let index = 0;
  let world = emptyWorld();
  let playing = false;
  let armed: string | null = null;
  let hover: Point | null = null;
  let paintAdd: boolean | null = null;
  let timer: number | undefined;
  const completed = CHAPTERS.map(() => new Set<number>());

  canvas.width = TUTORIAL_SIZE * CELL_PX;
  canvas.height = TUTORIAL_SIZE * CELL_PX;

  const chapter = () => CHAPTERS[index];

  function load(chapterIndex: number): void {
    index = chapterIndex;
    world = chapter().setup();
    playing = chapter().playing;
    armed = null;
    messageEl.textContent = "";
    renderText();
    renderControls();
    evaluate();
    draw();
  }

  function renderText(): void {
    const last = index === CHAPTERS.length - 1;
    progressEl.textContent =
      index === 0 || last ? "" : `Step ${index} of ${CHAPTERS.length - 2}`;
    titleEl.textContent = chapter().title;
    copyEl.replaceChildren(
      ...chapter().paragraphs.map((text) => paragraph(text)),
    );
    backButton.hidden = index === 0;
    nextButton.textContent =
      index === 0
        ? "Start tutorial"
        : last
          ? options.hasAccount()
            ? "Back to the game"
            : "Join the game"
          : "Next";
    closeButton.textContent =
      offerJoin && !options.hasAccount() ? "Skip and join" : "Close";
  }

  function renderControls(): void {
    simulationEl.hidden = !chapter().simulationControls;
    playButton.textContent = playing ? "Pause" : "Play";
    patternsEl.hidden = chapter().patterns.length === 0;
    patternsEl.replaceChildren(
      ...chapter().patterns.map((id) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = blueprint(id).name;
        button.setAttribute("aria-pressed", String(armed === id));
        button.addEventListener("click", () => arm(id));
        return button;
      }),
    );
  }

  function evaluate(): void {
    const tasks = chapter().tasks;
    tasks.forEach((task, i) => {
      if (task.check(world)) completed[index].add(i);
    });
    tasksEl.hidden = tasks.length === 0;
    tasksEl.replaceChildren(
      ...tasks.map((task, i) => {
        const item = paragraph(task.label, "li");
        item.classList.toggle("done", completed[index].has(i));
        return item;
      }),
    );

    statsEl.hidden = world.mat === null;
    if (world.mat) {
      const side = matSideFor(world.smoothedLive);
      statsEl.replaceChildren(
        paragraph(`Alive: ${liveCount(world.board)}`, "div"),
        paragraph(`Mat: ${side} × ${side}`, "div"),
        paragraph(`Cells left: ${Math.floor(world.inventory ?? 0)}`, "div"),
      );
    }
  }

  function tick(): void {
    world.board = step(world.board, world.generation);
    world.generation++;
    world.steps++;
    if (world.mat) {
      world.smoothedLive = smoothLive(
        world.smoothedLive,
        recordLive(world.recentLive, liveCount(world.board)),
      );
      const side = Math.min(matSideFor(world.smoothedLive), TUTORIAL_SIZE);
      world.mat = squareMat(HOME, side, TUTORIAL_SIZE, TUTORIAL_SIZE);
    }
    evaluate();
    draw();
  }

  function stopLoop(): void {
    if (timer === undefined) return;
    window.clearInterval(timer);
    timer = undefined;
  }

  function startLoop(): void {
    stopLoop();
    timer = window.setInterval(() => {
      if (playing) tick();
    }, TUTORIAL_TICK_MS);
  }

  function finish(): void {
    const join = !options.hasAccount() && (offerJoin || index > 0);
    dialog.close();
    if (join) options.onJoin();
  }

  function arm(id: string): void {
    armed = armed === id ? null : id;
    messageEl.textContent = armed
      ? `Tap the board to drop the ${blueprint(armed).name.toLowerCase()}.`
      : "";
    renderControls();
    draw();
  }

  function squareAt(event: PointerEvent): Point | null {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(
      ((event.clientX - rect.left) / rect.width) * TUTORIAL_SIZE,
    );
    const y = Math.floor(
      ((event.clientY - rect.top) / rect.height) * TUTORIAL_SIZE,
    );
    if (x < 0 || y < 0 || x >= TUTORIAL_SIZE || y >= TUTORIAL_SIZE) return null;
    return { x, y };
  }

  function onMat(square: Point): boolean {
    return (
      world.mat === null ||
      matContains(world.mat, square, TUTORIAL_SIZE, TUTORIAL_SIZE)
    );
  }

  function patternSquares(id: string, center: Point): Point[] {
    const { cells } = blueprint(id);
    const { w, h } = bounds(cells);
    return cells.map(([dx, dy]) => ({
      x: mod(center.x - Math.floor(w / 2) + dx, TUTORIAL_SIZE),
      y: mod(center.y - Math.floor(h / 2) + dy, TUTORIAL_SIZE),
    }));
  }

  function spend(count: number): boolean {
    if (world.inventory === null) return true;
    if (count > Math.floor(world.inventory)) {
      messageEl.textContent = `You need ${count} cells but only have ${Math.floor(world.inventory)} left.`;
      return false;
    }
    world.inventory -= count;
    return true;
  }

  function dropPattern(center: Point): void {
    const squares = patternSquares(armed!, center);
    const fits = squares.every(
      (square) =>
        onMat(square) && getCell(world.board, square.x, square.y) === DEAD,
    );
    if (!fits) {
      messageEl.textContent = world.mat
        ? "That pattern needs empty squares on your mat."
        : "That pattern needs empty squares.";
      return;
    }
    if (!spend(squares.length)) return;
    for (const square of squares) {
      setCell(world.board, square.x, square.y, PLAYER);
    }
    armed = null;
    messageEl.textContent = "";
    renderControls();
  }

  function paintAt(square: Point): void {
    const current = getCell(world.board, square.x, square.y);
    if (paintAdd && current === DEAD && onMat(square) && spend(1)) {
      setCell(world.board, square.x, square.y, PLAYER);
    } else if (!paintAdd && current === PLAYER && world.inventory === null) {
      setCell(world.board, square.x, square.y, DEAD);
    }
  }

  function draw(): void {
    const size = TUTORIAL_SIZE * CELL_PX;
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0, 0, size, size);

    if (world.mat) {
      const { x, y, w, h } = world.mat;
      ctx.fillStyle = colorFor(PLAYER, 0.14);
      ctx.fillRect(x * CELL_PX, y * CELL_PX, w * CELL_PX, h * CELL_PX);
      ctx.strokeStyle = colorFor(PLAYER, 0.9);
      ctx.lineWidth = 2;
      ctx.strokeRect(
        x * CELL_PX + 1,
        y * CELL_PX + 1,
        w * CELL_PX - 2,
        h * CELL_PX - 2,
      );
    }

    ctx.strokeStyle = "rgb(255 255 255 / 0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < TUTORIAL_SIZE; i++) {
      ctx.moveTo(i * CELL_PX + 0.5, 0);
      ctx.lineTo(i * CELL_PX + 0.5, size);
      ctx.moveTo(0, i * CELL_PX + 0.5);
      ctx.lineTo(size, i * CELL_PX + 0.5);
    }
    ctx.stroke();

    const { cells } = world.board;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === DEAD) continue;
      ctx.fillStyle = colorFor(cells[i]);
      ctx.fillRect(
        (i % TUTORIAL_SIZE) * CELL_PX + 1,
        Math.floor(i / TUTORIAL_SIZE) * CELL_PX + 1,
        CELL_PX - 2,
        CELL_PX - 2,
      );
    }

    if (world.target) {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(
        world.target.x * CELL_PX + 2,
        world.target.y * CELL_PX + 2,
        CELL_PX - 4,
        CELL_PX - 4,
      );
      ctx.setLineDash([]);
    }

    if (armed && hover) {
      ctx.fillStyle = colorFor(PLAYER, 0.4);
      for (const square of patternSquares(armed, hover)) {
        ctx.fillRect(
          square.x * CELL_PX + 1,
          square.y * CELL_PX + 1,
          CELL_PX - 2,
          CELL_PX - 2,
        );
      }
    }

    generationEl.textContent = `generation ${world.generation}`;
  }

  canvas.addEventListener("pointerdown", (event) => {
    const square = squareAt(event);
    if (!square || !chapter().editable) return;
    if (armed) {
      dropPattern(square);
    } else {
      paintAdd = getCell(world.board, square.x, square.y) === DEAD;
      canvas.setPointerCapture(event.pointerId);
      paintAt(square);
    }
    evaluate();
    draw();
  });

  canvas.addEventListener("pointermove", (event) => {
    hover = squareAt(event);
    if (paintAdd !== null && hover) {
      paintAt(hover);
      evaluate();
    }
    if (armed || paintAdd !== null) draw();
  });

  canvas.addEventListener("pointerup", () => {
    paintAdd = null;
  });

  canvas.addEventListener("pointercancel", () => {
    paintAdd = null;
  });

  canvas.addEventListener("pointerleave", () => {
    hover = null;
    if (armed) draw();
  });

  playButton.addEventListener("click", () => {
    playing = !playing;
    renderControls();
  });

  stepButton.addEventListener("click", () => {
    playing = false;
    tick();
    renderControls();
  });

  resetButton.addEventListener("click", () => {
    world = chapter().setup();
    playing = chapter().playing;
    armed = null;
    messageEl.textContent = "";
    renderControls();
    evaluate();
    draw();
  });

  backButton.addEventListener("click", () => load(index - 1));

  nextButton.addEventListener("click", () => {
    if (index === CHAPTERS.length - 1) finish();
    else load(index + 1);
  });

  closeButton.addEventListener("click", () => {
    if (offerJoin && !options.hasAccount()) finish();
    else dialog.close();
  });

  dialog.addEventListener("close", stopLoop);

  return {
    dialog,
    open(joinAfter: boolean) {
      offerJoin = joinAfter;
      load(0);
      dialog.showModal();
      startLoop();
    },
  };
}
