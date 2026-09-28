import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContent } from "../src/build/content";
import { emitPdf, esc, inline } from "../src/build/typst";
import { loadCompany } from "../src/page/company";
import { registry } from "../src/page/components";
import { resolveLayout } from "../src/page/resolve";
import { resolveTheme } from "../src/theme/resolve";
import { docOf, meta } from "./helpers";

const dir = mkdtempSync(join(tmpdir(), "dtr-pdf-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const repo = join(import.meta.dir, "..");

test("エスケープとインライン変換", () => {
  expect(esc("1. x #1 $5 [a]")).toBe("1\\. x \\#1 \\$5 \\[a\\]");
  expect(inline("**強調** と [リンク](https://e.x) と #")).toBe('#strong[強調] と #link("https://e.x")[リンク] と \\#');
});

test.skipIf(!Bun.which("typst"))("全テーマ × 全レイアウトで PDF をコンパイルできる", async () => {
  const d = docOf(`kind: terms\n${meta("  effective: 2026-10-01\n  number: DOC-001\n  client: 架空商事\n  approvals:\n    - { role: 承認, name: 山田, date: 2026-09-01 }\n  history:\n    - { version: 0.9.0, date: 2026-09-01, note: 初版 }\n").replace("1.0.0", "0.9.0")}articles:
  - { id: a, title: 定義, clauses: ["本規約で「利用者」とは…", "**重要**: [リンク](https://e.x)"] }
  - { id: b, title: 料金, clauses: ["{{ref:a}}に従う"] }
`);
  const reg = registry(repo);
  const company = loadCompany(repo).company;
  for (const th of ["default", "dark-green", "sakura"])
    for (const ly of ["simple", "standard", "formal"]) {
      const theme = resolveTheme(repo, th);
      const page = resolveLayout(repo, ly, reg);
      expect(page.errors).toEqual([]);
      const out = await emitPdf(buildContent(d, {}), theme, d, join(dir, "work", th, ly), join(dir, `${th}-${ly}.pdf`), { page, reg, company });
      expect(readFileSync(out).subarray(0, 4).toString()).toBe("%PDF");
    }
  const src = readFileSync(join(dir, "work", "default", "formal", "main.typ"), "utf8");
  expect(src).toContain('watermark: "DRAFT"');
  expect(src).toContain('comp-approval(json(bytes("{\\"roles\\":[\\"承認\\",\\"確認\\",\\"作成\\"]');
  expect(existsSync(join(dir, "work", "default", "formal", "assets", "_company-logo.svg"))).toBe(true);
});
