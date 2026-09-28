import { m } from "../messages";
import { basename, dirname, extname } from "node:path";
import { validateDoc } from "../schema/doc";
import { factText, type Fact } from "../facts/types";
import { defaultStrings, resolveWording, t, validateStrings } from "../wording";
import type { BuildErrorId, Def, Doc, Finding, TextNode } from "../types";
import { evalCalc, formatNumber } from "./calc";
import { loadYaml } from "./yaml";

export const TOKEN = /\{\{\s*([a-z_.]+)(?::([^}]*?))?\s*\}\}/g;
export const MARKER = /⟦(img|fig|cap):([^⟧]+)⟧/g;

/** 本文として扱わないキー（ID・パス・日付・図のソースなど） */
const SKIP = new Set([
  "id", "kind", "theme", "path", "url", "accessed", "updated", "effective", "version",
  "date", "type", "chart", "x", "y", "data", "source", "table", "unit_price", "qty",
  "verify", "capture", "expect",
]);


export interface BuildOptions {
  /** facts.yaml の fact */
  facts?: Record<string, Fact>;
  /** wordings/ を探すプロジェクトルート */
  root?: string;
  /** 表記スタイル名（CLI --wording。文書の wording: より優先） */
  wording?: string;
}

export function buildDoc(path: string, src: string, opts: BuildOptions = {}): Doc {
  const project = opts.facts ?? {};
  const loaded = loadYaml(src);
  const name = basename(path, extname(path));
  const buildErrors: Doc["buildErrors"] = [];
  const err = (checkId: BuildErrorId, message: string, loc: Omit<Finding["loc"], "doc"> = {}) =>
    buildErrors.push({ checkId, finding: { message, loc: { doc: name, ...loc } } });

  const defs: Record<string, Def> = {};
  const texts: TextNode[] = [];
  const placements: string[] = [];
  const citations: string[] = [];
  const facts: Record<string, Fact> = {};
  const factRefs: string[] = [];
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
    strings: defaultStrings(),
    facts,
    factRefs,
    buildErrors,
    lineOf,
    expand: (text, block) => expandText(text, block),
  };

  if (loaded.error) {
    err("schema/valid", m("parse.yaml", { error: loaded.error.message }), { line: loaded.error.line });
    return doc;
  }
  const schemaErrors = validateDoc(data);
  if (schemaErrors.length) {
    for (const e of schemaErrors) err("schema/valid", e.message, { line: lineOf(e.ptr) });
    return doc;
  }
  doc.kind = data.kind;
  for (const e of validateStrings(data.strings ?? {})) err("schema/valid", e.message, { line: lineOf(`/strings/${e.key}`) });
  const w = opts.root ? resolveWording(opts.root, opts.wording ?? data.wording ?? "default") : { strings: defaultStrings(), errors: [] };
  for (const e of w.errors) err("schema/valid", m("parse.wording", { error: e }), { line: lineOf("/wording") });
  const s = (doc.strings = { ...w.strings, ...(data.strings ?? {}) });
  if (buildErrors.length) return doc;

  // --- 定義と採番 ---
  const define = (id: string, def: Omit<Def, "line">) => {
    const line = lineOf(def.ptr);
    if (defs[id]) err("ref/resolve", m("parse.dup-id", { id, a: defs[id].type, b: def.type }), { blockId: id, line });
    else defs[id] = { ...def, line };
  };
  (data.articles ?? []).forEach((a: any, i: number) =>
    define(a.id, { type: "article", ptr: `/articles/${i}`, label: t(s, "number.article", { n: i + 1 }) }),
  );
  (data.steps ?? []).forEach((st: any, i: number) =>
    define(st.id, { type: "step", ptr: `/steps/${i}`, label: t(s, "number.step", { n: i + 1 }) }),
  );
  const defineSections = (list: any[], ptr: string, prefix: string) =>
    list.forEach((sec, i) => {
      const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      const label = s["heading.style"] === "none" ? t(s, "ref.section-plain", { title: sec.title }) : t(s, "ref.section", { num: prefix ? num : num + ".", title: sec.title });
      define(sec.id, { type: "section", ptr: `${ptr}/${i}`, label });
      if (sec.children) defineSections(sec.children, `${ptr}/${i}/children`, num);
    });
  defineSections(data.sections ?? [], "/sections", "");
  (data.tables ?? []).forEach((tb: any, i: number) => define(tb.id, { type: "table", ptr: `/tables/${i}`, label: t(s, "number.table", { n: i + 1 }) }));
  (data.images ?? []).forEach((m: any, i: number) => define(m.id, { type: "image", ptr: `/images/${i}` }));
  (data.figures ?? []).forEach((f: any, i: number) => define(f.id, { type: "figure", ptr: `/figures/${i}` }));
  (data.sources ?? []).forEach((src: any, i: number) => define(src.id, { type: "source", ptr: `/sources/${i}` }));
  (data.facts ?? []).forEach((f: any, i: number) => {
    const line = lineOf(`/facts/${i}`);
    if (project[f.id]) err("ref/resolve", m("parse.dup-fact-project", { id: f.id }), { blockId: f.id, line });
    else if (facts[f.id]) err("ref/resolve", m("parse.dup-fact", { id: f.id }), { blockId: f.id, line });
    else facts[f.id] = { ...f, origin: name, line };
  });
  const factOf = (id?: string) => (id ? facts[id] ?? project[id] : undefined);

  // --- 本文テキストの収集 ---
  const quotes: { ptr: string; source: string; blockId?: string }[] = [];
  const tableBlocks: { ptr: string; id: string; blockId?: string }[] = [];
  const walk = (v: unknown, ptr: string, blockId?: string, block?: Record<string, unknown>) => {
    if (typeof v === "string") texts.push({ ptr, raw: v, blockId, block, line: lineOf(ptr), sentences: [] });
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

  // --- 文の分割: ブロックごとに通し番号 ---
  const counter = new Map<string, number>();
  for (const t of texts) {
    const key = t.blockId ?? t.ptr;
    // 見出し（title）は本文の文と分けて <blockId>#title
    if (t.ptr.endsWith("/title") && t.blockId) {
      t.sentences.push({ id: `${key}#title`, start: 0, end: t.raw.length });
      continue;
    }
    for (const [start, end] of splitSentences(t.raw)) {
      const n = (counter.get(key) ?? 0) + 1;
      counter.set(key, n);
      t.sentences.push({ id: `${key}#${n}`, start, end });
    }
  }

  // --- 配置順（図・画像）と引用順（出典）---
  const quoteAt = new Map(quotes.map((q) => [q.ptr, q.source]));
  for (const t of texts) {
    const q = quoteAt.get(t.ptr.replace(/\/text$/, ""));
    if (q && !citations.includes(q)) citations.push(q);
    for (const m of t.raw.matchAll(TOKEN)) {
      const [, n, arg] = m;
      if ((n === "img" || n === "fig") && arg && !placements.includes(arg)) placements.push(arg);
      if (n === "cite" && arg && !citations.includes(arg)) citations.push(arg);
      if ((n === "fact" || n === "capture") && arg && !factRefs.includes(arg.trim())) factRefs.push(arg.trim());
    }
  }
  placements.forEach((id, i) => {
    if (defs[id] && (defs[id].type === "image" || defs[id].type === "figure")) defs[id].label = t(s, "number.figure", { n: i + 1 });
  });
  citations.forEach((id, i) => {
    if (defs[id]?.type === "source") defs[id].label = t(s, "number.source", { n: i + 1 });
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
          if (!d) return issue("ref/resolve", m("parse.undefined-ref", { id: arg }));
          if (!d.label) return issue("ref/resolve", m("parse.unplaced-ref", { id: arg, type: d.type }));
          return d.label;
        }
        case "cite": {
          const d = arg ? defs[arg] : undefined;
          if (d?.type !== "source") return issue("ref/resolve", m("parse.undefined-cite", { id: arg }));
          return d.label!;
        }
        case "img":
        case "fig": {
          const want = n === "img" ? "image" : "figure";
          if (defs[arg ?? ""]?.type !== want) return issue("ref/resolve", m(n === "img" ? "parse.undefined-img" : "parse.undefined-fig", { id: arg }));
          return `⟦${n}:${arg}⟧`;
        }
        case "fact": {
          const f = factOf(arg);
          return f ? factText(f) : issue("ref/resolve", m("parse.undefined-fact", { id: arg }));
        }
        case "capture": {
          const f = factOf(arg);
          if (!f?.capture) return issue("ref/resolve", m("parse.undefined-capture", { id: arg }));
          return `⟦cap:${arg}⟧`;
        }
        case "calc":
          try {
            return formatNumber(evalCalc(arg ?? "", data, block));
          } catch (e) {
            return issue("calc/eval", m("parse.calc", { expr: arg, error: (e as Error).message }));
          }
        case "n": {
          const label = block && typeof block.id === "string" ? defs[block.id]?.label : undefined;
          return label ? label.replace(/\D/g, "") : "?";
        }
        default: {
          if (arg === undefined && block && ["string", "number"].includes(typeof block[n])) return String(block[n]);
          return issue("ref/resolve", m("parse.undefined-field", { name: n }));
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
    if (defs[q.source]?.type !== "source") err("ref/resolve", m("parse.undefined-quote-source", { id: q.source }), { blockId: q.blockId, line: lineOf(q.ptr) });
  const reserved = data.kind === "proposal" ? ["costs", "schedule"] : [];
  for (const b of tableBlocks)
    if (defs[b.id]?.type !== "table" && !reserved.includes(b.id))
      err("ref/resolve", m("parse.undefined-table", { id: b.id }), { blockId: b.blockId, line: lineOf(b.ptr) });

  return doc;
}

/** 文の区切り: 「。！？」の直後（閉じ括弧は含める）と改行。空白だけの区間は捨てる */
export function splitSentences(s: string): [number, number][] {
  const out: [number, number][] = [];
  let start = 0;
  const push = (end: number) => {
    if (s.slice(start, end).trim()) out.push([start, end]);
    start = end;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\n") push(i + 1);
    else if ("。！？!?".includes(c)) {
      let j = i + 1;
      while (j < s.length && "」』）)".includes(s[j])) j++;
      push(j);
      i = j - 1;
    }
  }
  push(s.length);
  return out;
}
