import { createHash, randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  type ClientMessage,
  LEADERBOARD_MS,
  LEADERBOARD_SIZE,
  MAX_ACCOUNTS,
  MAX_PLAYER_NAME_LENGTH,
  parseClientMessage,
  type ResultMessage,
  sanitizePlayerName,
  type ServerMessage,
  STARTING_INVENTORY,
  TICK_MS,
} from "@life-multi/shared";
import {
  insertAccount,
  loadGame,
  openDatabase,
  saveGame,
  takeAdminActions,
} from "./db.ts";
import type { Account } from "./game.ts";

const PORT = Number(process.env.PORT ?? 3001);
const SAVE_MS = 5000;
const NO_ACCOUNT = "Join the game first.";
const BAD_NAME = `A name needs 1 to ${MAX_PLAYER_NAME_LENGTH} visible characters.`;

interface Session {
  account: Account | null;
  greeted: boolean;
}

const db = openDatabase();
const game = loadGame(db, () => randomInt(2 ** 32));
const sessions = new Map<WebSocket, Session>();

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function reply(
  socket: WebSocket,
  action: ResultMessage["action"],
  reason: string | null,
): void {
  send(
    socket,
    reason === null
      ? { type: "result", action, ok: true }
      : { type: "result", action, ok: false, reason },
  );
}

function createAccount(): { account: Account; key: string } {
  const key = randomBytes(32).toString("base64url");
  const keyHash = hashKey(key);
  const now = Date.now();
  const account: Account = {
    id: insertAccount(db, keyHash, now, STARTING_INVENTORY),
    keyHash,
    name: null,
    inventory: STARTING_INVENTORY,
    smoothedLive: 0,
    recentLive: [],
    liveCells: 0,
    walls: new Set(),
    home: null,
    mat: null,
    lastSeenAt: now,
  };
  game.addAccount(account);
  return { account, key };
}

function handle(
  socket: WebSocket,
  session: Session,
  message: ClientMessage,
): void {
  switch (message.type) {
    case "hello": {
      if (session.greeted) return;
      session.greeted = true;
      const account =
        message.key === null
          ? undefined
          : game.findByKeyHash(hashKey(message.key));
      session.account = account ?? null;
      if (account) account.lastSeenAt = Date.now();
      send(socket, {
        type: "session",
        accountId: account?.id ?? null,
        keyRejected: message.key !== null && !account,
      });
      return;
    }
    case "join": {
      session.greeted = true;
      if (!session.account) {
        if (game.accountCount() >= MAX_ACCOUNTS) {
          reply(socket, "join", "The game is full.");
          return;
        }
        const { account, key } = createAccount();
        session.account = account;
        send(socket, { type: "session", accountId: account.id, key });
      }
      reply(socket, "join", game.join(session.account));
      return;
    }
    case "place":
      if (!session.account) {
        reply(socket, "place", NO_ACCOUNT);
        return;
      }
      game.queuePlacement(session.account, message.cells, (reason) =>
        reply(socket, "place", reason),
      );
      return;
    case "removeCells":
      if (!session.account) {
        reply(socket, "removeCells", NO_ACCOUNT);
        return;
      }
      game.queueRemoveCells(session.account, (reason) =>
        reply(socket, "removeCells", reason),
      );
      return;
    case "wall":
      if (!session.account) {
        reply(socket, "wall", NO_ACCOUNT);
        return;
      }
      game.queueWall(session.account, message, message.remove, (reason) =>
        reply(socket, "wall", reason),
      );
      return;
    case "name": {
      if (!session.account) {
        reply(socket, "name", NO_ACCOUNT);
        return;
      }
      const name = sanitizePlayerName(message.name);
      if (name === null) {
        reply(socket, "name", BAD_NAME);
        return;
      }
      game.rename(session.account, name);
      reply(socket, "name", null);
      return;
    }
  }
}

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server,
  path: "/ws",
  perMessageDeflate: { threshold: 1024 },
});

wss.on("connection", (socket) => {
  const session: Session = { account: null, greeted: false };
  sessions.set(socket, session);
  socket.on("close", () => sessions.delete(socket));
  socket.on("message", (data, isBinary) => {
    if (isBinary) return;
    const message = parseClientMessage(data.toString());
    if (message) handle(socket, session, message);
  });
});

function broadcast(): void {
  const { board } = game;
  const cells = Buffer.from(
    board.cells.buffer,
    board.cells.byteOffset,
    board.cells.byteLength,
  );
  const mats = game.mats();
  const walls = game.walls();
  for (const [socket, session] of sessions) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    send(socket, {
      type: "state",
      generation: game.generation,
      width: board.width,
      height: board.height,
      mats,
      walls,
      you: session.account ? game.status(session.account) : null,
    });
    socket.send(cells);
  }
}

function broadcastLeaderboard(): void {
  const { entries, players, ranks } = game.leaderboard(LEADERBOARD_SIZE);
  for (const [socket, session] of sessions) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    const { account } = session;
    const rank = account ? ranks.get(account.id) : undefined;
    send(socket, {
      type: "leaderboard",
      entries,
      players,
      you:
        account && rank !== undefined
          ? { rank, liveCells: account.liveCells }
          : null,
    });
  }
}

function persist(): void {
  const now = Date.now();
  for (const { account } of sessions.values()) {
    if (account) account.lastSeenAt = now;
  }
  for (const { action, accountId } of takeAdminActions(db)) {
    const account = game.getAccount(accountId);
    if (action === "free" && account) game.free(account);
  }
  saveGame(db, game);
}

function shutdown(): void {
  persist();
  db.close();
  process.exit(0);
}

persist();
setInterval(() => {
  game.tick();
  broadcast();
}, TICK_MS);
setInterval(persist, SAVE_MS);
setInterval(broadcastLeaderboard, LEADERBOARD_MS);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, () => {
  console.log(`life-multi server listening on http://localhost:${PORT}`);
});
