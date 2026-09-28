import { expect, test } from "bun:test";
import { layout } from "../src/build/layout";
import { emitMarkdown } from "../src/build/md";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fallbackTheme } from "../src/theme/types";
import { docOf, meta } from "./helpers";

const out = mkdtempSync(join(tmpdir(), "dtr-md-"));
const theme = () => ({ ...fallbackTheme(), cover: { enabled: true, fields: ["title", "updated", "client"] }, toc: { enabled: true, depth: 1 } });

test("proposal を Markdown に出力する", () => {
  const d = docOf(`kind: proposal\n${meta("  client: 架空商事\n")}sections:
  - id: bg
    title: 背景
    body:
      - "検索に30分かかる{{cite:s}}。詳細は{{ref:effects}}と{{ref:cost}}。"
      - { table: effects }
  - id: cost
    title: 費用
    body: [{ table: costs }]
tables:
  - { id: effects, title: 導入効果, columns: [項目, 現状], rows: [[検索, 30]] }
costs:
  - { id: biz, item: ビジネスプラン, unit_price: 1200, qty: 20 }
  - { id: onb, item: 支援, unit_price: 0, qty: 1 }
schedule:
  - { date: 2026-10-05, task: 契約 }
sources:
  - { id: s, url: "https://example.com/r", title: 調査, accessed: 2026-09-01 }
`);
  expect(emitMarkdown(layout(d, theme(), {}), theme(), out, d.name)).toMatchSnapshot();
});

test("terms: 条番号と項番号", () => {
  const d = docOf(`kind: terms\n${meta("  effective: 2026-10-01\n")}articles:
  - { id: a, title: 定義, clauses: [一つだけ] }
  - { id: b, title: 料金, clauses: ["{{ref:a}}に従う", 二項] }
supplement: 2026年10月1日 施行
`);
  const md = emitMarkdown(layout(d, theme(), {}), theme(), out, d.name);
  expect(md).toContain("## 第2条（料金）\n\n1. 第1条に従う\n2. 二項");
  expect(md).toContain("## 目次\n\n- 第1条（定義）\n- 第2条（料金）\n- 附則");
});
