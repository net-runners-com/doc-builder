import { expect, test } from "bun:test";
import { buildDoc } from "../src/parse/doc";
import { MIN, meta } from "./helpers";

const build = (src: string) => buildDoc("/tmp/dtr/x.yaml", src);
const ids = (d: ReturnType<typeof build>) => d.buildErrors.map((e) => e.checkId);

test("条・手順は連番で採番される", () => {
  const d = build(`kind: terms\n${meta("  effective: 2026-10-01\n")}articles:
  - { id: a, title: 定義, clauses: [x] }
  - { id: b, title: 料金, clauses: ["{{ref:a}}に従う"] }
`);
  expect(d.buildErrors).toEqual([]);
  expect([d.defs.a.label, d.defs.b.label]).toEqual(["第1条", "第2条"]);
  expect(d.expand(d.texts.find((t) => t.raw.includes("ref"))!.raw)).toBe("第1条に従う");
});

test("未定義参照・未定義フィールドは ref/resolve", () => {
  const d = build(`kind: terms\n${meta("  effective: 2026-10-01\n")}articles:
  - id: a
    title: 料金
    notice_days: 30
    clauses: ["{{ref:refund}}を除く", "{{notice_days}}日前", "{{nope}}"]
`);
  expect(d.buildErrors.map((e) => e.finding.message)).toEqual(['未定義の参照 "refund"', '未定義のフィールド "nope"']);
  expect(d.buildErrors[0].finding.loc).toMatchObject({ blockId: "a", line: 12 });
  expect(d.expand("{{notice_days}}日", d.data.articles[0])).toBe("30日");
});

test("異なる種類での ID 重複", () => {
  const d = build(MIN.guide + "tables:\n  - { id: intro, columns: [a], rows: [[1]] }\n");
  expect(ids(d)).toEqual(["ref/resolve"]);
  expect(d.buildErrors[0].finding.message).toContain("重複");
});

test("図は配置順、出典は引用順に採番", () => {
  const d = build(`kind: guide\n${meta()}sections:
  - id: s
    title: A
    body:
      - "{{fig:b}} と {{img:a}} {{cite:y}}"
      - quote: { source: x, text: 引用 }
images:
  - { id: a, path: a.png, alt: A, caption: "図{{n}} A" }
figures:
  - { id: b, type: diagram, source: "a -> b" }
sources:
  - { id: x, url: "https://e.x", title: X, accessed: 2026-01-01 }
  - { id: y, url: "https://e.y", title: Y, accessed: 2026-01-01 }
`);
  expect(d.buildErrors).toEqual([]);
  expect([d.defs.b.label, d.defs.a.label]).toEqual(["図1", "図2"]);
  expect([d.defs.y.label, d.defs.x.label]).toEqual(["[1]", "[2]"]);
  expect(d.expand(d.data.images[0].caption, d.data.images[0])).toBe("図2 A");
});

test("calc と calc/eval", () => {
  const d = build(`kind: proposal\n${meta("  client: C\n")}sections:
  - { id: s, title: 費用, body: [{ table: costs }] }
costs:
  - { id: a, item: A, unit_price: 1200, qty: 20 }
total: "{{calc:sum(costs, unit_price*qty)}}円"
schedule: []
`);
  expect(d.buildErrors).toEqual([]);
  expect(d.expand(d.data.total)).toBe("24,000円");
  const bad = build(MIN.guide.replace("body: 本文", 'body: "{{calc:1/0}}"'));
  expect(ids(bad)).toEqual(["calc/eval"]);
});

test("空ファイル・構文エラー・ルート配列は schema/valid", () => {
  for (const src of ["", "a: [1\n", "- 1\n"]) {
    const d = build(src);
    expect(ids(d)).toEqual(["schema/valid"]);
    expect(d.kind).toBeUndefined();
  }
});

test("未定義の表ブロックと引用出典", () => {
  const d = build(MIN.guide.replace("body: 本文", "body: [{ table: t }, { quote: { source: s, text: q } }]"));
  expect(d.buildErrors.map((e) => e.finding.message)).toEqual(['引用の出典 "s" が未定義です', '未定義の表 "t"']);
});

test("文の分割と文 ID（ブロック内の通し番号）", async () => {
  const { splitSentences } = await import("../src/parse/doc");
  const s = "一文目。「二文目！」三文目\n四文目";
  expect(splitSentences(s).map(([a, b]) => s.slice(a, b).trim())).toEqual(["一文目。", "「二文目！」", "三文目", "四文目"]);
  const d = build(`kind: terms\n${meta("  effective: 2026-10-01\n")}articles:
  - { id: fees, title: 料金, clauses: ["A です。B です。", "C です。"] }
`);
  expect(d.texts.filter((t) => t.blockId === "fees" && t.ptr.includes("clauses")).flatMap((t) => t.sentences.map((x) => x.id))).toEqual(["fees#1", "fees#2", "fees#3"]);
});
