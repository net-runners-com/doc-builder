import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cacheDir, loadConfig } from "../config";
import { ToolMissing } from "../errors";
import { renderFigures } from "../render";
import { discover, loadDoc } from "../runner/run";
import { readSnapshot } from "../facts/load";
import { layout } from "./layout";
import { emitMarkdown, MD_IGNORED } from "./md";
import { emitPdf } from "./typst";

export interface BuildResult {
  outputs: string[];
  warnings: string[];
  errors: string[];
}

export async function buildAll(root: string, opts: { paths?: string[]; themes?: string[]; formats?: ("md" | "pdf")[] } = {}): Promise<BuildResult> {
  const config = loadConfig(root);
  const res: BuildResult = { outputs: [], warnings: [], errors: [] };
  const formats = opts.formats ?? ["md", "pdf"];
  let warnedMd = false;
  for (const file of discover(root, config, opts.paths)) {
    for (const themeName of opts.themes ?? [undefined]) {
      const { doc, theme } = loadDoc(root, config, file, themeName);
      const outDir = join(root, "dist", theme.id);
      if (doc.buildErrors.length) {
        res.errors.push(`${doc.name}: ビルドエラー ${doc.buildErrors.length} 件のため出力しません（bun run test で確認）`);
        continue;
      }
      if (theme.errors.length) res.warnings.push(`${doc.name}: テーマ "${theme.id}" にエラーがあります: ${theme.errors[0]}`);
      const { svgs, errors } = await renderFigures(doc, cacheDir(root), [theme.colors.primary, theme.colors.accent]);
      if (errors.length) {
        res.errors.push(...errors.map((e) => `${doc.name}: 図 "${e.id}": ${e.error.message}`));
        continue;
      }
      const l = layout(doc, theme, svgs, (id) => readSnapshot(root, id));
      mkdirSync(outDir, { recursive: true });
      if (formats.includes("md")) {
        const p = join(outDir, `${doc.name}.md`);
        writeFileSync(p, emitMarkdown(l, theme, outDir, doc.name));
        res.outputs.push(p);
        if (!warnedMd) {
          res.warnings.push(`md: テーマの ${MD_IGNORED.join(", ")} は Markdown に反映されません`);
          warnedMd = true;
        }
      }
      if (formats.includes("pdf")) {
        try {
          res.outputs.push(await emitPdf(l, theme, doc, join(root, ".test-runner", "build", theme.id, doc.name), join(outDir, `${doc.name}.pdf`)));
        } catch (e) {
          (e instanceof ToolMissing ? res.warnings : res.errors).push(`${doc.name}: PDF: ${(e as Error).message}`);
        }
      }
    }
  }
  return res;
}
