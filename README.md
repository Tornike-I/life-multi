# life-multi

A live, always-on multiplayer take on [Conway's Game of Life](https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life). One shared board evolves continuously on the server; players drop their own colored cells onto it to grow and defend territory.

> **Status:** early prototype. Players join with a guest account, get their own mat, and place cells on a shared 512×512 board.

## How it plays

Every player has a color and a square **mat**, the only area where they can place cells. Cells are earned over time and placed in groups. The more live cells of your color are on the board, the bigger your inventory gets and the further your mat grows out from its center. Two rings under the board show the next cell being earned and the progress toward the next mat size. Once placed, cells follow Conway's rules, and newborn cells take the majority color of their parents.

New players are offered a short tutorial before their account is created: a small practice board, simulated in the browser, that walks through Conway's rules, a few shapes, colors, and how live cells grow the inventory and mat. It can be replayed from the **Tutorial** button.

The **Leaderboard** ranks everyone by how many live cells of their color are on the board. Players can give themselves a name there; unnamed players show as `player <id>`.

The full rules and every formula are in **[rulebook.md](rulebook.md)**.

### Controls

| Action           | Input                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Tutorial         | Offered when you first click **Join**, or **Tutorial** at the top      |
| Zoom             | Mouse wheel, `+` / `-`, or pinch                                       |
| Pan              | Right or middle drag, WASD / arrow keys, or one-finger drag            |
| Jump to your mat | **My mat** or `H`                                                      |
| Minimap          | Click or drag it to move the camera                                    |
| Select squares   | Left click or drag on your mat, or tap squares                         |
| Place selection  | **Place** or Enter                                                     |
| Clear selection  | **Clear** or Esc                                                       |
| Blueprints       | **Blueprints** opens the library and editor; **Use** one to stamp it   |
| Stamp            | Click or tap to select its squares; **Rotate** or `R`, **Flip** or `F` |
| Stop stamping    | **Cancel blueprint** or Esc                                            |
| RLE patterns     | **Paste or copy RLE** in the blueprint editor, to import or export     |
| Leaderboard      | **Leaderboard** at the top; set your name there                        |

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

| Command                      | Does                                     |
| ---------------------------- | ---------------------------------------- |
| `npm run dev`                | Server and client with reload            |
| `npm test`                   | Unit tests (Vitest)                      |
| `npm run lint`               | ESLint                                   |
| `npm run typecheck`          | `tsc` across all workspaces              |
| `npm run format`             | Prettier                                 |
| `npm run build`              | Production build of the client           |
| `npm run admin -- list`      | List accounts, names, last seen and mats |
| `npm run admin -- free <id>` | Release an account's mat                 |

The server saves the board and accounts to `apps/server/data/life-multi.db` every few seconds. Set `DATABASE_PATH` to use a different file, and delete the file to start a fresh world.

## Hosting

The public game runs on an AWS Lightsail instance behind Caddy. Setup, deploys, rollbacks and backups are in **[docs/hosting.md](docs/hosting.md)**.

## Roadmap

- Rate limits on guest account creation and messages
- Pan/zoom and compact state updates for larger boards

## License

[MIT](LICENSE)
