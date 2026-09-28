import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contrast, themeContrast, themeValid } from "../src/checks/builtin/theme";
import { loadConfig } from "../src/config";
import { resolvePalette } from "../src/theme/palette";
import { resolveTheme, watermarkActive } from "../src/theme/resolve";

const repo = join(import.meta.dir, "..");
const root = mkdtempSync(join(tmpdir(), "dtr-theme-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
cpSync(join(repo, "themes"), join(root, "themes"), { recursive: true });
cpSync(join(repo, "palettes"), join(root, "palettes"), { recursive: true });

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

test("テーマはパレットから色を得る。extends が効く", () => {
  const s = resolveTheme(repo, "sakura");
  expect(s.errors).toEqual([]);
  expect(s.palette).toBe("sakura");
  expect(s.colors.primary).toBe("#B0305A");
  expect(s.page.size).toBe("A4");
  expect(s.paletteFiles).toEqual([join(repo, "palettes/sakura.yaml")]);
  const d = resolveTheme(repo, "midnight");
  expect(d.colors.background).toBe("#0F172A");
  expect(d.diagram_theme).toBe(200);
});

test("文書のインライン上書きでパレットを差し替える", () => {
  const t = resolveTheme(repo, { extends: "default", palette: "midnight" });
  expect(t.colors.surface).toBe("#1E293B");
});

test("パレットの extends はトークン単位でマージする", () => {
  writeFileSync(join(root, "palettes", "custom.yaml"), 'extends: midnight\ncolors: { accent: "#FF0000" }\n');
  const p = resolvePalette(root, "custom");
  expect(p.errors).toEqual([]);
  expect(p.palette!.colors.accent).toBe("#FF0000");
  expect(p.palette!.colors.background).toBe("#0F172A");
});

test("extends の循環・欠落はエラー", () => {
  writeFileSync(join(root, "themes", "a.yaml"), "extends: b\n");
  writeFileSync(join(root, "themes", "b.yaml"), "extends: a\n");
  writeFileSync(join(root, "themes", "c.yaml"), "extends: nope\n");
  expect(resolveTheme(root, "a").errors.join()).toContain("循環");
  expect(resolveTheme(root, "c").errors.join()).toContain('"nope" が見つかりません');
});

test("theme/valid はテーマとパレットを検査する", async () => {
  writeFileSync(join(root, "themes", "d.yaml"), "extends: default\npalette: missing\n");
  writeFileSync(join(root, "palettes", "bad.yaml"), 'colors: { primary: red }\nseries: []\ndiagram_theme: 0\n');
  const msgs = ((await themeValid.run(ctx())) as any[]).map((f) => f.message).join("\n");
  expect(msgs).toContain("a: extends が循環");
  expect(msgs).toContain('d: パレット: パレット "missing" が見つかりません');
  expect(msgs).toContain("palettes/bad: bad/colors/primary");
  expect(msgs).not.toContain("sakura");
});

test("theme/contrast はパレットごと", async () => {
  expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  writeFileSync(join(root, "palettes", "pale.yaml"), 'extends: default\ncolors: { text: "#DDDDDD" }\n');
  const msgs = ((await themeContrast.run(ctx())) as any[]).map((f) => f.message);
  expect(msgs.some((m) => m.startsWith("pale: text"))).toBe(true);
  expect(msgs.some((m) => m.startsWith("midnight"))).toBe(false);
});

test("watermark 条件", () => {
  const t = resolveTheme(repo, "default");
  expect(watermarkActive(t, { version: "0.9.0" })).toBe(true);
  expect(watermarkActive(t, { version: "1.0.0" })).toBe(false);
});
