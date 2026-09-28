import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { layout } from "../src/build/layout";
import { emitPdf, esc, hfContent, inline } from "../src/build/typst";
import { resolveTheme } from "../src/theme/resolve";
import { docOf, meta } from "./helpers";

const dir = mkdtempSync(join(tmpdir(), "dtr-pdf-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const repo = join(import.meta.dir, "..");

test("エスケープとインライン変換", () => {
  expect(esc("1. x #1 $5 [a]")).toBe("1\\. x \\#1 \\$5 \\[a\\]");
  expect(inline("**強調** と [リンク](https://e.x) と #")).toBe('#strong[強調] と #link("https://e.x")[リンク] と \\#');
  expect(hfContent("{{meta.title}} - {{page}}/{{pages}}", { title: "規約" })).toBe(
    "[規約 \\- #context counter(page).display()/#context counter(page).final().first()]",
  );
});

test.skipIf(!Bun.which("typst"))("全テーマで PDF をコンパイルできる", async () => {
  const d = docOf(`kind: terms\n${meta("  effective: 2026-10-01\n").replace("1.0.0", "0.9.0")}articles:
  - { id: a, title: 定義, clauses: ["本規約で「利用者」とは…", "**重要**: [リンク](https://e.x)"] }
  - { id: b, title: 料金, clauses: ["{{ref:a}}に従う"] }
`);
  for (const id of ["default", "dark-green", "sakura"]) {
    const theme = resolveTheme(repo, id);
    const out = await emitPdf(layout(d, theme, {}), theme, d, join(dir, "work", id), join(dir, `${id}.pdf`));
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out).subarray(0, 4).toString()).toBe("%PDF");
  }
  expect(readFileSync(join(dir, "work", "default", "main.typ"), "utf8")).toContain('watermark: "DRAFT"');
});
