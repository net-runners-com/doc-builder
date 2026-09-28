import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { builtinChecks, projectChecks } from "../checks/builtin";
import { Skip, Unknown } from "../errors";
import { FACTS_DOC, factsValid, probeCheck, probeTargets, unusedFacts } from "../checks/builtin/facts";
import type { BaseCtx, Check, CheckCtx, CheckOutput, ProjectCheck, RunOptions } from "../checks/define";
import { loadFacts } from "../facts/load";
import type { Fact } from "../facts/types";
import { cacheDir, loadConfig, type Config } from "../config";
import { buildDoc } from "../parse/doc";
import { loadYaml } from "../parse/yaml";
import { reviewChecks } from "../review/checks";
import { resolveTheme } from "../theme/resolve";
import type { CheckResult, Report } from "../types";

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

export function loadDoc(root: string, config: Config, file: string, themeOverride?: string, facts?: Record<string, Fact>) {
  const src = readFileSync(file, "utf8");
  const spec = themeOverride ?? loadYaml(src).data?.theme ?? config.defaultTheme;
  const theme = resolveTheme(root, spec, join(file, ".."));
  const doc = buildDoc(file, src, theme.numbering, facts ?? loadFacts(root).facts);
  return { doc, theme };
}

async function runOne(
  check: { id: string; group: CheckResult["group"]; severity: "error" | "warn" },
  docNameStr: string,
  fn: () => CheckOutput | Promise<CheckOutput>,
): Promise<CheckResult> {
  const base = { doc: docNameStr, group: check.group, checkId: check.id };
  try {
    const out = await fn();
    const { findings, note } = Array.isArray(out) ? { findings: out, note: undefined } : out;
    const status = findings.length ? (check.severity === "error" ? "fail" : "warn") : "pass";
    return { ...base, status, findings, ...(note ? { note } : {}) };
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
  const project = async (doc: string, checks: ProjectCheck[]) => {
    for (const c of checks) {
      const ctx = base(doc);
      results.push(await runOne(c, doc, () => c.run(ctx)));
    }
  };

  const facts = loadFacts(root).facts;
  const loaded = discover(root, config, options.paths).map((f) => loadDoc(root, config, f, options.theme?.split(",")[0], facts));
  const docs = loaded.map((l) => l.doc);

  await project(PROJECT_DOC, projectChecks);
  // 実機検証を先に走らせ、fact/refs が同じ実行の結果を読めるようにする
  await project(FACTS_DOC, [factsValid, ...probeTargets(root, docs).map(probeCheck)]);

  for (const { doc, theme } of loaded) {
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
  if (!options.paths?.length) await project(FACTS_DOC, [unusedFacts(docs)]);
  return { startedAt, finishedAt: new Date().toISOString(), docs: docs.map((d) => d.name), results };
}

export const relPath = (root: string, p: string) => relative(root, p);
