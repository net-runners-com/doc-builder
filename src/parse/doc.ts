import { basename, dirname, extname } from "node:path";
import { validateDoc } from "../schema/doc";
import type { BuildErrorId, Def, Doc, Finding, Numbering, TextNode } from "../types";
import { evalCalc, formatNumber } from "./calc";
import { loadYaml } from "./yaml";

export const TOKEN = /\{\{\s*([a-z_.]+)(?::([^}]*?))?\s*\}\}/g;
export const MARKER = /⟦(img|fig):([^⟧]+)⟧/g;

/** 本文として扱わないキー（ID・パス・日付・図のソースなど） */
const SKIP = new Set([
  "id", "kind", "theme", "path", "url", "accessed", "updated", "effective", "version",
  "date", "type", "chart", "x", "y", "data", "source", "table", "unit_price", "qty",
]);

const fmt = (tpl: string, n: number | string) => tpl.replace("{n}", String(n));

export function buildDoc(path: string, src: string, numbering: Numbering): Doc {
  const loaded = loadYaml(src);
  const name = basename(path, extname(path));
  const buildErrors: Doc["buildErrors"] = [];
  const err = (checkId: BuildErrorId, message: string, loc: Omit<Finding["loc"], "doc"> = {}) =>
    buildErrors.push({ checkId, finding: { message, loc: { doc: name, ...loc } } });

  const defs: Record<string, Def> = {};
  const texts: TextNode[] = [];
  const placements: string[] = [];
  const citations: string[] = [];
  const data = loaded.data;
  const lineOf = loaded.lineOf;

  const doc: Doc = {
    name,
    path,
    dir: dirname(path),
    kind: undefined,
    data,
    defs,
    texts,
    placements,
    citations,
    buildErrors,
    lineOf,
    expand: (text, block) => expandText(text, block),
  };

  if (loaded.error) {
    err("schema/valid", `YAML 構文エラー: ${loaded.error.message}`, { line: loaded.error.line });
    return doc;
  }
  const schemaErrors = validateDoc(data);
  if (schemaErrors.length) {
    for (const e of schemaErrors) err("schema/valid", e.message, { line: lineOf(e.ptr) });
    return doc;
  }
  doc.kind = data.kind;

  // --- 定義と採番 ---
  const define = (id: string, def: Omit<Def, "line">) => {
    const line = lineOf(def.ptr);
    if (defs[id]) err("ref/resolve", `ID "${id}" が重複しています（${defs[id].type} と ${def.type}）`, { blockId: id, line });
    else defs[id] = { ...def, line };
  };
  (data.articles ?? []).forEach((a: any, i: number) =>
    define(a.id, { type: "article", ptr: `/articles/${i}`, label: fmt(numbering.terms, i + 1) }),
  );
  (data.steps ?? []).forEach((s: any, i: number) =>
    define(s.id, { type: "step", ptr: `/steps/${i}`, label: fmt(numbering.procedure, i + 1) }),
  );
  const defineSections = (list: any[], ptr: string, prefix: string) =>
    list.forEach((s, i) => {
      const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      const label = numbering.heading === "none" ? `「${s.title}」` : `「${num} ${s.title}」`;
      define(s.id, { type: "section", ptr: `${ptr}/${i}`, label });
      if (s.children) defineSections(s.children, `${ptr}/${i}/children`, num);
    });
  defineSections(data.sections ?? [], "/sections", "");
  (data.tables ?? []).forEach((t: any, i: number) => define(t.id, { type: "table", ptr: `/tables/${i}`, label: `表${i + 1}` }));
  (data.images ?? []).forEach((m: any, i: number) => define(m.id, { type: "image", ptr: `/images/${i}` }));
  (data.figures ?? []).forEach((f: any, i: number) => define(f.id, { type: "figure", ptr: `/figures/${i}` }));
  (data.sources ?? []).forEach((s: any, i: number) => define(s.id, { type: "source", ptr: `/sources/${i}` }));

  // --- 本文テキストの収集 ---
  const quotes: { ptr: string; source: string; blockId?: string }[] = [];
  const tableBlocks: { ptr: string; id: string; blockId?: string }[] = [];
  const walk = (v: unknown, ptr: string, blockId?: string, block?: Record<string, unknown>) => {
    if (typeof v === "string") texts.push({ ptr, raw: v, blockId, block, line: lineOf(ptr) });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${ptr}/${i}`, blockId, block));
    else if (v && typeof v === "object") {
      const o = v as Record<string, any>;
      const own = typeof o.id === "string";
      const bId = own ? o.id : blockId;
      const b = own ? o : block;
      if (o.quote) quotes.push({ ptr: `${ptr}/quote`, source: o.quote.source, blockId: bId });
      if (typeof o.table === "string") tableBlocks.push({ ptr, id: o.table, blockId: bId });
      for (const [k, x] of Object.entries(o)) if (!SKIP.has(k)) walk(x, `${ptr}/${k}`, bId, b);
    }
  };
  walk(data, "");

  // --- 配置順（図・画像）と引用順（出典）---
  const quoteAt = new Map(quotes.map((q) => [q.ptr, q.source]));
  for (const t of texts) {
    const q = quoteAt.get(t.ptr.replace(/\/text$/, ""));
    if (q && !citations.includes(q)) citations.push(q);
    for (const m of t.raw.matchAll(TOKEN)) {
      const [, n, arg] = m;
      if ((n === "img" || n === "fig") && arg && !placements.includes(arg)) placements.push(arg);
      if (n === "cite" && arg && !citations.includes(arg)) citations.push(arg);
    }
  }
  placements.forEach((id, i) => {
    if (defs[id] && (defs[id].type === "image" || defs[id].type === "figure")) defs[id].label = `図${i + 1}`;
  });
  citations.forEach((id, i) => {
    if (defs[id]?.type === "source") defs[id].label = `[${i + 1}]`;
  });

  // --- 展開 ---
  function expandText(text: string, block?: Record<string, unknown>, issues?: { id: BuildErrorId; msg: string }[]) {
    const issue = (id: BuildErrorId, msg: string) => {
      issues?.push({ id, msg });
      return "??";
    };
    return text.replace(TOKEN, (_all, n: string, arg?: string) => {
      arg = arg?.trim();
      switch (n) {
        case "ref": {
          const d = arg ? defs[arg] : undefined;
          if (!d) return issue("ref/resolve", `未定義の参照 "${arg}"`);
          if (!d.label) return issue("ref/resolve", `"${arg}"（${d.type}）は本文に配置されていないため参照できません`);
          return d.label;
        }
        case "cite": {
          const d = arg ? defs[arg] : undefined;
          if (d?.type !== "source") return issue("ref/resolve", `未定義の出典 "${arg}"`);
          return d.label!;
        }
        case "img":
        case "fig": {
          const want = n === "img" ? "image" : "figure";
          if (defs[arg ?? ""]?.type !== want) return issue("ref/resolve", `未定義の${n === "img" ? "画像" : "図"} "${arg}"`);
          return `⟦${n}:${arg}⟧`;
        }
        case "calc":
          try {
            return formatNumber(evalCalc(arg ?? "", data, block));
          } catch (e) {
            return issue("calc/eval", `計算式 "${arg}": ${(e as Error).message}`);
          }
        case "n": {
          const label = block && typeof block.id === "string" ? defs[block.id]?.label : undefined;
          return label ? label.replace(/\D/g, "") : "?";
        }
        default: {
          if (arg === undefined && block && ["string", "number"].includes(typeof block[n])) return String(block[n]);
          return issue("ref/resolve", `未定義のフィールド "${n}"`);
        }
      }
    });
  }
  doc.expand = (text, block) => expandText(text, block);

  for (const t of texts) {
    const issues: { id: BuildErrorId; msg: string }[] = [];
    expandText(t.raw, t.block, issues);
    for (const i of issues) err(i.id, i.msg, { blockId: t.blockId, line: t.line });
  }
  for (const q of quotes)
    if (defs[q.source]?.type !== "source") err("ref/resolve", `引用の出典 "${q.source}" が未定義です`, { blockId: q.blockId, line: lineOf(q.ptr) });
  const reserved = data.kind === "proposal" ? ["costs", "schedule"] : [];
  for (const b of tableBlocks)
    if (defs[b.id]?.type !== "table" && !reserved.includes(b.id))
      err("ref/resolve", `未定義の表 "${b.id}"`, { blockId: b.blockId, line: lineOf(b.ptr) });

  return doc;
}
