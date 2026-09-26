import { STARTING_INVENTORY } from "@life-multi/shared";
import { expect, it } from "vitest";
import { insertAccount, loadGame, openDatabase, saveGame } from "./db.ts";

it("reloads walls, dropping any whose account has no mat", () => {
  const db = openDatabase(":memory:");
  const id = insertAccount(db, "key-1", 0, STARTING_INVENTORY);
  const matless = insertAccount(db, "key-2", 0, STARTING_INVENTORY);
  const game = loadGame(db, () => 7);
  const player = game.getAccount(id)!;
  expect(game.join(player)).toBeNull();
  game.queueWall(player, player.home!, false, () => {});
  game.tick();
  saveGame(db, game);
  db.prepare("INSERT INTO walls (square, account_id) VALUES (0, ?)").run(
    matless,
  );

  expect(loadGame(db, () => 7).walls()).toEqual([{ id, ...player.home! }]);
  db.close();
});
