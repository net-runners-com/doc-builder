import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { figureRender } from "../src/checks/builtin/figure";
import { loadConfig } from "../src/config";
import { renderFigures, renderOptions } from "../src/render";
import { resolveTheme } from "../src/theme/resolve";
import { defaultStrings } from "../src/wording";
import { MIN, REPO, docOf, messages } from "./helpers";

const workDir = mkdtempSync(join(tmpdir(), "dtr-render-"));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

const doc = (figs: string) =>
  docOf(
    MIN.guide.replace("body: 本文", 'body: "{{fig:flow}} {{fig:chart}}"') +
      "tables:\n  - { id: effects, columns: [項目, 現状, 導入後], rows: [[検索, 30, 5], [版管理, 10, 2]] }\n" +
      "figures:\n" + figs,
  );
const ok = '  - { id: flow, type: diagram, caption: c, source: "a -> b" }\n  - { id: chart, type: chart, caption: c, chart: bar, data: "{{ref:effects}}", x: 項目, y: [現状, 導入後] }\n';

test("D2 と Vega-Lite を SVG に描画する", async () => {
  // テーマの配色（文字色・背景色・D2 テーマ）を使う
  const { svgs, errors } = await renderFigures(doc(ok), workDir, renderOptions(resolveTheme(REPO, "default"), loadConfig(REPO), defaultStrings()));
  expect(errors).toEqual([]);
  expect(readFileSync(svgs.flow, "utf8")).toContain("<svg");
  expect(readFileSync(svgs.chart, "utf8")).toContain("<svg");
});

test("figure/render: 構文エラー・列不在・数値でない値", async () => {
  const bad =
    '  - { id: flow, type: diagram, caption: c, source: "a -> {" }\n' +
    '  - { id: chart, type: chart, caption: c, chart: bar, data: "{{ref:effects}}", x: 項目, y: [導入前] }\n';
  const m = await messages(figureRender, doc(bad), { workDir });
  expect(m[0]).toStartWith('図 "flow" を描画できません: D2:');
  expect(m[1]).toBe('図 "chart" を描画できません: 表 "effects" に列 "導入前" がありません');
  const nonNum = ok.replace("y: [現状, 導入後]", "y: [項目]");
  expect((await messages(figureRender, doc(nonNum), { workDir }))[0]).toContain("数値でない値");
});
