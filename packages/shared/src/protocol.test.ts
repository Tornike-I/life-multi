import { describe, expect, it } from "vitest";
import {
  MAX_CELLS_PER_PLACE,
  MAX_KEY_LENGTH,
  parseClientMessage,
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
  });
});
