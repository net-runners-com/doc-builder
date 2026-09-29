import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config";
import { m } from "../messages";
import { validateTestFile } from "../schema/doc";
import type { DocTests } from "../types";
import { loadYaml } from "./yaml";

export const testFile = (root: string, config: Config, docName: string) => join(root, config.testsDir, `${docName}.yaml`);

/** doctests/<文書名>.yaml を読む。無ければ undefined */
export function loadDocTests(root: string, config: Config, docName: string): DocTests | undefined {
  const path = testFile(root, config, docName);
  if (!existsSync(path)) return undefined;
  const l = loadYaml(readFileSync(path, "utf8"));
  if (l.error) return { path, data: {}, errors: [{ message: m("parse.yaml", { error: l.error.message }), line: l.error.line }], lineOf: l.lineOf };
  const errors = validateTestFile(l.data).map((e) => ({ message: e.message, line: l.lineOf(e.ptr) }));
  return { path, data: errors.length ? {} : (l.data ?? {}), errors, lineOf: l.lineOf };
}

export function listTestFiles(root: string, config: Config): string[] {
  const dir = join(root, config.testsDir);
  if (!existsSync(dir)) return [];
  return [...new Bun.Glob("*.yaml").scanSync({ cwd: dir })].map((f) => f.replace(/\.yaml$/, "")).sort();
}
