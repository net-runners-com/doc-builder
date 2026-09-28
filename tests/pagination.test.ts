import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze, type Mark } from "../src/build/pagination";
import { initProject } from "../src/init";
import { runAll } from "../src/runner/run";
import { writeFileSync } from "node:fs";
import { meta } from "./helpers";

const page = { height: 842, top: 71, bottom: 57 }; // 本文 71〜785
const mk = (kind: string, id: string, edge: "start" | "end", pg: number, y: number, keep = true): Mark => ({ kind, id, edge, keep, page: pg, y });

test("analyze: 分割・見出しの取り残し・余白", () => {
  const marks = [
    mk("heading", "h1", "start", 1, 700, false),
    mk("heading", "h1", "end", 1, 720, false),
    mk("table", "t1", "start", 2, 71),
    mk("table", "t1", "end", 2, 300),
    mk("group", "g", "start", 2, 700),
    mk("group", "g", "end", 3, 120),
  ];
  expect(analyze(page, marks, 0.35).map((i) => [i.type, i.id, i.page])).toEqual([
    ["split", "g", 2],
    ["orphan-heading", "h1", 1],
  ]);
  const gap = [mk("text", "", "start", 1, 300, false), mk("table", "t", "start", 2, 71), mk("table", "t", "end", 2, 400)];
  const r = analyze(page, gap, 0.35);
  expect(r.map((i) => [i.type, i.id, i.page])).toEqual([["gap", "t", 1]]);
  expect(r[0].ratio).toBeCloseTo((785 - 300) / 714, 2);
});

const root = mkdtempSync(join(tmpdir(), "dtr-page-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test.skipIf(!Bun.which("typst"))("実際に組版して、ページ末の表を分割しない", async () => {
  initProject(root);
  const rows = Array.from({ length: 8 }, (_, i) => `[項目${i}, ${i}]`).join(", ");
  const filler = Array.from({ length: 34 }, (_, i) => `      - 段落${i}。本文の行を増やして表をページ末に押し出します。`).join("\n");
  writeFileSync(
    join(root, "content", "long.yaml"),
    `kind: guide\n${meta()}sections:\n  - id: a\n    title: 前置き\n    body:\n${filler}\n      - { table: t }\ntables:\n  - { id: t, title: 表, columns: [名前, 値], rows: [${rows}] }\n`,
  );
  const r = await runAll(root, { paths: ["long"], render: true, layout: "simple" });
  const get = (id: string) => r.results.find((x) => x.checkId === id)!;
  expect(get("layout/breaks").status).toBe("pass");
  // 表を次ページに送った結果の余白は、閾値を超えれば警告として出る（出なくてもよい）
  expect(["pass", "warn"]).toContain(get("layout/gaps").status);
  mkdirSync(join(root, "tmp"), { recursive: true });
});
