import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadFacts, snapshotFile } from "../facts/load";
import type { Company } from "../page/company";
import { companyFile } from "../page/company";
import type { Registry } from "../page/components";
import { usedComponents } from "../page/emit";
import { REGIONS, type ResolvedLayout } from "../page/types";
import { axisSummary, counts, worst } from "../runner/format";
import type { ResolvedTheme } from "../theme/types";
import type { Axis, CheckResult, Doc, Status } from "../types";

export type Role = "source" | "theme" | "palette" | "layout" | "component" | "wording" | "company" | "facts" | "snapshot" | "image" | "template" | "config" | "test";

export interface ManifestFile {
  /** プロジェクトルートからの相対パス（ツール本体のファイルは "tool:" で始まる） */
  path: string;
  role: Role;
  sha256: string;
}
export interface ManifestTests {
  status: Status;
  counts: Record<Status, number>;
  axes: Partial<Record<Axis, { status: Status; findings: number }>>;
  /** fail / warn / unknown のチェック（checkId → 指摘数） */
  problems: { checkId: string; axis: Axis; status: Status; findings: number }[];
}
export interface ManifestEntry {
  doc: string;
  format: "md" | "pdf";
  theme: string;
  layout: string;
  wording: string;
  builtAt: string;
  output: { path: string; bytes: number; sha256: string };
  inputs: ManifestFile[];
  tests: ManifestTests;
}
export type Manifest = Record<string, ManifestEntry>;

const TOOL = resolve(import.meta.dir, "..", "..");

export const sha256 = (p: string) => new Bun.CryptoHasher("sha256").update(readFileSync(p)).digest("hex");

function file(root: string, abs: string, role: Role): ManifestFile {
  const inRoot = !relative(root, abs).startsWith("..");
  const inTool = !relative(TOOL, abs).startsWith("..");
  const path = inRoot ? relative(root, abs) : inTool ? `tool:${relative(TOOL, abs)}` : abs;
  return { path, role, sha256: sha256(abs) };
}

/** この出力に使った入力ファイル（重複なし、役割つき） */
export function collectInputs(
  root: string,
  doc: Doc,
  theme: ResolvedTheme,
  page: ResolvedLayout,
  reg: Registry,
  company: Company | undefined,
): ManifestFile[] {
  const list: [string, Role][] = [[doc.path, "source"]];
  for (const f of theme.files) list.push([f, "theme"]);
  for (const f of theme.paletteFiles) list.push([f, "palette"]);
  list.push([theme.template ?? join(TOOL, "src", "build", "template.typ"), "template"]);
  for (const f of page.files) list.push([f, "layout"]);
  const used = usedComponents(REGIONS.flatMap((r) => page[r]));
  for (const name of used) {
    const dir = join(root, "components", name);
    for (const f of ["component.yaml", "render.typ", "md.ts"]) if (existsSync(join(dir, f))) list.push([join(dir, f), "component"]);
    void reg;
  }
  for (const f of doc.wordingFiles) list.push([f, "wording"]);
  if ([...used].some((n) => n === "company" || n === "company-mini") && existsSync(companyFile(root))) {
    list.push([companyFile(root), "company"]);
    if (company?.logo && existsSync(company.logo)) list.push([company.logo, "image"]);
  }
  const project = loadFacts(root).facts;
  if (doc.factRefs.some((id) => project[id]) && existsSync(join(root, "facts.yaml"))) list.push([join(root, "facts.yaml"), "facts"]);
  for (const id of doc.factRefs) if (existsSync(snapshotFile(root, id))) list.push([snapshotFile(root, id), "snapshot"]);
  for (const img of doc.data.images ?? []) {
    const p = resolve(doc.dir, img.path);
    if (existsSync(p)) list.push([p, "image"]);
  }
  for (const a of doc.data.meta?.approvals ?? []) {
    const p = a.stamp ? resolve(doc.dir, a.stamp) : undefined;
    if (p && existsSync(p)) list.push([p, "image"]);
  }
  if (doc.tests) list.push([doc.tests.path, "test"]);
  if (existsSync(join(root, "runner.yaml"))) list.push([join(root, "runner.yaml"), "config"]);
  const seen = new Set<string>();
  return list.filter(([p]) => !seen.has(p) && seen.add(p)).map(([p, role]) => file(root, p, role));
}

export function summarizeTests(results: CheckResult[]): ManifestTests {
  const axes = axisSummary(results);
  return {
    status: worst(results.map((r) => r.status)),
    counts: counts(results),
    axes: Object.fromEntries(Object.entries(axes).filter(([a]) => results.some((r) => r.axis === a))) as ManifestTests["axes"],
    problems: results
      .filter((r) => r.status === "fail" || r.status === "warn" || r.status === "unknown")
      .map((r) => ({ checkId: r.checkId, axis: r.axis, status: r.status, findings: r.findings.length })),
  };
}

export const manifestPath = (root: string) => join(root, "dist", "manifest.json");

/** 既存の manifest に追記（出力ファイルが消えた項目は捨てる） */
export function writeManifest(root: string, entries: Record<string, ManifestEntry>) {
  const p = manifestPath(root);
  const dist = join(root, "dist");
  const old: Manifest = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
  const merged: Manifest = {};
  for (const [k, v] of Object.entries({ ...old, ...entries })) if (existsSync(join(dist, k))) merged[k] = v;
  writeFileSync(p, JSON.stringify(Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n");
  return p;
}

export const outputInfo = (dist: string, abs: string) => ({ path: relative(dist, abs), bytes: statSync(abs).size, sha256: sha256(abs) });
