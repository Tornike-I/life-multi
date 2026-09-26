import {
  type Blueprint,
  bounds,
  BUILT_IN,
  type Cell,
  flip,
  gridFor,
  growthFor,
  loadSaved,
  MAX_NAME_LENGTH,
  normalize,
  rotate,
  saveAll,
} from "./blueprints.ts";
import { isLifeRule, MAX_RLE_INPUT, parseRle, toRle } from "./rle.ts";

const EDITOR_CELL_PX = 14;
const EDITOR_MAX_CANVAS_PX = 4096;
const EDITOR_MIN_GRID_LINE_PX = 6;

export interface ChosenBlueprint {
  name: string;
  cells: Cell[];
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

export function createLibrary(
  playerColor: () => string,
  onUse: (blueprint: ChosenBlueprint) => void,
): { dialog: HTMLDialogElement; open(): void } {
  const dialog = byId<HTMLDialogElement>("blueprints");
  const list = byId<HTMLUListElement>("blueprint-list");
  const canvas = byId<HTMLCanvasElement>("editor-canvas");
  const ctx = canvas.getContext("2d")!;
  const title = byId("editor-title");
  const nameInput = byId<HTMLInputElement>("blueprint-name");
  const countEl = byId("editor-count");
  const message = byId("editor-message");
  const rleText = byId<HTMLTextAreaElement>("rle-text");
  const rlePaste = byId<HTMLButtonElement>("rle-paste");

  let saved: Blueprint[] = [];
  let drawing = new Set<number>();
  let { columns, rows } = gridFor([]);
  let cellPx = EDITOR_CELL_PX;
  let editingId: string | null = null;
  let paintAdd: boolean | null = null;

  nameInput.maxLength = MAX_NAME_LENGTH;
  rleText.maxLength = MAX_RLE_INPUT;
  resizeCanvas();

  function gridCells(): Cell[] {
    return [...drawing].map((index): Cell => [
      index % columns,
      Math.floor(index / columns),
    ]);
  }

  function drawnCells(): Cell[] {
    return normalize(gridCells());
  }

  function resizeCanvas(): void {
    cellPx = Math.max(
      1,
      Math.min(
        EDITOR_CELL_PX,
        Math.floor(EDITOR_MAX_CANVAS_PX / Math.max(columns, rows)),
      ),
    );
    canvas.width = columns * cellPx;
    canvas.height = rows * cellPx;
  }

  function setEditing(id: string | null): void {
    editingId = id;
    title.textContent = id ? "Edit blueprint" : "New blueprint";
  }

  function setDrawing(cells: readonly Cell[]): void {
    const { w, h } = bounds(cells);
    ({ columns, rows } = gridFor(cells));
    const offsetX = Math.floor((columns - w) / 2);
    const offsetY = Math.floor((rows - h) / 2);
    drawing = new Set(
      cells.map(([x, y]) => (y + offsetY) * columns + x + offsetX),
    );
    resizeCanvas();
    draw();
  }

  function growToFit(): void {
    const cells = gridCells();
    const { left, top, right, bottom } = growthFor(cells, { columns, rows });
    if (left + top + right + bottom === 0) return;
    columns += left + right;
    rows += top + bottom;
    drawing = new Set(cells.map(([x, y]) => (y + top) * columns + x + left));
    resizeCanvas();
    draw();
  }

  function draw(): void {
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const shownCellPx = (canvas.clientWidth || canvas.width) / columns;
    if (shownCellPx >= EDITOR_MIN_GRID_LINE_PX) {
      ctx.strokeStyle = "rgb(255 255 255 / 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < columns; x++) {
        ctx.moveTo(x * cellPx + 0.5, 0);
        ctx.lineTo(x * cellPx + 0.5, canvas.height);
      }
      for (let y = 1; y < rows; y++) {
        ctx.moveTo(0, y * cellPx + 0.5);
        ctx.lineTo(canvas.width, y * cellPx + 0.5);
      }
      ctx.stroke();
    }

    const gap = cellPx >= 4 ? 1 : 0;
    ctx.fillStyle = playerColor();
    for (const index of drawing) {
      ctx.fillRect(
        (index % columns) * cellPx + gap,
        Math.floor(index / columns) * cellPx + gap,
        cellPx - gap,
        cellPx - gap,
      );
    }

    const { w, h } = bounds(drawnCells());
    countEl.textContent = drawing.size
      ? `${drawing.size} cells · ${w}×${h}`
      : "Click or drag to draw";
  }

