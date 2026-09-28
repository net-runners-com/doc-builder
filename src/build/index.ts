import { m } from "../messages";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config";
import { ToolMissing } from "../errors";
import { renderFigures, renderOptions } from "../render";
import { discover, loadDoc } from "../runner/run";
import { readSnapshot } from "../facts/load";
import { loadCompany } from "../page/company";
import { registry } from "../page/components";
import { runAll } from "../runner/run";
import { buildContent } from "./content";
import { collectInputs, outputInfo, summarizeTests, writeManifest, type ManifestEntry, type ManifestTests } from "./manifest";
import { emitMarkdown } from "./md";
import { emitPdf } from "./typst";

export interface BuildResult {
  outputs: string[];
  /** 出力ごとのテスト結果の要約（dist からの相対パス → 要約） */
  tests: Record<string, ManifestTests>;
  manifest?: string;
  warnings: string[];
  errors: string[];
}

export async function buildAll(
  root: string,
  opts: { paths?: string[]; themes?: string[]; layouts?: string[]; wording?: string; formats?: ("md" | "pdf")[] } = {},
): Promise<BuildResult> {
  const config = loadConfig(root);
  const res: BuildResult = { outputs: [], tests: {}, warnings: [], errors: [] };
  const dist = join(root, "dist");
  const entries: Record<string, ManifestEntry> = {};
  const formats = opts.formats ?? ["md", "pdf"];
  let warnedMd = false;
  for (const file of discover(root, config, opts.paths)) {
    for (const themeName of opts.themes ?? [undefined])
    for (const layoutName of opts.layouts ?? [undefined]) {
      const { doc, theme, layout: page } = loadDoc(root, config, file, { theme: themeName, layout: layoutName, wording: opts.wording });
      const outDir = join(root, "dist", theme.id, page.id);
      if (doc.buildErrors.length) {
        res.errors.push(m("build.skipped-errors", { doc: doc.name, n: doc.buildErrors.length }));
        continue;
      }
      if (theme.errors.length) res.warnings.push(m("build.theme-error", { doc: doc.name, id: theme.id, error: theme.errors[0] }));
      if (page.errors.length) res.warnings.push(m("build.layout-error", { doc: doc.name, id: page.id, error: page.errors[0] }));
      const reg = registry(root);
      const company = loadCompany(root).company;
      const { svgs, errors } = await renderFigures(doc, join(root, ".test-runner", "build", theme.id, page.id, doc.name + ".render"), renderOptions(theme, config, doc.strings));
      if (errors.length) {
        res.errors.push(...errors.map((e) => m("build.figure-error", { doc: doc.name, id: e.id, error: e.error.message })));
        continue;
      }
      const l = buildContent(doc, svgs, (id: string) => readSnapshot(root, id));
      mkdirSync(outDir, { recursive: true });
      // この組み合わせ（テーマ・レイアウト・表記スタイル）で文書を検証し、manifest に記録する
      const report = await runAll(root, { paths: [doc.name], theme: themeName, layout: layoutName, wording: opts.wording });
      const tests = summarizeTests(report.results.filter((r) => r.doc === doc.name));
      const inputs = collectInputs(root, doc, theme, page, reg, company);
      const wording = opts.wording ?? doc.data.wording ?? config.defaultWording;
      const record = (format: "md" | "pdf", abs: string) => {
        const output = outputInfo(dist, abs);
        entries[output.path] = { doc: doc.name, format, theme: theme.id, layout: page.id, wording, builtAt: new Date().toISOString(), output, inputs, tests };
        res.tests[output.path] = tests;
      };
      if (formats.includes("md")) {
        const p = join(outDir, `${doc.name}.md`);
        writeFileSync(p, emitMarkdown(l, page, reg, { meta: doc.data.meta, company, strings: doc.strings }, outDir, doc.name));
        res.outputs.push(p);
        record("md", p);
        if (!warnedMd) {
          res.warnings.push(m("build.md-ignored"));
          warnedMd = true;
        }
      }
      if (formats.includes("pdf")) {
        try {
          const pdf = await emitPdf(l, theme, doc, join(root, ".test-runner", "build", theme.id, page.id, doc.name), join(outDir, `${doc.name}.pdf`), { page, reg, company });
          res.outputs.push(pdf);
          record("pdf", pdf);
        } catch (e) {
          (e instanceof ToolMissing ? res.warnings : res.errors).push(m("build.pdf-error", { doc: doc.name, error: (e as Error).message }));
        }
      }
    }
  }
  if (Object.keys(entries).length) res.manifest = writeManifest(root, entries);
  return res;
}
