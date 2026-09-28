import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initProject } from "../src/init";
import { exitCode } from "../src/runner/format";
import { runAll } from "../src/runner/run";

const dir = mkdtempSync(join(tmpdir(), "dtr-init-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("init した直後のプロジェクトはそのまま検証が通る", async () => {
  const r = initProject(dir);
  expect(r.skipped).toEqual([]);
  for (const p of ["themes/default.yaml", "layouts/standard.yaml", "components/toc/render.typ", "reviews/_prompt.md", "content/example.yaml", "company.yaml"])
    expect(existsSync(join(dir, p))).toBe(true);
  const report = await runAll(dir);
  expect(report.results.filter((x) => x.status === "fail").map((x) => `${x.doc}:${x.checkId}`)).toEqual([]);
  expect(exitCode(report)).toBe(0);
});

test("既存ファイルは上書きしない（--force で上書き）", () => {
  writeFileSync(join(dir, "company.yaml"), "name: 変更済み\n");
  const r = initProject(dir);
  expect(r.created).toEqual([]);
  expect(r.skipped).toContain("company.yaml");
  expect(readFileSync(join(dir, "company.yaml"), "utf8")).toBe("name: 変更済み\n");
  initProject(dir, { force: true });
  expect(readFileSync(join(dir, "company.yaml"), "utf8")).not.toBe("name: 変更済み\n");
});
