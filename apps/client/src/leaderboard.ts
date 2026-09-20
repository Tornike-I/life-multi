import {
  type LeaderboardEntry,
  type LeaderboardMessage,
  MAX_PLAYER_NAME_LENGTH,
} from "@life-multi/shared";
import { colorFor } from "./render.ts";

export interface Leaderboard {
  dialog: HTMLDialogElement;
  open(): void;
  update(message: LeaderboardMessage): void;
  showNameResult(ok: boolean, reason: string | undefined): void;
}

export interface LeaderboardOptions {
  accountId: () => number | null;
  currentName: () => string | null;
  onRename: (name: string) => void;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function displayName(id: number, name: string | null): string {
  return name ?? `player ${id}`;
}

export function createLeaderboard(options: LeaderboardOptions): Leaderboard {
  const dialog = byId<HTMLDialogElement>("leaderboard");
  const list = byId<HTMLOListElement>("leaderboard-list");
  const rankEl = byId("leaderboard-rank");
  const messageEl = byId("leaderboard-message");
  const form = byId<HTMLFormElement>("name-form");
  const nameInput = byId<HTMLInputElement>("player-name");

  let latest: LeaderboardMessage | null = null;

  nameInput.maxLength = MAX_PLAYER_NAME_LENGTH;

  function row(entry: LeaderboardEntry): HTMLLIElement {
    const item = document.createElement("li");
    item.classList.toggle("you", entry.id === options.accountId());

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = `#${entry.rank}`;

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = colorFor(entry.id);

    const who = document.createElement("span");
    who.className = "who";
    who.textContent = displayName(entry.id, entry.name);

    const cells = document.createElement("span");
    cells.className = "cells";
    cells.textContent = String(entry.liveCells);

    item.append(rank, swatch, who, cells);
    return item;
  }

  function render(): void {
    if (!latest) return;
    list.replaceChildren(...latest.entries.map(row));
    if (latest.entries.length === 0) {
      rankEl.textContent = "Nobody has joined yet.";
      return;
    }
    const players = `${latest.players} ${latest.players === 1 ? "player" : "players"}`;
    rankEl.textContent = latest.you
      ? `You are #${latest.you.rank} of ${players}, with ${latest.you.liveCells} live cells.`
      : players;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    options.onRename(nameInput.value);
  });

  return {
    dialog,
    open() {
      form.hidden = options.accountId() === null;
      nameInput.value = options.currentName() ?? "";
      messageEl.textContent = "";
      render();
      dialog.showModal();
    },
    update(message) {
      latest = message;
      if (dialog.open) render();
    },
    showNameResult(ok, reason) {
      messageEl.textContent = ok
        ? "Name saved."
        : (reason ?? "That name didn't work.");
    },
  };
}
