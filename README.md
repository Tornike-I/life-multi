# life-multi

A live, always-on multiplayer take on [Conway's Game of Life](https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life). One shared board evolves continuously on the server; players drop their own colored cells onto it to grow and defend territory.

> **Status:** walking skeleton. One shared board ticks on the server, and clicking drops a glider that every connected player sees.

## Stack

TypeScript everywhere, in an npm workspaces monorepo:

| Path              | What                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Simulation engine and the client/server wire protocol                                                                       |
| `apps/server`     | Node + [`ws`](https://github.com/websockets/ws): authoritative tick loop, run via Node's built-in TypeScript type stripping |
| `apps/client`     | [Vite](https://vite.dev), plain TypeScript, `<canvas>` rendering                                                            |

## Development

Requires Node 22.12+ (see `.nvmrc`).

```sh
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/ws` to the game server on port 3001.

| Command             | Does                           |
| ------------------- | ------------------------------ |
| `npm run dev`       | Server and client with reload  |
| `npm test`          | Unit tests (Vitest)            |
| `npm run lint`      | ESLint                         |
| `npm run typecheck` | `tsc` across all workspaces    |
| `npm run format`    | Prettier                       |
| `npm run build`     | Production build of the client |

## Roadmap

- Player-owned colored cells and territory rules
- Compact binary state updates
- Hosting on AWS behind a custom domain

## License

[MIT](LICENSE)
