import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { parse } from "yaml";
import { defineCheck, type Check, type CheckCtx } from "../checks/define";
import { Skip, ToolMissing, Unknown } from "../errors";
import { renderFigures, renderOptions } from "../render";
import type { Doc, Kind } from "../types";
import { defaultClaude, parseReviewOutput, REVIEW_SCHEMA, type ReviewOutput } from "./claude";

export interface Aspect {
  id: string;
  ask: string;
}

export function loadAspects(root: string, kind: Kind): Aspect[] {
  const read = (f: string): Aspect[] => {
    const p = join(root, "reviews", f);
    return existsSync(p) ? (parse(readFileSync(p, "utf8"))?.aspects ?? []) : [];
  };
  return [...read("_common.yaml"), ...read(`${kind}.yaml`)];
}

/** 指示文は reviews/_prompt.md（{{aspect}} {{images}} {{document}}）と reviews/_images.md（{{paths}}） */
export function buildPrompt(root: string, doc: Doc, a: Aspect, images: string[]): string {
  const read = (f: string) => readFileSync(join(root, "reviews", f), "utf8");
  const labels = Object.fromEntries(Object.entries(doc.defs).filter(([, d]) => d.label).map(([id, d]) => [id, d.label]));
  const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
  return fill(read("_prompt.md"), {
    aspect: a.ask,
    images: images.length ? fill(read("_images.md"), { paths: images.join(", ") }) : "",
    document: JSON.stringify({ kind: doc.kind, labels, data: doc.data }, null, 2),
  });
}

async function figurePngs(doc: Doc, ctx: CheckCtx): Promise<string[]> {
  const { svgs } = await renderFigures(doc, ctx.workDir, renderOptions(ctx.theme, ctx.config));
  const dir = join(ctx.workDir, "review-img");
  mkdirSync(dir, { recursive: true });
  return Object.entries(svgs).map(([id, svg]) => {
    const out = join(dir, `${doc.name}-${id}.png`);
    writeFileSync(out, new Resvg(readFileSync(svg), { fitTo: { mode: "width", value: ctx.config.review.imageWidth }, background: "white" }).render().asPng());
    return out;
  });
}

export function reviewChecks(root: string, doc: Doc): Check[] {
  if (!doc.kind) return [];
  return loadAspects(root, doc.kind).map((a) =>
    defineCheck({
      id: `review/${a.id}`,
      group: "review",
      kinds: ["*"],
      severity: "error",
      async run(doc, ctx) {
        const model = ctx.config.review.model;
        if (!ctx.options.review) throw new Skip("未実行（--review で実行）");
        let out: ReviewOutput | undefined;
        {
          const images = await figurePngs(doc, ctx).catch(() => []);
          const claude = ctx.options.claude ?? defaultClaude;
          let last: Error | undefined;
          for (let i = 0; i <= ctx.config.review.retries && !out; i++) {
            try {
              out = parseReviewOutput(
                await claude({ prompt: buildPrompt(ctx.root, doc, a, images), schema: REVIEW_SCHEMA, model, timeoutMs: ctx.config.review.timeoutMs, addDirs: images.length ? [join(ctx.workDir, "review-img")] : [] }),
              );
            } catch (e) {
              if (e instanceof ToolMissing) throw e;
              last = e as Error;
            }
          }
          if (!out) throw new Unknown(`レビュー失敗: ${last?.message}`);
        }
        if (!out || out.verdict === "pass") return [];
        const fs = out.findings.length ? out.findings : [{ reason: "不合格（理由なし）" }];
        return fs.map((f: { blockId?: string; reason: string }) =>
          ctx.fail(f.reason, { blockId: f.blockId, line: f.blockId ? doc.defs[f.blockId]?.line : undefined }),
        );
      },
    }),
  );
}
