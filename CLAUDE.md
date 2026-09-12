# Working on life-multi

These rules apply to everyone who works on this repo, whether you're a person or an agent. For what the project is and how to run it, see `README.md`.

## Every change goes through a pull request

- Never commit or push to `main` directly. That includes typo fixes, docs, and edits to this file.
- Start each change on a new branch from the latest `main`:
  ```sh
  git fetch origin
  git switch -c <type>/<short-name> origin/main   # type: feat, fix, docs, chore, refactor, test
  ```
- Keep each PR to one concern. If you find an unrelated problem along the way, open a separate branch for it or mention it in the PR description.
- Open the PR with `gh pr create`. In the description, say what changed, why, and **how you tested it**: the commands you ran and what you checked by hand.
- A PR merges only after the `check` CI job passes and one reviewer has approved it. The repo owner may merge their own PRs without an approval. GitHub enforces these rules on `main`, allows only squash merges, and deletes the branch after merging.
- Once a PR has been reviewed, push new commits for any changes. Don't force-push over commits the reviewer has already seen.

### Agents

- Open the PR, then stop. Never merge a PR, even your own, unless the repo owner tells you to merge that specific PR.
- Don't change repo settings, branch protection, CI workflows, or secrets unless someone asked for that change.
- If you couldn't run a check (for example, you couldn't start the dev server), say so in the PR. Don't describe untested work as tested.
- If several agents work at the same time, give each one its own git worktree (see below) so they don't overwrite each other's changes.

## Testing a branch

### 1. Run the CI checks locally before you push

These are the same checks `.github/workflows/ci.yml` runs on every PR:

```sh
npm ci                 # run this when package-lock.json changed or on a fresh checkout
npm run format:check   # if this fails, run `npm run format`
npm run lint
npm run typecheck
npm test
npm run build
```

### 2. Try it in the running game

If a change affects gameplay, the server, the client, or the protocol, passing tests isn't enough. Run `npm run dev`, open http://localhost:5173 in **two** tabs, and check that what you do in one tab shows up in the other.

### 3. Check CI on the PR

```sh
gh pr checks <number> --watch
```

Don't merge while CI is failing.

### Testing someone else's branch

Use a separate worktree so your own checkout stays untouched:

```sh
git fetch origin
git worktree add ../life-multi-pr-<number> origin/<branch>
cd ../life-multi-pr-<number>
npm ci
# run the checks above, then npm run dev
cd -
git worktree remove ../life-multi-pr-<number>
```

Only one checkout can run `npm run dev` at a time. The Vite proxy in `apps/client/vite.config.ts` always points at port 3001, so stop the other dev server first.

## Code conventions

- Game rules and the wire protocol belong in `packages/shared`. The server and client import them from `@life-multi/shared` and must not keep their own copies.
- The server decides the game state. The client draws the board and sends player actions; it never changes the board itself.
- If you change the protocol, update `protocol.ts`, its tests, the server, and the client in the same PR.
- New logic in `packages/shared` needs a Vitest test file next to it (`*.test.ts`).
- The server runs TypeScript directly through Node's type stripping, so use only syntax that can be erased (`erasableSyntaxOnly`). That rules out `enum`, `namespace`, and constructor parameter properties.
- Pin dependencies to exact versions (`.npmrc` sets `save-exact`) and commit `package-lock.json`. Pin GitHub Actions to a full commit SHA and add the version as a comment.
- Write commit messages with a short imperative subject line, followed by a body that explains why the change was made.
