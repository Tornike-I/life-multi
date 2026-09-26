# Rulebook

How everything in life-multi interacts, including every formula the server uses. The tunable constants live in [`packages/shared/src/rules.ts`](packages/shared/src/rules.ts); this file must be updated in the same change as any rule or constant.

## 1. Time

The world advances in **ticks**, one every `TICK_MS` = 100 ms (10 ticks per second). Each tick runs these steps in order:

1. **Step** the board one generation (§3, §4).
2. **Apply placements and removals** that arrived since the last tick, in arrival order (§8).
3. **Update players**: live cell counts, smoothing, mat growth and shrinking, and inventory accrual (§5–§7, §9).
4. **Broadcast** the new state to every connected client.

`t` below is the board's generation number. Stepping turns generation `t` into generation `t + 1`.

## 2. Board

- `BOARD_SIZE` × `BOARD_SIZE` = 512 × 512 squares.
- The board is a **torus**: the right edge neighbors the left edge and the top neighbors the bottom. This applies to cells and to mats.
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
P_p(t) = max( L_p(t − LIVE_PEAK_TICKS + 1), …, L_p(t) )      the peak of the last 30 ticks
S_p(t) = max( P_p(t), S_p(t−1) · LIVE_SMOOTHING_DECAY )     S_p = 0 for a new account
```

`S` rises immediately when a player gains cells. Taking the peak first means anything whose cell count repeats within `LIVE_PEAK_TICKS` = 30 ticks (3 s), such as oscillators and spaceships, holds `S` perfectly steady instead of dipping between its peaks. Once the window no longer contains a higher count, `S` falls by 0.5% per tick (`LIVE_SMOOTHING_DECAY` = 0.995), a half-life of `ln 0.5 / ln 0.995` ≈ 138 ticks ≈ 13.8 s. The allowances below use `S`, not `L`. The peak window starts empty whenever the server restarts.

## 6. Allowances

```
Mat area allowance   A_p = floor( BASE_MAT_SIDE² + MAT_AREA_PER_LIVE_CELL · S_p )       = floor(64 + 2 · S_p)
Mat side allowance   s*_p = floor( √A_p )
Inventory cap        C_p = floor( BASE_INVENTORY_CAP + INVENTORY_CAP_PER_LIVE_CELL · S_p ) = floor(12 + 0.1 · S_p)
```

| Smoothed live cells `S` | Mat area `A` | Mat side `s*` | Inventory cap `C` |
| ----------------------- | ------------ | ------------- | ----------------- |
| 0                       | 64           | 8             | 12                |
| 8.5                     | 81           | 9             | 12                |
| 50                      | 164          | 12            | 17                |
| 150                     | 364          | 19            | 27                |
| 240                     | 544          | 23            | 36                |
| 616                     | 1296         | 36            | 73                |

**Example milestone:** a Gosper glider gun has 36 cells and a 36 × 9 bounding box. It needs a mat side of at least 36, so `A ≥ 1296`, which requires `S ≥ 616`. Placing it in one group needs `C ≥ 36`, which requires `S ≥ 240`.

## 7. Inventory

- A new account starts with `I = STARTING_INVENTORY` = 12.
- Every tick, while the player has a mat (online or not):

  ```
  if I < C:  I = min( C, I + TICK_MS / ACCRUAL_MS )      = I + 0.025, i.e. 1 cell every 4 s
  ```

  If `I ≥ C` (for example after `C` dropped), `I` stays where it is: it is never reduced, it just stops growing.

- Placing `n` cells sets `I = I − n`. Only whole cells can be placed: the usable amount is `floor(I)`.
- **Indicator:** the inventory ring shows the progress toward the next whole cell, `I − floor(I)`, and is full while `I ≥ C`.

## 8. Placement

Players stage squares on their own screen, then commit them as one **group** of at most `MAX_CELLS_PER_PLACE` = 256 squares. Coordinates wrap around the board, and squares repeated in a group count once.

A group is applied at step 2 of the next tick, after the board has stepped, and is **accepted only if all** of these hold at that moment:

1. The player has a mat.
2. Every square is inside the player's own mat (§9).
3. `1 ≤ n ≤ floor(I)`, where `n` is the number of distinct squares.
4. Every square is dead.

If accepted, every square becomes alive in the player's color and `I` drops by `n`. Otherwise **nothing** is placed, nothing is spent, and the player is told why.

### Removing your cells

A player with a mat can remove all their own cells from it at once. Like a placement, this happens at step 2 of the next tick. Every square that is inside the player's mat and alive in the player's color becomes dead. Other players' cells on the mat and the player's own cells outside it are left alone. Removed cells are not refunded to `I`. The player's live count `L` drops right away, and `S` falls as described in §5.

## 9. Mats

A mat is the only area where its owner may place cells. It limits placement only: cells of any color can live and be born inside any mat.

### Shape

A mat is a square of side `s`, centered on the player's home square `(hx, hy)`:

```
x = (hx − floor(s / 2)) mod BOARD_SIZE
y = (hy − floor(s / 2)) mod BOARD_SIZE
```

It covers the `s × s` squares starting at `(x, y)` and wraps across the board edges. A square `(px, py)` is inside when `(px − x) mod BOARD_SIZE < s` and `(py − y) mod BOARD_SIZE < s`.

Because `floor(s / 2)` only changes when `s` becomes even, growing by one square adds a column on the right and a row at the bottom when the new side is odd, and a column on the left and a row at the top when it's even. The mat stays centered on home to within half a square.

**Gap:** mats must stay at least `MAT_GAP` = 3 free squares apart. Exactly: two mats are too close when their column ranges come within 3 squares of each other **and** their row ranges do too, measured around the torus. Ranges `[x₁−3, x₁+s₁+3)` and `[x₂, x₂+s₂)` overlap on a ring of size `BOARD_SIZE`, and likewise for rows. So mats that are near each other only diagonally are also too close.

### Joining

Joining gives a player a `BASE_MAT_SIDE` × `BASE_MAT_SIDE` (8 × 8) mat:

- Candidates are the positions `(x, y)` where an 8 × 8 mat satisfies the gap rule and both `x` and `y` are multiples of `MAT_SPOT_STRIDE` = 8. If there are none, every position that satisfies the gap rule is a candidate.
- **Empty board:** pick the candidate whose center is closest to the board's center.
- **Otherwise:** pick the candidate whose center is farthest from the nearest other mat's center (Euclidean distance on the torus).
- Ties go to the first candidate in scan order (top row first, left to right).
- The **home square** is `((x + 4) mod BOARD_SIZE, (y + 4) mod BOARD_SIZE)`.
- If there is no candidate, joining fails until space frees up.

### Growing and shrinking

At step 3 of every tick, players are updated in order of account id. For a mat of side `s` with side allowance `s*_p` (§6):

- If `s*_p < s`, the mat **shrinks** to side `s*_p` at once.
- If `s*_p > s`, the mat **grows** one square at a time toward `s*_p`, stopping before the first size that would break the gap rule with another mat. Its side never exceeds `BOARD_SIZE`. A blocked mat keeps its allowance and grows as soon as there's room.
- Shrinking never removes cells; only the area where the owner can place changes.

**Indicator:** the mat ring shows the progress from the current side toward the next one, using the unfloored allowance so it moves smoothly:

```
progress = clamp( (BASE_MAT_SIDE² + MAT_AREA_PER_LIVE_CELL · S_p − s²) / (2s + 1), 0, 1 )
```

The ring turns amber while the mat is blocked, meaning `s*_p > s` after this tick's growth.

## 10. Accounts

- Watching needs no account. **Joining** creates a guest account with a random secret key, stored in the player's browser. The server stores only its SHA-256 hash. The same browser gets the same account and color back.
- An account's id is its color and never changes.
- Mats, inventory and colors are kept forever, including while the player is offline.
- **Names:** an account may set a display name at any time, as often as it likes. Names are not unique; the player's id and color are what identify them. The server takes the name it is given, removes zero-width and bidirectional characters, turns every other run of whitespace or control characters into one space, and trims it. What is left has to be 1 to `MAX_PLAYER_NAME_LENGTH` = 20 code points, or the rename is rejected. An account with no name shows as `player <id>`.
- **Admin free:** an admin can release an account's mat (`npm run admin -- free <id>`). The mat and home square are removed, cells already on the board stay, and the account keeps its color and inventory. Joining again gives a new spot (§9).

## 11. View

What a player's screen may show. For now the client applies these limits; the server still sends the whole board, so they aren't enforced yet.

- **Camera:** it can be moved anywhere. The board is a torus, so panning past an edge shows the other side again.
- **Zoom** is measured in squares across the longer side of the board view. It ranges from `MAX_VIEW_SQUARES` = 128 (most zoomed out) to `MIN_VIEW_SQUARES` = 12 (most zoomed in). The camera starts at `DEFAULT_VIEW_SQUARES` = 48 centered on the board, and jumps to the player's mat when they get one. On touch screens it uses `TOUCH_VIEW_SQUARES` = 24 instead, so squares are big enough to tap.
- **Minimap:** it covers the player's own territory: the smallest rectangle on the torus that contains their mat and every live cell of their color. It's measured over the last `MINIMAP_HISTORY_TICKS` = 50 board updates the player's client received (5 s): a square counts if it held the mat or one of their cells in any of them. Something oscillating at the edge therefore can't make the minimap grow and shrink, and after a real loss it shrinks once those squares have been empty for the whole window. Columns and rows are measured separately, each span being everything outside the longest run of columns (rows) with none of those squares. Each span is padded by `MINIMAP_PADDING` = 16 squares on both sides and widened to at least `MINIMAP_MIN_SQUARES` = 64, but never beyond the board. Inside that area the minimap shows every live cell in its owner's color, including other players' cells, plus the player's mat and the camera's view. Clicking it moves the camera there.

## 12. Leaderboard

Every `LEADERBOARD_MS` = 2000 ms the server ranks players and sends each client the top `LEADERBOARD_SIZE` = 10.

- An account is **ranked** if it has a mat or at least one live cell. Freed accounts with no cells left are not ranked.
- Ranking is by live cells (§5), highest first, breaking ties by account id so the order is stable. Tied players **share a rank**, and the next rank after a tie skips the places the tie used: 1, 2, 2, 4.
- Live cells here are the raw count from this tick, not the smoothed value used for allowances (§6), so the order moves as patterns grow and collapse.
- Each client also receives its own rank and the number of ranked players, whether or not it made the top 10.

## Constants

| Constant                      | Value   | Used in |
| ----------------------------- | ------- | ------- |
| `TICK_MS`                     | 100 ms  | §1, §7  |
| `BOARD_SIZE`                  | 512     | §2, §9  |
| `LIVE_SMOOTHING_DECAY`        | 0.995   | §5      |
| `LIVE_PEAK_TICKS`             | 30      | §5      |
| `BASE_MAT_SIDE`               | 8       | §6, §9  |
| `MAT_AREA_PER_LIVE_CELL`      | 2       | §6, §9  |
| `BASE_INVENTORY_CAP`          | 12      | §6      |
| `INVENTORY_CAP_PER_LIVE_CELL` | 0.1     | §6      |
| `STARTING_INVENTORY`          | 12      | §7      |
| `ACCRUAL_MS`                  | 4000 ms | §7      |
| `MAX_CELLS_PER_PLACE`         | 256     | §8      |
| `MAT_GAP`                     | 3       | §9      |
| `MAT_SPOT_STRIDE`             | 8       | §9      |
| `MAX_ACCOUNTS`                | 65 535  | §2, §10 |
| `MAX_VIEW_SQUARES`            | 128     | §11     |
| `MIN_VIEW_SQUARES`            | 12      | §11     |
| `DEFAULT_VIEW_SQUARES`        | 48      | §11     |
| `TOUCH_VIEW_SQUARES`          | 24      | §11     |
| `MINIMAP_PADDING`             | 16      | §11     |
| `MINIMAP_MIN_SQUARES`         | 64      | §11     |
| `MINIMAP_HISTORY_TICKS`       | 50      | §11     |
| `MAX_PLAYER_NAME_LENGTH`      | 20      | §10     |
| `LEADERBOARD_SIZE`            | 10      | §12     |
| `LEADERBOARD_MS`              | 2000 ms | §12     |
