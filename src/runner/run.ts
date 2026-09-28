import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { builtinChecks, projectChecks } from "../checks/builtin";
import { Skip, Unknown } from "../errors";
import type { BaseCtx, Check, CheckCtx, RunOptions } from "../checks/define";
import { cacheDir, loadConfig, type Config } from "../config";
import { buildDoc } from "../parse/doc";
import { loadYaml } from "../parse/yaml";
import { reviewChecks } from "../review/checks";
import { resolveTheme } from "../theme/resolve";
import type { CheckResult, Doc, Finding, Report } from "../types";

export const PROJECT_DOC = "@themes";

export function discover(root: string, config: Config, paths?: string[]): string[] {
  const dir = join(root, config.contentDir);
  if (!existsSync(dir)) return [];
  const all = [...new Bun.Glob("**/*.yaml").scanSync({ cwd: dir })].sort().map((f) => join(dir, f));
  if (!paths?.length) return all;
  const wanted = paths.map((p) => resolve(p));
  return all.filter((f) => wanted.some((w) => f === w || f.startsWith(w + "/")) || paths.some((p) => docName(f) === p));
}

export const docName = (file: string) => file.split("/").pop()!.replace(/\.yaml$/, "");

async function loadUserChecks(root: string): Promise<Check[]> {
  const dir = join(root, "checks");
  if (!existsSync(dir)) return [];
  const out: Check[] = [];
  for (const f of [...new Bun.Glob("*.ts").scanSync({ cwd: dir })].sort()) {
    const mod = await import(join(dir, f));
    if (mod.default) out.push(mod.default);
  }
  return out;
}

export function loadDoc(root: string, config: Config, file: string, themeOverride?: string) {
  const src = readFileSync(file, "utf8");
  const spec = themeOverride ?? loadYaml(src).data?.theme ?? config.defaultTheme;
  const theme = resolveTheme(root, spec, join(file, ".."));
  const doc = buildDoc(file, src, theme.numbering);
  return { doc, theme };
}

async function runOne(
  check: { id: string; group: CheckResult["group"]; severity: "error" | "warn" },
  docNameStr: string,
  fn: () => Finding[] | Promise<Finding[]>,
): Promise<CheckResult> {
  const base = { doc: docNameStr, group: check.group, checkId: check.id };
  try {
    const findings = await fn();
    const status = findings.length ? (check.severity === "error" ? "fail" : "warn") : "pass";
    return { ...base, status, findings };
  } catch (e) {
    if (e instanceof Skip) return { ...base, status: "skipped", findings: [], note: e.message };
    if (e instanceof Unknown) return { ...base, status: "unknown", findings: [], note: e.message };
    return { ...base, status: "unknown", findings: [], note: `例外: ${(e as Error).stack ?? e}` };
  }
}

export async function runAll(root: string, options: RunOptions = {}): Promise<Report> {
  const startedAt = new Date().toISOString();
  const config = loadConfig(root);
  const today = options.today ?? new Date();
  const userChecks = await loadUserChecks(root);
  const results: CheckResult[] = [];
  const base = (doc: string): BaseCtx => ({
    root,
    config,
    options,
    today,
    cacheDir: cacheDir(root),
    fail: (message, loc = {}) => ({ message, loc: { doc, ...loc } }),
  });

  for (const c of projectChecks) {
    const ctx = base(PROJECT_DOC);
    results.push(await runOne(c, PROJECT_DOC, () => c.run(ctx)));
  }

  const files = discover(root, config, options.paths);
  const docs: string[] = [];
  for (const file of files) {
    const { doc, theme } = loadDoc(root, config, file, options.theme?.split(",")[0]);
    docs.push(doc.name);
    const ctx: CheckCtx = { ...base(doc.name), theme };
    const checks = [...builtinChecks, ...userChecks, ...reviewChecks(root, doc)].filter(
      (c) => c.group === "schema" || !doc.kind || c.kinds.includes("*") || c.kinds.includes(doc.kind),
    );
    const broken = doc.buildErrors.some((e) => e.checkId === "schema/valid");
    for (const c of checks) {
      if (broken && c.group !== "schema") {
        results.push({ doc: doc.name, group: c.group, checkId: c.id, status: "skipped", findings: [], note: "スキーマ違反のため未実行" });
        continue;
      }
      results.push(await runOne(c, doc.name, () => c.run(doc, ctx)));
    }
  }
  return { startedAt, finishedAt: new Date().toISOString(), docs, results };
}

export const relPath = (root: string, p: string) => relative(root, p);
