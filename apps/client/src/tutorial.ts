import {
  allowanceFor,
  BASE_INVENTORY_CAP,
  BASE_MAT_SIDE,
  type Board,
  createBoard,
  DEAD,
  getCell,
  INVENTORY_CAP_PER_LIVE_CELL,
  LIVE_SMOOTHING_DECAY,
  MAT_AREA_PER_LIVE_CELL,
  matContains,
  matSideFor,
  mod,
  type Point,
  type Rect,
  setCell,
  squareMat,
  STARTING_INVENTORY,
  step,
} from "@life-multi/shared";
import { bounds, BUILT_IN, type Cell } from "./blueprints.ts";
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
    target: null,
  };
}

function blueprint(id: string): { name: string; cells: Cell[] } {
  return BUILT_IN.find((entry) => entry.id === id)!;
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
      "life-multi is Conway's Game of Life for many players on one shared board that never stops.",
      "This short tutorial shows how cells behave, how colors work and how your territory grows. Nothing you do here affects the real game.",
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
      "The board is a grid of squares. Each square is empty or holds a live cell, and its neighbors are the 8 squares around it.",
      "Every generation, all squares update at once. An empty square with exactly 3 live neighbors comes alive. A live cell with 2 or 3 live neighbors survives. Every other cell dies, from loneliness or overcrowding.",
      "The block on the left never changes. The line on the right flips between horizontal and vertical. Press Step to watch one generation at a time.",
    ],
    tasks: [
      { label: "Advance 4 generations", check: (world) => world.steps >= 4 },
    ],
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
      "Click empty squares to add cells and click cells to remove them, or pick a pattern below and click the board to drop it.",
      "Shapes come in families. Still lifes never change, oscillators repeat in a loop, and spaceships travel. The board wraps around its edges, so a spaceship that leaves one side comes back on the other.",
      "Each task looks at the whole board, so press Reset to clear it between tries.",
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
      "Every cell belongs to a player and has their color. A surviving cell keeps its color.",
      "A newborn cell has exactly 3 live neighbors, its parents, and takes the color most of them share. If all three colors are different, one of them is picked at random.",
      "Next to the marked square are one of your cells and one of another player's. Add one more of your cells next to the mark, then press Step so it's born in your color.",
    ],
    tasks: [
      {
        label: "Make the marked square come alive in your color",
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
      "You can only place cells on your mat, the square around your home, and each cell you place uses one from your inventory. Placed cells can't be taken back.",
      "The more of your cells are alive, the more cells you can hold and the bigger your mat grows. Your live cell count is smoothed: it rises right away but falls slowly, so short losses don't shrink you.",
      "In the real game you earn a cell every 4 seconds. Here you start with a full inventory: keep at least 9 cells alive to grow your mat.",
    ],
    tasks: [
      {
        label: "Grow your mat to 9 × 9",
        check: (world) => (world.mat?.w ?? 0) >= 9,
      },
    ],
    patterns: ["builtin:block", "builtin:beehive", "builtin:blinker"],
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
      "On the real board you get a mat of your own. Select empty squares on it and press Place to bring them to life, or open Blueprints to stamp bigger shapes.",
      "The rings under the board show your next cell being earned and your mat's progress toward its next size. The minimap shows the area around your territory.",
      "You can replay this tutorial any time from the Tutorial button at the top.",
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
      const live = world.smoothedLive;
      const { matArea, inventoryCap } = allowanceFor(live);
      const side = matSideFor(live);
      statsEl.replaceChildren(
        paragraph(`Your live cells, smoothed: S = ${live.toFixed(1)}`, "div"),
        paragraph(
          `Inventory limit = ${BASE_INVENTORY_CAP} + ${INVENTORY_CAP_PER_LIVE_CELL} × S = ${inventoryCap}`,
          "div",
        ),
        paragraph(
          `Mat area = ${BASE_MAT_SIDE ** 2} + ${MAT_AREA_PER_LIVE_CELL} × S = ${matArea}, so the mat is ${side} × ${side}`,
          "div",
        ),
        paragraph(
          `Cells left to place: ${Math.floor(world.inventory ?? 0)}`,
          "div",
        ),
      );
    }
  }

  function tick(): void {
    world.board = step(world.board, world.generation);
    world.generation++;
    world.steps++;
    if (world.mat) {
      let live = 0;
      for (const color of world.board.cells) if (color === PLAYER) live++;
      world.smoothedLive = Math.max(
        live,
        world.smoothedLive * LIVE_SMOOTHING_DECAY,
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
      ? `Click the board to drop the ${blueprint(armed).name.toLowerCase()}.`
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
