import { join } from "node:path";
import { buildContent } from "../../build/content";
import { analyze, queryMarks, type PaginationIssue } from "../../build/pagination";
import { emitTypst } from "../../build/typst";
import { readSnapshot } from "../../facts/load";
import { m } from "../../messages";
import { loadCompany } from "../../page/company";
import { registry } from "../../page/components";
import { renderFigures, renderOptions } from "../../render";
import type { Doc } from "../../types";
import { defineCheck, type CheckCtx } from "../define";

/** 1 回の実行の中で文書ごとに 1 度だけ組版する（実行をまたいで保存はしない） */
async function issues(doc: Doc, ctx: CheckCtx): Promise<PaginationIssue[]> {
  const key = `pagination:${doc.name}`;
  if (!ctx.memo.has(key)) {
    const work = join(ctx.workDir, "pagination", doc.name);
    const { svgs } = await renderFigures(doc, join(ctx.workDir, "pagination-render", doc.name), renderOptions(ctx.theme, ctx.config, doc.strings));
    emitTypst(buildContent(doc, svgs, (id) => readSnapshot(ctx.root, id)), ctx.theme, doc, work, { page: ctx.layout, reg: registry(ctx.root), company: loadCompany(ctx.root).company });
    const { page, marks } = queryMarks(work);
    ctx.memo.set(key, analyze(page, marks, parseFloat(ctx.theme.pagination.max_gap) / 100));
  }
  return ctx.memo.get(key) as PaginationIssue[];
}

const loc = (doc: Doc, i: PaginationIssue) => ({ blockId: doc.defs[i.id] ? i.id : undefined, line: doc.defs[i.id]?.line });

export const pageBreaks = defineCheck({
  id: "layout/breaks",
  axis: "layout",
  scope: "document",
  trigger: "render",
  kinds: ["*"],
  severity: "error",
  run: async (doc, ctx) =>
    (await issues(doc, ctx))
      .filter((i) => i.type !== "gap")
      .map((i) => ctx.fail(m(`check.pagination.${i.type}`, { id: i.id, kind: m(`kind.${i.kind}`), page: i.page }), loc(doc, i))),
});

export const pageGaps = defineCheck({
  id: "layout/gaps",
  axis: "layout",
  scope: "document",
  trigger: "render",
  kinds: ["*"],
  severity: "warn",
  run: async (doc, ctx) =>
    (await issues(doc, ctx))
      .filter((i) => i.type === "gap")
      .map((i) => ctx.fail(m("check.pagination.gap", { id: i.id, kind: m(`kind.${i.kind}`), page: i.page, ratio: Math.round(i.ratio! * 100) }), loc(doc, i))),
});