  function renderList(): void {
    const entries = [
      ...BUILT_IN.map((blueprint) => ({ blueprint, builtIn: true })),
      ...saved.map((blueprint) => ({ blueprint, builtIn: false })),
    ];
    list.replaceChildren(
      ...entries.map(({ blueprint, builtIn }) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = blueprint.name;
        const meta = document.createElement("span");
        meta.className = "meta";
        const { w, h } = bounds(blueprint.cells);
        meta.textContent = `${blueprint.cells.length} cells · ${w}×${h}${builtIn ? " · built-in" : ""}`;
        item.append(
          name,
          meta,
          button("Use", () => use(blueprint.name, blueprint.cells)),
          button("Edit", () => edit(blueprint, builtIn)),
        );
        if (!builtIn) item.append(button("Delete", () => remove(blueprint)));
        return item;
      }),
    );
  }

  function use(name: string, cells: Cell[]): void {
    if (cells.length === 0) {
      message.textContent = "Draw something first.";
      return;
    }
    dialog.close();
    onUse({ name, cells });
  }

  function edit(blueprint: Blueprint, builtIn: boolean): void {
    setEditing(builtIn ? null : blueprint.id);
    nameInput.value = builtIn ? "" : blueprint.name;
    message.textContent = builtIn
      ? `Copied ${blueprint.name}. Saving creates your own blueprint.`
      : "";
    setDrawing(blueprint.cells);
  }

  function save(): void {
    const name = nameInput.value.trim();
    const cells = drawnCells();
    if (!name) {
      message.textContent = "Give the blueprint a name.";
      return;
    }
    if (cells.length === 0) {
      message.textContent = "Draw something first.";
      return;
    }

    const blueprint = { id: editingId ?? crypto.randomUUID(), name, cells };
    const next = saved.some((entry) => entry.id === blueprint.id)
      ? saved.map((entry) => (entry.id === blueprint.id ? blueprint : entry))
      : [...saved, blueprint];
    if (!saveAll(next)) {
      message.textContent = "Couldn't save: browser storage is unavailable.";
      return;
    }
    saved = next;
    setEditing(blueprint.id);
    message.textContent = `Saved ${name}.`;
    renderList();
  }

  function remove(blueprint: Blueprint): void {
    const next = saved.filter((entry) => entry.id !== blueprint.id);
    if (!saveAll(next)) {
      message.textContent = "Couldn't delete: browser storage is unavailable.";
      return;
    }
    saved = next;
    if (editingId === blueprint.id) setEditing(null);
    message.textContent = `Deleted ${blueprint.name}.`;
    renderList();
  }

  function importRle(text: string): void {
    const result = parseRle(text);
    if (!result.ok) {
      message.textContent = result.error;
      return;
    }
    setEditing(null);
    if (result.name) nameInput.value = result.name.slice(0, MAX_NAME_LENGTH);
    setDrawing(result.cells);
    message.textContent =
      result.rule !== null && !isLifeRule(result.rule)
        ? `Imported ${result.cells.length} cells, but that pattern is written for rule ${result.rule}, not Life.`
        : `Imported ${result.cells.length} cells.`;
  }

  async function pasteRle(): Promise<void> {
    try {
      rleText.value = await navigator.clipboard.readText();
    } catch {
      message.textContent = "Couldn't read the clipboard. Paste into the box.";
      return;
    }
    importRle(rleText.value);
  }

  async function copyRle(): Promise<void> {
    const cells = drawnCells();
    if (cells.length === 0) {
      message.textContent = "Draw something first.";
      return;
    }
    rleText.value = toRle(cells, nameInput.value.trim() || null);
    try {
      await navigator.clipboard.writeText(rleText.value);
      message.textContent = "Copied the RLE to the clipboard.";
    } catch {
      rleText.select();
      message.textContent = "Copy the RLE from the box.";
    }
  }

  function transform(change: (cells: readonly Cell[]) => Cell[]): void {
    setDrawing(change(drawnCells()));
  }

  function indexAt(event: PointerEvent): number | null {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * columns);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * rows);
    if (x < 0 || y < 0 || x >= columns || y >= rows) return null;
    return y * columns + x;
  }

  function paintAt(index: number): void {
    if (paintAdd) drawing.add(index);
    else drawing.delete(index);
    draw();
  }

  canvas.addEventListener("pointerdown", (event) => {
    const index = indexAt(event);
    if (index === null) return;
    paintAdd = !drawing.has(index);
    canvas.setPointerCapture(event.pointerId);
    paintAt(index);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (paintAdd === null) return;
    const index = indexAt(event);
    if (index !== null) paintAt(index);
  });

  function endStroke(): void {
    if (paintAdd === null) return;
    paintAdd = null;
    // Growing mid-stroke would shift or rescale the grid under the pointer.
    growToFit();
  }

  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  rlePaste.hidden = typeof navigator.clipboard?.readText !== "function";
  rlePaste.addEventListener("click", () => void pasteRle());
  byId("rle-import").addEventListener("click", () => importRle(rleText.value));
  byId("rle-copy").addEventListener("click", () => void copyRle());

  byId("editor-rotate").addEventListener("click", () => transform(rotate));
  byId("editor-flip").addEventListener("click", () => transform(flip));
  byId("editor-save").addEventListener("click", save);
  byId("editor-use").addEventListener("click", () =>
    use(nameInput.value.trim() || "Drawing", drawnCells()),
  );
  byId("editor-clear").addEventListener("click", () => {
    setEditing(null);
    nameInput.value = "";
    message.textContent = "";
    setDrawing([]);
  });

  return {
    dialog,
    open() {
      saved = loadSaved();
      renderList();
      dialog.showModal();
      draw();
    },
  };
}
