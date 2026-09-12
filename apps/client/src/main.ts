import type {
  ClientMessage,
  ServerMessage,
  StateMessage,
} from "@life-multi/shared";
import "./style.css";

const CELL_PX = 10;
const GLIDER: [number, number][] = [
  [1, 0],
  [2, 1],
  [0, 2],
  [1, 2],
  [2, 2],
];

const canvas = document.querySelector<HTMLCanvasElement>("#board")!;
const ctx = canvas.getContext("2d")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const generationEl = document.querySelector<HTMLElement>("#generation")!;

let socket: WebSocket;
let latest: StateMessage | null = null;

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener("open", () => {
    statusEl.textContent = "connected";
  });
  socket.addEventListener("close", () => {
    statusEl.textContent = "disconnected, retrying…";
    setTimeout(connect, 1000);
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data as string) as ServerMessage;
    if (message.type === "state") render(message);
  });
}

function render(state: StateMessage): void {
  latest = state;
  const width = state.width * CELL_PX;
  const height = state.height * CELL_PX;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#4ade80";
  state.cells.forEach((alive, i) => {
    if (!alive) return;
    const x = (i % state.width) * CELL_PX;
    const y = Math.floor(i / state.width) * CELL_PX;
    ctx.fillRect(x, y, CELL_PX - 1, CELL_PX - 1);
  });

  generationEl.textContent = `generation ${state.generation}`;
}

canvas.addEventListener("click", (event) => {
  if (!latest || socket.readyState !== WebSocket.OPEN) return;

  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(
    ((event.clientX - rect.left) / rect.width) * latest.width,
  );
  const y = Math.floor(
    ((event.clientY - rect.top) / rect.height) * latest.height,
  );
  const message: ClientMessage = {
    type: "place",
    cells: GLIDER.map(([dx, dy]): [number, number] => [x + dx - 1, y + dy - 1]),
  };
  socket.send(JSON.stringify(message));
});

connect();
