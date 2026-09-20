import { bounds, type Cell, normalize } from "./blueprints.ts";

export const LIFE_RULE = "B3/S23";
export const MAX_RLE_INPUT = 20_000;

const MAX_DIMENSION = 512;
const MAX_CELLS = 4096;
const MAX_RUN = 100_000;
const EXPORT_LINE_LENGTH = 70;

const HEADER = /^x\s*=\s*\d+\s*,\s*y\s*=\s*\d+\s*(?:,\s*rule\s*=\s*(.+?))?$/i;
const NAME_COMMENT = /^#\s*N\s+(.+)$/i;
const RULE_COMMENT = /^#\s*r\s+(.+)$/;
const TOKEN = /\d*[a-zA-Z$!]/g;

export type RleResult =
  | { ok: true; name: string | null; rule: string | null; cells: Cell[] }
  | { ok: false; error: string };

export function isLifeRule(rule: string): boolean {
  const compact = rule.replace(/\s/g, "").toLowerCase();
  return compact === "b3/s23" || compact === "23/3";
}

export function parseRle(text: string): RleResult {
  if (text.length > MAX_RLE_INPUT) {
    return { ok: false, error: "That is too much text to read as a pattern." };
  }

  let name: string | null = null;
  let rule: string | null = null;
  let header = false;
  const body: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith("#")) {
      name ??= NAME_COMMENT.exec(line)?.[1].trim() ?? null;
      rule ??= RULE_COMMENT.exec(line)?.[1].trim() ?? null;
      continue;
    }
    if (!header) {
      const match = HEADER.exec(line);
      if (match) {
        header = true;
        rule = match[1]?.trim() ?? rule;
        continue;
      }
    }
    body.push(line);
  }

  const encoded = body.join("");
  if (!header && !/[$!]/.test(encoded)) {
    return {
      ok: false,
      error: "That doesn't look like RLE. Expected a line such as 3bo$2o!",
    };
  }
  const cells = decode(encoded);
  if (!Array.isArray(cells)) return cells;
  if (cells.length === 0) {
    return { ok: false, error: "That pattern has no live cells." };
  }
  return { ok: true, name, rule, cells: normalize(cells) };
}

export function toRle(cells: readonly Cell[], name?: string | null): string {
  const pattern = normalize(cells);
  const { w, h } = bounds(pattern);
  const lines = name ? [`#N ${name}`] : [];
  lines.push(`x = ${w}, y = ${h}, rule = ${LIFE_RULE}`);
  lines.push(...wrap(encode(pattern, w, h)));
  return lines.join("\n");
}

function decode(encoded: string): Cell[] | { ok: false; error: string } {
  const cells: Cell[] = [];
  let x = 0;
  let y = 0;
  let run = 0;

  for (const char of encoded) {
    if (/\s/.test(char)) continue;
    if (char >= "0" && char <= "9") {
      run = run * 10 + Number(char);
      if (run > MAX_RUN) {
        return { ok: false, error: "A run in that pattern is too long." };
      }
      continue;
    }

    const count = run === 0 ? 1 : run;
    run = 0;
    if (char === "!") break;
    if (char === "$") {
      y += count;
      x = 0;
    } else if (char === "b" || char === ".") {
      x += count;
    } else if (/[a-z*]/i.test(char)) {
      for (let i = 0; i < count; i++) cells.push([x + i, y]);
      x += count;
    } else {
      return { ok: false, error: `"${char}" isn't part of an RLE pattern.` };
    }

    if (x > MAX_DIMENSION || y > MAX_DIMENSION) {
      return { ok: false, error: "That pattern is too large." };
    }
    if (cells.length > MAX_CELLS) {
      return { ok: false, error: "That pattern has too many cells." };
    }
  }
  return cells;
}

function encode(cells: readonly Cell[], w: number, h: number): string {
  const alive = new Set(cells.map(([x, y]) => y * w + x));
  const rows: string[] = [];

  for (let y = 0; y < h; y++) {
    let row = "";
    let char = "";
    let run = 0;
    const flush = (): void => {
      if (run > 0) row += (run > 1 ? String(run) : "") + char;
    };
    for (let x = 0; x < w; x++) {
      const next = alive.has(y * w + x) ? "o" : "b";
      if (next === char) {
        run++;
      } else {
        flush();
        char = next;
        run = 1;
      }
    }
    if (char === "o") flush();
    rows.push(row);
  }
  return `${rows.join("$")}!`;
}

function wrap(body: string): string[] {
  const lines: string[] = [];
  let line = "";
  for (const token of body.match(TOKEN) ?? []) {
    if (line.length + token.length > EXPORT_LINE_LENGTH) {
      lines.push(line);
      line = "";
    }
    line += token;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}
