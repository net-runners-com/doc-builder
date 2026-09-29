import { expectTargets } from "../checks/builtin/expression";
import { m } from "../messages";
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
  /** ルール（システム判定）にできない理由。必須 */
  why_not_rule: string;
}

export function loadAspects(root: string, kind: Kind): Aspect[] {
  const read = (f: string): Aspect[] => {
    const p = join(root, "reviews", f);
    return existsSync(p) ? (parse(readFileSync(p, "utf8"))?.aspects ?? []) : [];
  };
  return [...read("_common.yaml"), ...read(`${kind}.yaml`)];
}

/** 事実の埋め込み（fact / calc / capture）を ［事実:ID］ に置き換える。表現のレビューで事実の正誤を判定させないため */
export function maskFacts(v: unknown): unknown {
  if (typeof v === "string") return v.replace(/\{\{\s*(fact|capture|calc):([^}]*?)\s*\}\}/g, (_a, k, id) => `［事実:${k === "calc" ? "計算" : id.trim()}］`);
  if (Array.isArray(v)) return v.map(maskFacts);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => k !== "facts").map(([k, x]) => [k, maskFacts(x)]));
  return v;
}

/** 指示文は reviews/_prompt.md（{{aspect}} {{images}} {{document}}）と reviews/_images.md（{{paths}}） */
export function buildPrompt(root: string, doc: Doc, a: Aspect, images: string[]): string {
  const read = (f: string) => readFileSync(join(root, "reviews", f), "utf8");
  const labels = Object.fromEntries(Object.entries(doc.defs).filter(([, d]) => d.label).map(([id, d]) => [id, d.label]));
  const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
  return fill(read("_prompt.md"), {
    aspect: a.ask,
    images: images.length ? fill(read("_images.md"), { paths: images.join(", ") }) : "",
    document: JSON.stringify({ kind: doc.kind, labels, data: maskFacts(doc.data) }, null, 2),
  });
}

async function figurePngs(doc: Doc, ctx: CheckCtx): Promise<string[]> {
  const { svgs } = await renderFigures(doc, ctx.workDir, renderOptions(ctx.theme, ctx.config, doc.strings));
  const dir = join(ctx.workDir, "review-img");
  mkdirSync(dir, { recursive: true });
  return Object.entries(svgs).map(([id, svg]) => {
    const out = join(dir, `${doc.name}-${id}.png`);
    writeFileSync(out, new Resvg(readFileSync(svg), { fitTo: { mode: "width", value: ctx.config.review.imageWidth }, background: "white" }).render().asPng());
    return out;
  });
}

/** expect の ask:（構造で書けない問い）をブロックごとの観点にする */
function askAspects(doc: Doc): (Aspect & { scope: "item" | "document" })[] {
  return expectTargets(doc).flatMap((t) =>
    t.expect
      .map((e: any, i: number) => ({ e, i }))
      .filter(({ e }: any) => typeof e.ask === "string")
      .map(({ e, i }: any) => ({
        id: `ask/${t.id ?? "doc"}/${i + 1}`,
        ask: m("check.review.ask", { block: t.id ? (doc.defs[t.id]?.label ?? t.id) : doc.name, ask: e.ask }),
        why_not_rule: m("review.ask-why"),
        scope: (t.id ? "item" : "document") as "item" | "document",
      })),
  );
}

export function reviewChecks(root: string, doc: Doc): Check[] {
  if (!doc.kind) return [];
  const aspects = [...loadAspects(root, doc.kind).map((a) => ({ ...a, scope: "document" as const })), ...askAspects(doc)];
  return aspects.map((a) =>
    defineCheck({
      id: `review/${a.id}`,
      axis: "review",
      scope: a.scope,
      trigger: "review",
      kinds: ["*"],
      severity: "warn",
      async run(doc, ctx) {
        const model = ctx.config.review.model;
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
          if (!out) throw new Unknown(m("check.review.failed", { error: last?.message }));
        }
        if (!out || out.verdict === "pass") return [];
        const fs = out.findings.length ? out.findings : [{ reason: m("check.review.no-reason") }];
        return fs.map((f: { blockId?: string; reason: string }) =>
          ctx.fail(f.reason, { blockId: f.blockId, line: f.blockId ? doc.defs[f.blockId]?.line : undefined }),
        );
      },
    }),
  );
}
