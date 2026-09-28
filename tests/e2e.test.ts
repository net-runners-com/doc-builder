import { expect, test } from "bun:test";
import { join } from "node:path";
import { buildContent } from "../src/build/content";
import { loadConfig } from "../src/config";
import { loadDoc, runAll } from "../src/runner/run";

const root = join(import.meta.dir, "..");
const report = await runAll(root, { today: new Date("2026-09-28") });
const fails = (doc: string) => report.results.filter((r) => r.doc === doc && r.axis !== "review" && r.status === "fail").map((r) => r.checkId).sort();

// spec §11: samples/README.md の正解のうち、レビュー以外を検出する
test.each([
  ["service-guide", ["glossary/avoid", "link/local", "text/placeholder"]], // S1 S2 S3
  ["terms-of-service", ["glossary/avoid", "ref/resolve", "terms/notice-period"]], // T3 T2 T4
  ["setup-procedure", ["link/local"]], // P3
  ["setup-procedure-p2", ["schema/valid"]], // P2
  ["proposal", ["schedule/order"]], // R2
])("%s の不合格が正解どおり", (doc, expected) => {
  expect(fails(doc as string)).toEqual(expected as string[]);
});

test("テーマに不合格はない", () => {
  expect(fails("@themes")).toEqual([]);
});

test("T1/P1/R1 は構造上発生しない", () => {
  const config = loadConfig(root);
  const terms = loadDoc(root, config, join(root, "content/terms-of-service.yaml")).doc;
  expect(Object.values(terms.defs).filter((d) => d.type === "article").map((d) => d.label)).toEqual(
    Array.from({ length: 7 }, (_, i) => `第${i + 1}条`),
  );
  const proc = loadDoc(root, config, join(root, "content/setup-procedure.yaml")).doc;
  expect(Object.values(proc.defs).filter((d) => d.type === "step").map((d) => d.label)).toEqual(["手順1", "手順2", "手順3", "手順4"]);
  const { doc } = loadDoc(root, config, join(root, "content/proposal.yaml"));
  const costs = buildContent(doc, {}).nodes.find((n) => n.t === "table" && n.columns[0] === "項目" && n.columns[3] === "金額") as any;
  expect(costs.rows.at(-1)).toEqual(["合計", "", "", "24,000円"]);
});
