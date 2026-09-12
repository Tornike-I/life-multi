import { describe, expect, it } from "vitest";
import { MAX_CELLS_PER_PLACE, parseClientMessage } from "./protocol.ts";

describe("parseClientMessage", () => {
  it("accepts a place message", () => {
    expect(
      parseClientMessage('{"type":"place","cells":[[1,2],[-3,4]]}'),
    ).toEqual({
      type: "place",
      cells: [
        [1, 2],
        [-3, 4],
      ],
    });
  });

  it.each([
    "not json",
    "null",
    '{"type":"other","cells":[]}',
    '{"type":"place","cells":"nope"}',
    '{"type":"place","cells":[[1]]}',
    '{"type":"place","cells":[[1.5,2]]}',
  ])("rejects %s", (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });

  it("rejects placements over the size limit", () => {
    const cells = Array.from({ length: MAX_CELLS_PER_PLACE + 1 }, () => [0, 0]);
    expect(
      parseClientMessage(JSON.stringify({ type: "place", cells })),
    ).toBeNull();
  });
});
