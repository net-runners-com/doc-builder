import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { ProbeResult } from "../facts/probe";
import { join, relative, resolve } from "node:path";
import { builtinChecks, projectChecks } from "../checks/builtin";
import { Skip, Unknown } from "../errors";
import { FACTS_DOC, factsValid, probeCheck, probeTargets, unusedFacts } from "../checks/builtin/facts";
import type { BaseCtx, Check, CheckCtx, CheckOutput, ProjectCheck, RunOptions } from "../checks/define";
import { loadFacts } from "../facts/load";
import type { Fact } from "../facts/types";
import { loadConfig, workRoot, type Config } from "../config";
import { buildDoc } from "../parse/doc";
import { loadDocTests } from "../parse/tests";
import { loadYaml } from "../parse/yaml";
import { reviewChecks } from "../review/checks";
import { resolveLayout } from "../page/resolve";
import { resolveTheme } from "../theme/resolve";
import { m, useMessages } from "../messages";
import type { Axis, CheckResult, Report, Scope, Trigger } from "../types";

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

export interface LoadOverrides {
  theme?: string;
  layout?: string;
  wording?: string;
}

export function loadDoc(root: string, config: Config, file: string, over: LoadOverrides = {}, facts?: Record<string, Fact>) {
  const src = readFileSync(file, "utf8");
  const data = loadYaml(src).data;
  const theme = resolveTheme(root, over.theme ?? data?.theme ?? config.defaultTheme, join(file, ".."));
  const layout = resolveLayout(root, over.layout ?? data?.layout ?? config.defaultLayout);
  const doc = buildDoc(file, src, { facts: facts ?? loadFacts(root).facts, root, wording: over.wording });
  doc.tests = loadDocTests(root, config, doc.name);
  return { doc, theme, layout };
}

const TRIGGER_FLAG = { probe: "probe", online: "online", review: "review", render: "render" } as const;

async function runOne(
  check: { id: string; axis: Axis; scope: Scope; trigger?: Trigger; severity: "error" | "warn" },
  docNameStr: string,
  options: RunOptions,
  fn: () => CheckOutput | Promise<CheckOutput>,
): Promise<CheckResult> {
  const base = { doc: docNameStr, axis: check.axis, scope: check.scope, checkId: check.id };
  const trig = check.trigger ?? "always";
  if (trig !== "always" && !options[TRIGGER_FLAG[trig]]) return { ...base, status: "skipped", findings: [], note: m(`run.skipped.${trig}`) };
  try {
    const out = await fn();
    const { findings, note } = Array.isArray(out) ? { findings: out, note: undefined } : out;
    const status = findings.length ? (check.severity === "error" ? "fail" : "warn") : "pass";
    return { ...base, status, findings, ...(note ? { note } : {}) };
  } catch (e) {
    if (e instanceof Skip) return { ...base, status: "skipped", findings: [], note: e.message };
    if (e instanceof Unknown) return { ...base, status: "unknown", findings: [], note: e.message };
    return { ...base, status: "unknown", findings: [], note: m("run.exception", { error: (e as Error).stack ?? String(e) }) };
  }
}

export async function runAll(root: string, options: RunOptions = {}): Promise<Report> {
  const startedAt = new Date().toISOString();
  const config = loadConfig(root);
  useMessages(root);
  const today = options.today ?? new Date();
  const userChecks = await loadUserChecks(root);
  const results: CheckResult[] = [];
  mkdirSync(workRoot(root), { recursive: true });
  const workDir = mkdtempSync(join(workRoot(root), "run-"));
  const probes = new Map<string, ProbeResult>();
  const memo = new Map<string, unknown>();
  try {
  const base = (doc: string): BaseCtx => ({
    root,
    config,
    options,
    today,
    workDir,
    probes,
    memo,
    fail: (message, loc = {}) => ({ message, loc: { doc, ...loc } }),
  });
  const project = async (doc: string, checks: ProjectCheck[]) => {
    for (const c of checks) {
      const ctx = base(doc);
      results.push(await runOne(c, doc, options, () => c.run(ctx)));
    }
  };

  const facts = loadFacts(root).facts;
  const loaded = discover(root, config, options.paths).map((f) => loadDoc(root, config, f, { theme: options.theme?.split(",")[0], layout: options.layout?.split(",")[0], wording: options.wording }, facts));
  const docs = loaded.map((l) => l.doc);

  await project(PROJECT_DOC, projectChecks);
  // 実機検証を先に走らせ、fact/refs が同じ実行の結果を読めるようにする
  await project(FACTS_DOC, [factsValid, ...probeTargets(root, docs).map(probeCheck)]);

  for (const { doc, theme, layout } of loaded) {
    const ctx: CheckCtx = { ...base(doc.name), theme, layout };
    const checks = [...builtinChecks, ...userChecks, ...reviewChecks(root, doc)].filter(
      (c) => !doc.kind || c.kinds.includes("*") || c.kinds.includes(doc.kind),
    );
    const broken = doc.buildErrors.some((e) => e.checkId === "schema/valid");
    for (const c of checks) {
      if (broken && c.id !== "schema/valid") {
        results.push({ doc: doc.name, axis: c.axis, scope: c.scope, checkId: c.id, status: "skipped", findings: [], note: m("run.skipped.schema") });
        continue;
      }
      results.push(await runOne(c, doc.name, options, () => c.run(doc, ctx)));
    }
  }
  if (!options.paths?.length) await project(FACTS_DOC, [unusedFacts(docs)]);
  return { startedAt, finishedAt: new Date().toISOString(), docs: docs.map((d) => d.name), results };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export const relPath = (root: string, p: string) => relative(root, p);
