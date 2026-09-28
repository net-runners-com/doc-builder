import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContent } from "../src/build/content";
import { emitMarkdown } from "../src/build/md";
import { registry } from "../src/page/components";
import type { ResolvedLayout } from "../src/page/types";
import { REPO, docOf, meta } from "./helpers";

const out = mkdtempSync(join(tmpdir(), "dtr-md-"));
const page = (over: Partial<ResolvedLayout> = {}): ResolvedLayout => ({
  page_numbers: { start_at: "front" },
  cover: [],
  front: [],
  back: [],
  header: [],
  footer: [],
  id: "t",
  errors: [],
  files: [],
  ...over,
});
const md = (d: ReturnType<typeof docOf>, p = page()) =>
  emitMarkdown(buildContent(d, {}), p, registry(REPO), { meta: d.data.meta, strings: d.strings }, out, d.name);

const proposal = () =>
  docOf(`kind: proposal\n${meta("  client: 架空商事\n")}sections:
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

test("proposal を Markdown に出力する", () => {
  expect(md(proposal(), page({ cover: [{ "meta-table": { fields: ["updated", "client"] } }], front: [{ toc: { depth: 1 } }] }))).toMatchSnapshot();
});

test("terms: 条番号と項番号", () => {
  const d = docOf(`kind: terms\n${meta("  effective: 2026-10-01\n")}articles:
  - { id: a, title: 定義, clauses: [一つだけ] }
  - { id: b, title: 料金, clauses: ["{{ref:a}}に従う", 二項] }
supplement: 2026年10月1日 施行
`);
  const s = md(d, page({ front: [{ toc: { depth: 1 } }] }));
  expect(s).toContain("## 第2条（料金）\n\n1. 第1条に従う\n2. 二項");
  expect(s).toContain("## 目次\n\n- 第1条（定義）\n- 第2条（料金）\n- 附則");
});

test("strings: で書式と固定文言を ID で上書きできる", () => {
  const d = docOf(`kind: procedure\n${meta("  audience: 管理者\n  estimated_time: 5分\n")}strings:
  number.step: "Step {n}"
  label.expected: 確認ポイント
purpose: 目的
steps:
  - { id: s1, title: 開く, actions: [開く。], expected: 開く。 }
`);
  const s = md(d);
  expect(s).toContain("### Step 1：開く");
  expect(s).toContain("**確認ポイント：** 開く。");
});
