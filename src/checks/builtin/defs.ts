import { m } from "../../messages";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { at, defineCheck } from "../define";

const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const external = (u: string) => /^([a-z]+:|#)/i.test(u);

export const linkLocal = defineCheck({
  id: "link/local",
  axis: "fact",
  scope: "item",
  kinds: ["*"],
  severity: "error",
  run(doc, ctx) {
    const out = [];
    for (const t of doc.texts)
      for (const x of t.raw.matchAll(LINK)) {
        const target = x[1].split("#")[0];
        if (external(x[1]) || !target) continue;
        if (!existsSync(resolve(doc.dir, target))) out.push(ctx.fail(m("check.link.missing", { target: x[1] }), at(t)));
      }
    (doc.data.images ?? []).forEach((img: any, i: number) => {
      if (!existsSync(resolve(doc.dir, img.path)))
        out.push(ctx.fail(m("check.image.missing", { path: img.path }), { blockId: img.id, line: doc.lineOf(`/images/${i}/path`) }));
    });
    return out;
  },
});

export const imageAlt = defineCheck({
  id: "image/alt",
  axis: "structure",
  scope: "item",
  kinds: ["*"],
  severity: "error",
  run: (doc, ctx) =>
    (doc.data.images ?? [])
      .map((img: any, i: number) => ({ img, i }))
      .filter(({ img }: any) => !String(img.alt ?? "").trim())
      .map(({ img, i }: any) => ctx.fail(m("check.image.alt"), { blockId: img.id, line: doc.lineOf(`/images/${i}`) })),
});

export const figureCaption = defineCheck({
  id: "figure/caption",
  axis: "structure",
  scope: "item",
  kinds: ["*"],
  severity: "error",
  run: (doc, ctx) =>
    (doc.data.figures ?? [])
      .map((f: any, i: number) => ({ f, i }))
      .filter(({ f }: any) => !String(f.caption ?? "").trim())
      .map(({ f, i }: any) => ctx.fail(m("check.figure.caption"), { blockId: f.id, line: doc.lineOf(`/figures/${i}`) })),
});

export const unusedDefs = defineCheck({
  id: "unused/defs",
  axis: "structure",
  scope: "document",
  kinds: ["*"],
  severity: "warn",
  run(doc, ctx) {
    const out = [];
    for (const [id, d] of Object.entries(doc.defs)) {
      const unused =
        (d.type === "source" && !doc.citations.includes(id)) ||
        ((d.type === "image" || d.type === "figure") && !doc.placements.includes(id));
      if (unused) out.push(ctx.fail(m("check.unused.def", { type: d.type, id }), { blockId: id, line: d.line }));
    }
    for (const f of Object.values(doc.facts))
      if (!doc.factRefs.includes(f.id)) out.push(ctx.fail(m("check.unused.fact", { id: f.id }), { blockId: f.id, line: f.line }));
    return out;
  },
});

const DAY = 86_400_000;

export const sourceStale = defineCheck({
  id: "source/stale",
  axis: "fact",
  scope: "item",
  kinds: ["*"],
  severity: "warn",
  run(doc, ctx) {
    const max = ctx.config.sourceMaxAgeDays;
    return (doc.data.sources ?? [])
      .map((s: any, i: number) => ({ s, i, age: Math.floor((ctx.today.getTime() - Date.parse(s.accessed)) / DAY) }))
      .filter(({ age }: any) => age > max)
      .map(({ s, i, age }: any) =>
        ctx.fail(m("check.source.stale", { accessed: s.accessed, age, max }), { blockId: s.id, line: doc.lineOf(`/sources/${i}/accessed`) }),
      );
  },
});

export const defChecks = [linkLocal, imageAlt, figureCaption, unusedDefs, sourceStale];
