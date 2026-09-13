# Rulebook

How everything in life-multi interacts, including every formula the server uses. The tunable constants live in [`packages/shared/src/rules.ts`](packages/shared/src/rules.ts); this file must be updated in the same change as any rule or constant.

## 1. Time

The world advances in **ticks**, one every `TICK_MS` = 100 ms (10 ticks per second). Each tick runs these steps in order:

1. **Step** the board one generation (§3, §4).
2. **Apply placements** that arrived since the last tick, in arrival order (§8).
3. **Update players**: live cell counts, smoothing, allowances, mat shrinking and inventory accrual (§5–§7).
4. **Broadcast** the new state to every connected client.

`t` below is the board's generation number. Stepping turns generation `t` into generation `t + 1`.

## 2. Board

- `BOARD_SIZE` × `BOARD_SIZE` = 512 × 512 squares.
- The board is a **torus**: the right edge neighbors the left edge and the top neighbors the bottom.
- Each square is either **dead** or **alive with a color**. A color is a player's account id (1 to 65 535).
- The board starts empty.

## 3. Life

For a square `p`, let `N(p)` be the number of live squares among its 8 neighbors.

| Square is | Condition    | Next generation |
| --------- | ------------ | --------------- |
| dead      | `N = 3`      | born            |
| alive     | `N ∈ {2, 3}` | survives        |
| any       | otherwise    | dead            |

This is Conway's B3/S23. Color never affects whether a square lives or dies.

## 4. Color

- **Survival:** a surviving cell keeps its color.
- **Birth:** a newborn cell has exactly three live neighbors, its parents, taken in scan order NW, N, NE, W, E, SW, S, SE and called `a`, `b`, `c`:
  - If at least two parents share a color, the newborn takes that color.
  - If all three differ, it takes parent number `k = H mod 3` (0 → `a`, 1 → `b`, 2 → `c`), where

    ```
    H = fmix32( fmix32( fmix32(seed) XOR t ) XOR index )
    index = y · BOARD_SIZE + x
    t     = generation being stepped from
    ```

    `fmix32` is MurmurHash3's 32-bit finalizer. `seed` is a random 32-bit number chosen when the world is created and saved with it. Each parent is picked with probability ≈ 1/3, and the same world, tick and square always give the same result.

## 5. Live cells and smoothing

For player `p` at tick `t`, after placements:

```
L_p(t) = number of squares with color p
S_p(t) = max( L_p(t), S_p(t−1) · LIVE_SMOOTHING_DECAY )      S_p = 0 for a new account
```

With `LIVE_SMOOTHING_DECAY` = 0.995, `S` rises immediately when a player gains cells and falls by 0.5% per tick when they lose them. The half-life is `ln 0.5 / ln 0.995` ≈ 138 ticks ≈ 13.8 s. Both allowances below use `S`, not `L`, so oscillators and short losses don't make them jitter.

## 6. Allowances

```
Mat area allowance   A_p = floor( BASE_MAT_SIDE² + MAT_AREA_PER_LIVE_CELL · S_p )       = floor(64 + 2 · S_p)
Inventory cap        C_p = floor( BASE_INVENTORY_CAP + INVENTORY_CAP_PER_LIVE_CELL · S_p ) = floor(12 + 0.1 · S_p)
```

| Smoothed live cells `S` | Mat allowance `A` | Inventory cap `C` |
| ----------------------- | ----------------- | ----------------- |
| 0                       | 64 (8 × 8)        | 12                |
| 50                      | 164               | 17                |
| 150                     | 364               | 27                |
| 240                     | 544               | 36                |
| 450                     | 964               | 57                |

**Example milestone:** a Gosper glider gun has 36 cells and a 36 × 9 bounding box. Because of the proportions rule (§9) it needs a mat of at least 36 × 12 = 432 squares, so `A ≥ 432` requires `S ≥ 184`. Placing it in one group needs `C ≥ 36`, which requires `S ≥ 240`.

## 7. Inventory

- A new account starts with `I = STARTING_INVENTORY` = 12.
- Every tick, while the player has a mat (online or not):

  ```
  if I < C:  I = min( C, I + TICK_MS / ACCRUAL_MS )      = I + 0.025, i.e. 1 cell every 4 s
  ```

  If `I ≥ C` (for example after `C` dropped), `I` stays where it is: it is never reduced, it just stops growing.

- Placing `n` cells sets `I = I − n`. Only whole cells can be placed: the usable amount is `floor(I)`.

## 8. Placement

Players stage squares on their own screen, then commit them as one **group** of at most `MAX_CELLS_PER_PLACE` = 256 squares. Squares repeated in a group count once.

A group is applied at step 2 of the next tick, after the board has stepped, and is **accepted only if all** of these hold at that moment:

1. The player has a mat.
2. Every square is inside the player's own mat.
3. `1 ≤ n ≤ floor(I)`, where `n` is the number of distinct squares.
4. Every square is dead.

If accepted, every square becomes alive in the player's color and `I` drops by `n`. Otherwise **nothing** is placed, nothing is spent, and the player is told why.

## 9. Mats

A mat is the only area where its owner may place cells. It limits placement only: cells of any color can live and be born inside any mat.

### Shape

A mat is a rectangle `(x, y, w, h)` covering columns `x … x+w−1` and rows `y … y+h−1`. A mat never wraps across the board edge. It is valid for player `p` when:

