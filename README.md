# life-multi

A live, always-on multiplayer take on [Conway's Game of Life](https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life). One shared board evolves continuously on the server; players drop their own colored cells onto it to grow and defend territory.

> **Status:** early prototype. Players join with a guest account, get their own mat, and place cells on a shared 128×128 board.

## How it plays

Every player has a color and a rectangular **mat**, the only area where they can place cells. Cells are earned over time and placed in groups. The more live cells of your color are on the board, the bigger your mat and your inventory can get. Once placed, cells follow Conway's rules, and newborn cells take the majority color of their parents.

The full rules and every formula are in **[rulebook.md](rulebook.md)**.

## Stack

TypeScript everywhere, in an npm workspaces monorepo:

| Path              | What                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Simulation engine, mat rules, tunable constants and the client/server wire protocol                                                     |
| `apps/server`     | Node + [`ws`](https://github.com/websockets/ws): authoritative tick loop, state saved in SQLite (`node:sqlite`), run via type stripping |
| `apps/client`     | [Vite](https://vite.dev), plain TypeScript, `<canvas>` rendering                                                                        |

## Development

Requires Node 22.13+ (see `.nvmrc`).

```sh
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/ws` to the game server on port 3001.

| Command                      | Does                              |
| ---------------------------- | --------------------------------- |
| `npm run dev`                | Server and client with reload     |
| `npm test`                   | Unit tests (Vitest)               |
| `npm run lint`               | ESLint                            |
| `npm run typecheck`          | `tsc` across all workspaces       |
| `npm run format`             | Prettier                          |
| `npm run build`              | Production build of the client    |
| `npm run admin -- list`      | List accounts, last seen and mats |
| `npm run admin -- free <id>` | Release an account's mat          |

The server saves the board and accounts to `apps/server/data/life-multi.db` every few seconds. Set `DATABASE_PATH` to use a different file, and delete the file to start a fresh world.

## Roadmap

- Rate limits on guest account creation and messages
- Pan/zoom and compact state updates for larger boards
- Hosting on AWS behind a custom domain

## License

[MIT](LICENSE)
