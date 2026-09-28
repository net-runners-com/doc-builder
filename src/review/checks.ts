import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { parse } from "yaml";
import { defineCheck, type Check, type CheckCtx } from "../checks/define";
import { Skip, ToolMissing, Unknown } from "../errors";
import { renderFigures } from "../render";
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

export function buildPrompt(doc: Doc, a: Aspect, images: string[]): string {
  const labels = Object.fromEntries(Object.entries(doc.defs).filter(([, d]) => d.label).map(([id, d]) => [id, d.label]));
  return [
    "あなたは文書レビュワーです。次の観点だけで文書を判定してください。",
    `観点: ${a.ask}`,
    "観点に照らして問題がなければ verdict=pass、問題があれば verdict=fail とし、findings に問題箇所のブロック ID（文書 JSON 内の id）と理由を日本語で書いてください。観点と無関係な指摘はしないでください。ファイルの変更はしないでください。",
    ...(images.length ? [`図の画像: ${images.join(", ")}（Read で確認し、本文の説明と矛盾がないかも判定に含めてください）`] : []),
    "",
    "文書（JSON。labels は id → 本文上の表記）:",
    JSON.stringify({ kind: doc.kind, labels, data: doc.data }, null, 2),
  ].join("\n");
}

async function figurePngs(doc: Doc, ctx: CheckCtx): Promise<string[]> {
  const { svgs } = await renderFigures(doc, ctx.cacheDir, [ctx.theme.colors.primary, ctx.theme.colors.accent]);
  const dir = join(ctx.cacheDir, "review-img");
  mkdirSync(dir, { recursive: true });
  return Object.entries(svgs).map(([id, svg]) => {
    const out = join(dir, `${doc.name}-${id}.png`);
    writeFileSync(out, new Resvg(readFileSync(svg), { fitTo: { mode: "width", value: 900 }, background: "white" }).render().asPng());
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
        const key = createHash("sha256").update(JSON.stringify({ data: doc.data, a, model })).digest("hex").slice(0, 24);
        const file = join(ctx.cacheDir, "review", `${key}.json`);
        let out: ReviewOutput | undefined;
        if (existsSync(file)) out = JSON.parse(readFileSync(file, "utf8"));
        else {
          if (!ctx.options.review) throw new Skip("未実行（--review で実行）");
          const images = await figurePngs(doc, ctx).catch(() => []);
          const claude = ctx.options.claude ?? defaultClaude;
          let last: Error | undefined;
          for (let i = 0; i < 2 && !out; i++) {
            try {
              out = parseReviewOutput(
                await claude({ prompt: buildPrompt(doc, a, images), schema: REVIEW_SCHEMA, model, addDirs: images.length ? [join(ctx.cacheDir, "review-img")] : [] }),
              );
            } catch (e) {
              if (e instanceof ToolMissing) throw e;
              last = e as Error;
            }
          }
          if (!out) throw new Unknown(`レビュー失敗: ${last?.message}`);
          mkdirSync(join(ctx.cacheDir, "review"), { recursive: true });
          writeFileSync(file, JSON.stringify(out));
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
