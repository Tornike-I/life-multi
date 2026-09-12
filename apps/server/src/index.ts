import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  parseClientMessage,
  randomBoard,
  setCell,
  step,
  type ServerMessage,
} from "@life-multi/shared";

const PORT = Number(process.env.PORT ?? 3001);
const BOARD_SIZE = 64;
const TICK_MS = 100;

let board = randomBoard(BOARD_SIZE, BOARD_SIZE, 0.3);
let generation = 0;

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: "/ws" });

function stateMessage(): string {
  const message: ServerMessage = {
    type: "state",
    generation,
    width: board.width,
    height: board.height,
    cells: Array.from(board.cells),
  };
  return JSON.stringify(message);
}

wss.on("connection", (socket) => {
  socket.send(stateMessage());

  socket.on("message", (data) => {
    const message = parseClientMessage(data.toString());
    if (!message) return;
    for (const [x, y] of message.cells) setCell(board, x, y, 1);
  });
});

setInterval(() => {
  board = step(board);
  generation++;

  const payload = stateMessage();
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`life-multi server listening on http://localhost:${PORT}`);
});
