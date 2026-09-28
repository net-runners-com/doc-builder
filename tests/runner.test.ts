import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exitCode } from "../src/runner/format";
import { runAll } from "../src/runner/run";
import { MIN } from "./helpers";

const root = mkdtempSync(join(tmpdir(), "dtr-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, "content"));
writeFileSync(join(root, "content", "ok.yaml"), MIN.guide);
writeFileSync(join(root, "content", "broken.yaml"), "kind: guide\n");
mkdirSync(join(root, "checks"));
writeFileSync(
  join(root, "checks", "boom.ts"),
  `export default { id: "user/boom", group: "rules", kinds: ["*"], severity: "error", run() { throw new Error("boom"); } };`,
);

test("スキーマ違反の文書は他 group が skipped、例外は unknown", async () => {
  const r = await runAll(root);
  expect(r.docs).toEqual(["broken", "ok"]);
  const get = (doc: string, id: string) => r.results.find((x) => x.doc === doc && x.checkId === id)!;
  expect(get("broken", "schema/valid").status).toBe("fail");
  expect(get("broken", "user/boom").status).toBe("skipped");
  expect(get("ok", "schema/valid").status).toBe("pass");
  expect(get("ok", "user/boom").status).toBe("unknown");
  expect(get("ok", "user/boom").note).toContain("boom");
  expect(exitCode(r)).toBe(1);
});

test("exit code: strict は unknown でも 1", async () => {
  const r = await runAll(root, { paths: ["ok"] });
  expect(r.docs).toEqual(["ok"]);
  expect(exitCode(r)).toBe(0);
  expect(exitCode(r, true)).toBe(1);
});