| Rule         | Condition                                                    |
| ------------ | ------------------------------------------------------------ |
| On the board | `x ≥ 0`, `y ≥ 0`, `x + w ≤ BOARD_SIZE`, `y + h ≤ BOARD_SIZE` |
| Minimum side | `w ≥ MAT_MIN_SIDE` and `h ≥ MAT_MIN_SIDE` (4)                |
| Proportions  | `max(w, h) ≤ MAT_MAX_ASPECT · min(w, h)` (3)                 |
| Size         | `w · h ≤ A_p`                                                |
| Anchored     | contains the player's home square                            |
| Gap          | at least `MAT_GAP` = 3 free squares from every other mat     |

**Gap, exactly:** two mats are too close when their column ranges come within 3 squares of each other **and** their row ranges do too, measured around the torus. Ranges `[x₁−3, x₁+w₁+3)` and `[x₂, x₂+w₂)` overlap on a ring of size `BOARD_SIZE`, and likewise for rows. So mats that are near each other only diagonally are also too close.

### Joining

Joining gives a player a `BASE_MAT_SIDE` × `BASE_MAT_SIDE` (8 × 8) mat:

- Candidates are the 8 × 8 positions that satisfy the gap rule and whose `x` and `y` are both multiples of `MAT_SPOT_STRIDE` = 8. If there are none, every position that satisfies the gap rule is a candidate.
- **Empty board:** pick the candidate whose center is closest to the board's center.
- **Otherwise:** pick the candidate whose center is farthest from the nearest other mat's center (Euclidean distance on the torus).
- Ties go to the first candidate in scan order (top row first, left to right).
- The **home square** is `(x + 4, y + 4)`.
- If there is no candidate, joining fails until space frees up.

### Resizing

The player proposes any rectangle, and it is accepted if it satisfies every shape rule with the current `A_p`. A mat never moves away from its home square and never grows on its own.

### Shrinking

At step 3 of every tick, while `w · h > A_p`:

- Shrink the **longer** side (width if they are equal). If that side is already at `MAT_MIN_SIDE`, shrink the other side instead.
- Remove the edge column or row that is **farther from home**. If home is equally far from both edges, remove the right column or the bottom row.

## 10. Accounts

- Watching needs no account. **Joining** creates a guest account with a random secret key, stored in the player's browser. The server stores only its SHA-256 hash. The same browser gets the same account and color back.
- An account's id is its color and never changes.
- Mats, inventory and colors are kept forever, including while the player is offline.
- **Admin free:** an admin can release an account's mat (`npm run admin -- free <id>`). The mat and home square are removed, cells already on the board stay, and the account keeps its color and inventory. Joining again gives a new spot (§9).

## 11. View

What a player's screen may show. For now the client applies these limits; the server still sends the whole board, so they aren't enforced yet.

- **Camera:** it can be moved anywhere. The board is a torus, so panning past an edge shows the other side again.
- **Zoom** is measured in squares across the longer side of the board view. It ranges from `MAX_VIEW_SQUARES` = 128 (most zoomed out) to `MIN_VIEW_SQUARES` = 12 (most zoomed in). The camera starts at `DEFAULT_VIEW_SQUARES` = 48 centered on the board, and jumps to the player's mat when they get one.
- **Minimap:** it covers only the player's own territory: the smallest rectangle on the torus that contains their mat and every live cell of their color. Columns and rows are measured separately, each span being everything outside the longest run of columns (rows) with none of those squares. Each span is padded by `MINIMAP_PADDING` = 16 squares on both sides and widened to at least `MINIMAP_MIN_SQUARES` = 64, but never beyond the board. Inside that area the minimap shows every live cell in its owner's color, including other players' cells, plus the player's mat and the camera's view. Clicking it moves the camera there.

## Constants

| Constant                      | Value   | Used in |
| ----------------------------- | ------- | ------- |
| `TICK_MS`                     | 100 ms  | §1, §7  |
| `BOARD_SIZE`                  | 512     | §2, §9  |
| `LIVE_SMOOTHING_DECAY`        | 0.995   | §5      |
| `BASE_MAT_SIDE`               | 8       | §6, §9  |
| `MAT_AREA_PER_LIVE_CELL`      | 2       | §6      |
| `BASE_INVENTORY_CAP`          | 12      | §6      |
| `INVENTORY_CAP_PER_LIVE_CELL` | 0.1     | §6      |
| `STARTING_INVENTORY`          | 12      | §7      |
| `ACCRUAL_MS`                  | 4000 ms | §7      |
| `MAX_CELLS_PER_PLACE`         | 256     | §8      |
| `MAT_MIN_SIDE`                | 4       | §9      |
| `MAT_MAX_ASPECT`              | 3       | §9      |
| `MAT_GAP`                     | 3       | §9      |
| `MAT_SPOT_STRIDE`             | 8       | §9      |
| `MAX_ACCOUNTS`                | 65 535  | §2, §10 |
| `MAX_VIEW_SQUARES`            | 128     | §11     |
| `MIN_VIEW_SQUARES`            | 12      | §11     |
| `DEFAULT_VIEW_SQUARES`        | 48      | §11     |
| `MINIMAP_PADDING`             | 16      | §11     |
| `MINIMAP_MIN_SQUARES`         | 64      | §11     |
