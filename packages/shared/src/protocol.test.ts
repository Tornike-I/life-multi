import { describe, expect, it } from "vitest";
import {
  MAX_CELLS_PER_PLACE,
  MAX_KEY_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  parseClientMessage,
  sanitizePlayerName,
} from "./protocol.ts";

describe("parseClientMessage", () => {
  it.each([
    ['{"type":"hello","key":null}', { type: "hello", key: null }],
    ['{"type":"hello","key":"abc"}', { type: "hello", key: "abc" }],
    ['{"type":"join"}', { type: "join" }],
    [
      '{"type":"place","cells":[[1,2],[-3,4]]}',
      {
        type: "place",
        cells: [
          [1, 2],
          [-3, 4],
        ],
      },
    ],
    ['{"type":"removeCells"}', { type: "removeCells" }],
    ['{"type":"name","name":"Ada"}', { type: "name", name: "Ada" }],
    ['{"type":"name","name":"  "}', { type: "name", name: "  " }],
  ])("accepts %s", (raw, expected) => {
    expect(parseClientMessage(raw)).toEqual(expected);
  });

  it.each([
    "not json",
    "null",
    '{"type":"other"}',
    '{"type":"hello"}',
    '{"type":"hello","key":7}',
    '{"type":"place","cells":"nope"}',
    '{"type":"place","cells":[[1]]}',
    '{"type":"place","cells":[[1.5,2]]}',
    '{"type":"resize","mat":{"x":1,"y":2,"w":10,"h":8}}',
    '{"type":"name"}',
    '{"type":"name","name":42}',
  ])("rejects %s", (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });

  it("rejects oversized keys and placements", () => {
    const key = "k".repeat(MAX_KEY_LENGTH + 1);
    expect(
      parseClientMessage(JSON.stringify({ type: "hello", key })),
    ).toBeNull();

    const cells = Array.from({ length: MAX_CELLS_PER_PLACE + 1 }, () => [0, 0]);
    expect(
      parseClientMessage(JSON.stringify({ type: "place", cells })),
    ).toBeNull();

    const name = "n".repeat(201);
    expect(
      parseClientMessage(JSON.stringify({ type: "name", name })),
    ).toBeNull();
  });
});

describe("sanitizePlayerName", () => {
  it.each([
    ["Ada", "Ada"],
    ["  Ada  ", "Ada"],
    ["Ada\tLovelace", "Ada Lovelace"],
    ["Ada   Lovelace", "Ada Lovelace"],
    [" Ada ", "Ada"],
    ["Ada​Lovelace", "AdaLovelace"],
    ["A‮da", "Ada"],
    ["小林", "小林"],
  ])("cleans %j into %j", (raw, expected) => {
    expect(sanitizePlayerName(raw)).toBe(expected);
  });

  it.each(["", "   ", "\n\t", "​​"])("rejects %j", (raw) => {
    expect(sanitizePlayerName(raw)).toBeNull();
  });

  it("measures the limit in code points, not UTF-16 units", () => {
    const longest = "a".repeat(MAX_PLAYER_NAME_LENGTH);
    expect(sanitizePlayerName(longest)).toBe(longest);
    expect(sanitizePlayerName(longest + "a")).toBeNull();

    const emoji = "\u{1f600}".repeat(MAX_PLAYER_NAME_LENGTH);
    expect(emoji.length).toBe(MAX_PLAYER_NAME_LENGTH * 2);
    expect(sanitizePlayerName(emoji)).toBe(emoji);
  });
});
