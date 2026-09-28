import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contrast, themeContrast, themeValid } from "../src/checks/builtin/theme";
import { loadConfig } from "../src/config";
import { resolveTheme, watermarkActive } from "../src/theme/resolve";

const repo = join(import.meta.dir, "..");
const root = mkdtempSync(join(tmpdir(), "dtr-theme-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
cpSync(join(repo, "themes"), join(root, "themes"), { recursive: true });

const ctx = () => ({
  root,
  config: loadConfig(root),
  options: {},
  today: new Date("2026-09-28"),
  workDir: join(root, ".work"),
  probes: new Map(),
  memo: new Map(),
  fail: (message: string, loc = {}) => ({ message, loc: { doc: "@themes", ...loc } }),
});

test("同梱テーマは妥当で、extends が効く", () => {
  const s = resolveTheme(repo, "sakura");
  expect(s.errors).toEqual([]);
  expect(s.colors.primary).toBe("#B0305A");
  expect(s.page.size).toBe("A4");
});

test("文書のインライン上書き", () => {
  const t = resolveTheme(repo, { extends: "dark-green", colors: { primary: "#00AA77" } });
  expect(t.colors.primary).toBe("#00AA77");
  expect(t.colors.background).toBe("#12241B");
});

test("extends の循環・欠落はエラー", () => {
  writeFileSync(join(root, "themes", "a.yaml"), "extends: b\n");
  writeFileSync(join(root, "themes", "b.yaml"), "extends: a\n");
  writeFileSync(join(root, "themes", "c.yaml"), "extends: nope\n");
  const a = resolveTheme(root, "a");
  expect(a.errors.join()).toContain("循環");
  expect(resolveTheme(root, "c").errors.join()).toContain('"nope" が見つかりません');
});

test("theme/valid は全テーマを検査する", async () => {
  writeFileSync(join(root, "themes", "d.yaml"), "colors: { primary: red }\n");
  const msgs = ((await themeValid.run(ctx())) as any[]).map((f) => f.message).join("\n");
  expect(msgs).toContain("a: extends が循環");
  expect(msgs).toContain("d: /colors/primary");
  expect(msgs).not.toContain("sakura");
});

test("theme/contrast", async () => {
  expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  writeFileSync(join(root, "themes", "pale.yaml"), 'extends: default\ncolors: { text: "#DDDDDD" }\n');
  const msgs = ((await themeContrast.run(ctx())) as any[]).map((f) => f.message);
  expect(msgs.some((m) => m.startsWith("pale: colors.text"))).toBe(true);
  expect(msgs.some((m) => m.startsWith("sakura"))).toBe(false);
});

test("watermark 条件", () => {
  const t = resolveTheme(repo, "default");
  expect(watermarkActive(t, { version: "0.9.0" })).toBe(true);
  expect(watermarkActive(t, { version: "1.0.0" })).toBe(false);
});
