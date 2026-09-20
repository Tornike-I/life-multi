import { describe, expect, it } from "vitest";
import { parsePattern } from "./blueprints.ts";
import { isLifeRule, MAX_RLE_INPUT, parseRle, toRle } from "./rle.ts";

const GLIDER = parsePattern([".#.", "..#", "###"]);

function cellsOf(text: string): unknown {
  const result = parseRle(text);
  return result.ok ? result.cells : result.error;
}

describe("parseRle", () => {
  it("reads a pattern with a header, a name and a rule", () => {
    const result = parseRle(
      "#N Glider\n#C the smallest spaceship\nx = 3, y = 3, rule = B3/S23\nbo$2bo$3o!",
    );
    expect(result).toEqual({
      ok: true,
      name: "Glider",
      rule: "B3/S23",
      cells: GLIDER,
    });
  });

  it("reads a body split across lines, as LifeWiki wraps it", () => {
    expect(cellsOf("x = 3, y = 3\nbo$\n2bo$\n3o!")).toEqual(GLIDER);
  });

  it("reads a body with no header", () => {
    expect(cellsOf("bo$2bo$3o!")).toEqual(GLIDER);
  });

  it("ignores anything after the terminator", () => {
    expect(cellsOf("bo$2bo$3o!\nsome trailing note")).toEqual(GLIDER);
  });

  it("accepts a missing terminator", () => {
    expect(cellsOf("bo$2bo$3o")).toEqual(GLIDER);
  });

  it("treats runs of blank rows and dead cells as offsets", () => {
    expect(cellsOf("2$2b2o!")).toEqual(parsePattern(["##"]));
  });

  it("treats letters other than b as live, as multi-state rules do", () => {
    expect(cellsOf("AbC!")).toEqual(parsePattern(["#.#"]));
  });

  it("picks the rule up from a #r comment", () => {
    const result = parseRle("#r 23/3\n3o!");
    expect(result.ok && result.rule).toBe("23/3");
  });

  it.each([
    ["not a pattern at all", /doesn't look like RLE/],
    ["x = 1, y = 1\n3b!", /no live cells/],
    ["x = 1, y = 1\n3o?o!", /isn't part of an RLE pattern/],
    [`${"9".repeat(12)}o!`, /run in that pattern is too long/],
    ["9000b9000bo!", /too large/],
  ])("rejects %j", (text, error) => {
    const result = parseRle(text);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(error);
  });

  it("rejects input past the size limit without parsing it", () => {
    const result = parseRle("o".repeat(MAX_RLE_INPUT + 1));
    expect(result.ok).toBe(false);
  });
});

describe("toRle", () => {
  it("round-trips a pattern back to the same cells", () => {
    expect(cellsOf(toRle(GLIDER, "Glider"))).toEqual(GLIDER);
  });

  it("writes the name, header and run counts", () => {
    expect(toRle(GLIDER, "Glider")).toBe(
      "#N Glider\nx = 3, y = 3, rule = B3/S23\nbo$2bo$3o!",
    );
  });

  it("omits the name line when there is no name", () => {
    expect(toRle(parsePattern(["##"]))).toBe(
      "x = 2, y = 1, rule = B3/S23\n2o!",
    );
  });

  it("keeps empty rows and drops trailing dead cells", () => {
    const sparse = parsePattern(["#..", "...", "..#"]);
    expect(toRle(sparse)).toBe("x = 3, y = 3, rule = B3/S23\no$$2bo!");
    expect(cellsOf(toRle(sparse))).toEqual(sparse);
  });

  it("wraps long lines without splitting a run from its tag", () => {
    const wide = parsePattern([".".repeat(200) + "#"]);
    const lines = toRle(wide).split("\n");
    expect(lines.every((line) => line.length <= 70)).toBe(true);
    expect(cellsOf(lines.join("\n"))).toEqual(wide);
  });
});

describe("isLifeRule", () => {
  it.each(["B3/S23", "b3/s23", "23/3", " B3 / S23 "])("accepts %j", (rule) => {
    expect(isLifeRule(rule)).toBe(true);
  });

  it.each(["B36/S23", "B3/S238", ""])("rejects %j", (rule) => {
    expect(isLifeRule(rule)).toBe(false);
  });
});
