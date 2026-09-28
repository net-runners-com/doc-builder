import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAll } from "../src/build";
import { initProject } from "../src/init";

const root = mkdtempSync(join(tmpdir(), "dtr-manifest-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
initProject(root);

test("manifest に入力・出力・テスト結果が記録される", async () => {
  const res = await buildAll(root, { formats: ["md"] });
  const mf = JSON.parse(readFileSync(res.manifest!, "utf8"));
  const e = mf["default/standard/example.md"];
  expect(e).toMatchObject({ doc: "example", format: "md", theme: "default", layout: "standard", wording: "default" });
  expect(e.output.sha256).toHaveLength(64);
  const roles = new Set(e.inputs.map((i: any) => i.role));
  for (const r of ["source", "theme", "layout", "component", "wording", "template", "config"]) expect(roles.has(r)).toBe(true);
  expect(e.inputs.find((i: any) => i.role === "source").path).toBe("content/example.yaml");
  expect(e.tests.status).toBe("pass");
  expect(e.tests.problems).toEqual([]);
});

test("入力が変わるとハッシュとテスト結果が更新され、消えた出力は manifest から外れる", async () => {
  writeFileSync(join(root, "content", "example.yaml"), readFileSync(join(root, "content", "example.yaml"), "utf8").replace("雛形です。", "雛形です TBD。"));
  const before = JSON.parse(readFileSync(join(root, "dist", "manifest.json"), "utf8"))["default/standard/example.md"];
  await buildAll(root, { formats: ["md"] });
  const after = JSON.parse(readFileSync(join(root, "dist", "manifest.json"), "utf8"))["default/standard/example.md"];
  expect(after.inputs[0].sha256).not.toBe(before.inputs[0].sha256);
  expect(after.tests.problems.map((p: any) => p.checkId)).toContain("text/placeholder");
  rmSync(join(root, "dist", "default", "standard", "example.md"));
  await buildAll(root, { formats: ["md"], layouts: ["simple"] });
  const mf = JSON.parse(readFileSync(join(root, "dist", "manifest.json"), "utf8"));
  expect(Object.keys(mf)).toEqual(["default/simple/example.md"]);
  expect(existsSync(join(root, "dist", "default", "simple", "example.md"))).toBe(true);
});
