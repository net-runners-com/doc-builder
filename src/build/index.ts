import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cacheDir, loadConfig } from "../config";
import { ToolMissing } from "../errors";
import { renderFigures, renderOptions } from "../render";
import { discover, loadDoc } from "../runner/run";
import { readSnapshot } from "../facts/load";
import { loadCompany } from "../page/company";
import { registry } from "../page/components";
import { buildContent } from "./content";
import { emitMarkdown, MD_IGNORED } from "./md";
import { emitPdf } from "./typst";

export interface BuildResult {
  outputs: string[];
  warnings: string[];
  errors: string[];
}

export async function buildAll(
  root: string,
  opts: { paths?: string[]; themes?: string[]; layouts?: string[]; formats?: ("md" | "pdf")[] } = {},
): Promise<BuildResult> {
  const config = loadConfig(root);
  const res: BuildResult = { outputs: [], warnings: [], errors: [] };
  const formats = opts.formats ?? ["md", "pdf"];
  let warnedMd = false;
  for (const file of discover(root, config, opts.paths)) {
    for (const themeName of opts.themes ?? [undefined])
    for (const layoutName of opts.layouts ?? [undefined]) {
      const { doc, theme, layout: page } = loadDoc(root, config, file, { theme: themeName, layout: layoutName });
      const outDir = join(root, "dist", theme.id, page.id);
      if (doc.buildErrors.length) {
        res.errors.push(`${doc.name}: ビルドエラー ${doc.buildErrors.length} 件のため出力しません（bun run test で確認）`);
        continue;
      }
      if (theme.errors.length) res.warnings.push(`${doc.name}: テーマ "${theme.id}" にエラーがあります: ${theme.errors[0]}`);
      if (page.errors.length) res.warnings.push(`${doc.name}: レイアウト "${page.id}" にエラーがあります: ${page.errors[0]}`);
      const reg = registry(root);
      const company = loadCompany(root).company;
      const { svgs, errors } = await renderFigures(doc, cacheDir(root), renderOptions(theme, config));
      if (errors.length) {
        res.errors.push(...errors.map((e) => `${doc.name}: 図 "${e.id}": ${e.error.message}`));
        continue;
      }
      const l = buildContent(doc, svgs, (id: string) => readSnapshot(root, id));
      mkdirSync(outDir, { recursive: true });
      if (formats.includes("md")) {
        const p = join(outDir, `${doc.name}.md`);
        writeFileSync(p, emitMarkdown(l, page, reg, { meta: doc.data.meta, company, strings: doc.strings }, outDir, doc.name));
        res.outputs.push(p);
        if (!warnedMd) {
          res.warnings.push(`md: ${MD_IGNORED.join("、")} は Markdown に反映されません`);
          warnedMd = true;
        }
      }
      if (formats.includes("pdf")) {
        try {
          res.outputs.push(await emitPdf(l, theme, doc, join(root, ".test-runner", "build", theme.id, page.id, doc.name), join(outDir, `${doc.name}.pdf`), { page, reg, company }));
        } catch (e) {
          (e instanceof ToolMissing ? res.warnings : res.errors).push(`${doc.name}: PDF: ${(e as Error).message}`);
        }
      }
    }
  }
  return res;
}
