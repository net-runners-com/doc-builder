import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approvalComplete, layoutData, layoutValid, wordingValid } from "../src/checks/builtin/layout";
import { loadConfig } from "../src/config";
import { registry } from "../src/page/components";
import { resolveLayout } from "../src/page/resolve";
import { validateLayout } from "../src/page/validate";
import { MIN, REPO, docOf, messages, scaffold } from "./helpers";

const reg = registry(REPO);
const v = (data: object) => validateLayout(data, reg, true).map((e) => e.message);

test("部品はすべて components/ から読み込まれる", () => {
  expect(Object.keys(reg).sort()).toEqual(
    ["approval", "box", "column", "company", "company-mini", "confidential", "grid", "history", "meta-table", "page-number", "pagebreak", "row", "spacer", "text", "title", "toc"],
  );
});

test("レイアウトの木の検証", () => {
  expect(v({ cover: ["nope"] })).toEqual(['未知の部品 "nope"']);
  expect(v({ header: ["toc"] })[0]).toStartWith("toc は header に置けません");
  expect(v({ cover: [{ title: { size: "big" } }] })[0]).toStartWith("title/size:");
  expect(v({ cover: [{ title: { children: [] } }] })).toEqual(["title は子要素（children）を持てません"]);
  expect(v({ cover: ["spacer"] })).toEqual(["spacer: 設定が必要です"]);
  expect(v({ cover: [{ row: { children: [{ "page-number": {} }] } }] })[0]).toStartWith("page-number は cover に置けません");
  expect(v({ cover: [{ a: 1, b: 2 }] })).toEqual(["要素は「部品名」か「部品名: 設定」の形で書いてください"]);
  expect(v({ footer: "x" })).toEqual(["footer は要素の配列で書いてください"]);
  expect(v({ covr: [] })[0]).toStartWith('未知の項目 "covr"');
});

test("同梱レイアウトは妥当で、extends は区画単位で置き換える", () => {
  for (const id of ["simple", "standard", "formal"]) expect(resolveLayout(REPO, id).errors).toEqual([]);
  const f = resolveLayout(REPO, "formal");
  const s = resolveLayout(REPO, "standard");
  expect(f.footer).toEqual(s.footer);
  expect(f.cover).not.toEqual(s.cover);
});

const root = mkdtempSync(join(tmpdir(), "dtr-layout-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, "reviews"));
scaffold(root);
mkdirSync(join(root, "wordings"));
const base = () => ({
  root,
  config: loadConfig(root),
  options: {},
  today: new Date("2026-09-28"),
  workDir: join(root, ".work"),
  probes: new Map(),
  fail: (message: string, loc = {}) => ({ message, loc: { doc: "@themes", ...loc } }),
});

test("layout/valid: 行番号つきでファイルごとに報告", async () => {
  writeFileSync(join(root, "layouts", "broken.yaml"), "page_numbers: { start_at: front }\ncover:\n  - title\n  - toc: { depth: 9 }\n");
  const f = (await layoutValid.run(base())) as any[];
  expect(f).toHaveLength(1);
  expect(f[0].message).toStartWith("layouts/broken.yaml: toc/depth:");
  expect(f[0].loc.line).toBe(4);
  rmSync(join(root, "layouts", "broken.yaml"));
});

test("wording/valid: 未知のキー・使えない変数・必須変数の欠落", async () => {
  writeFileSync(join(root, "wordings", "bad.json"), JSON.stringify({ "number.article": "Art.", "label.total": "{n}", nope: "x", extends: "casual" }));
  const m = ((await wordingValid.run(base())) as any[]).map((f) => f.message);
  expect(m).toEqual([
    'wordings/bad.json: "number.article" には {n} が必要です',
    'wordings/bad.json: "label.total" では {n} は使えません（使える変数: なし）',
    'wordings/bad.json: 未知の文字列キー "nope"',
  ]);
});

const layoutCtx = (id: string) => ({ root, layout: resolveLayout(root, id) });

test("layout/data: 部品が必要とするデータの欠落", async () => {
  const d = docOf(MIN.guide);
  const m = await messages(layoutData, d, layoutCtx("formal"));
  expect(m).toEqual([
    "cover/company: company.yaml がありません",
    "cover/meta-table: meta.number がありません",
    "cover/meta-table: meta.client がありません",
    "cover/approval: meta.approvals がありません",
    "front/history: meta.history がありません",
    "header/company-mini: company.yaml がありません",
  ]);
  expect(await messages(layoutData, d, layoutCtx("simple"))).toEqual([]);
});

test("approval/complete: 版 1.0 以上は全役割に氏名・日付が必要", async () => {
  const src = (ver: string) =>
    MIN.guide.replace("version: 1.0.0", `version: ${ver}`).replace("  owner: O\n", "  owner: O\n  approvals:\n    - { role: 承認 }\n    - { role: 確認, name: 佐藤, date: 2026-09-01, stamp: ./nope.png }\n");
  expect(await messages(approvalComplete, docOf(src("1.0.0")), layoutCtx("formal"))).toEqual([
    "版 1.0.0: 承認欄「承認」の氏名がありません",
    "版 1.0.0: 承認欄「作成」の記載がありません",
    "印影の画像が存在しません: ./nope.png",
  ]);
  expect(await messages(approvalComplete, docOf(src("0.9.0")), layoutCtx("formal"))).toEqual(["印影の画像が存在しません: ./nope.png"]);
});
