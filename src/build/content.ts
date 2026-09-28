import { resolve } from "node:path";
import { t } from "../wording";
import { formatNumber } from "../parse/calc";
import { MARKER } from "../parse/doc";
import type { Doc } from "../types";

/** 固定見出しは key（wording の ID）、節は id を持つ。チェックや UI は日本語ではなくこれで特定する */
export type Node =
  | { t: "h"; level: 2 | 3 | 4; text: string; key?: string; id?: string }
  | { t: "code"; text: string }
  | { t: "p"; text: string }
  | { t: "ol" | "ul"; items: string[] }
  | { t: "table"; columns: string[]; rows: string[][]; caption?: string; id?: string; breakable?: boolean }
  | { t: "quote"; text: string; cite?: string }
  | { t: "figure"; id: string; path: string; alt: string; caption?: string }
  | { t: "kv"; key: string; label: string; text: string }
  | { t: "sources"; items: { label: string; title: string; url: string; accessed: string }[] }
  /** まとめて同じページに置きたい塊（条・手順）。高さが収まれば分割しない */
  | { t: "group"; id: string; nodes: Node[] };

export interface Content {
  title: string;
  nodes: Node[];
}

export const META_FIELDS = ["title", "version", "updated", "effective", "owner", "client", "audience", "number"] as const;

/** figures の id → 描画済み SVG の絶対パス */
export type Assets = Record<string, string>;

export function buildContent(doc: Doc, assets: Assets, snapshot: (id: string) => string | undefined = () => undefined): Content {
  const d = doc.data;
  const s = doc.strings;
  const nodes: Node[] = [];
  const x = (str: string, block?: Record<string, unknown>) => doc.expand(str, block);
  const yen = (n: number) => t(s, "unit.yen", { n: formatNumber(n) });
  const fixed = (level: 2 | 3, key: string) => nodes.push({ t: "h", level, key, text: t(s, key) });
  const placedTables = new Set<string>();
  /** fn の中で積んだノードを 1 つの group にまとめる */
  const group = (id: string, fn: () => void) => {
    const start = nodes.length;
    fn();
    nodes.push({ t: "group", id, nodes: nodes.splice(start) });
  };

  const figureNode = (kind: string, id: string): Node => {
    if (kind === "img") {
      const img = d.images.find((i: any) => i.id === id);
      return { t: "figure", id, path: resolve(doc.dir, img.path), alt: img.alt, caption: img.caption ? x(img.caption, img) : undefined };
    }
    const f = d.figures.find((i: any) => i.id === id);
    return { t: "figure", id, path: assets[id] ?? "", alt: f.caption ? x(f.caption, f) : id, caption: f.caption ? x(f.caption, f) : undefined };
  };

  /** 段落テキストを p / figure / code に分ける */
  const para = (text: string, block?: Record<string, unknown>) => {
    const str = x(text, block);
    let last = 0;
    for (const m of str.matchAll(MARKER)) {
      const before = str.slice(last, m.index).trim();
      if (before) nodes.push({ t: "p", text: before });
      nodes.push(m[1] === "cap" ? { t: "code", text: snapshot(m[2]) ?? t(s, "label.unfetched") } : figureNode(m[1], m[2]));
      last = m.index! + m[0].length;
    }
    const rest = str.slice(last).trim();
    if (rest) nodes.push({ t: "p", text: rest });
  };

  const tableNode = (id: string) => {
    placedTables.add(id);
    if (id === "costs") {
      const rows = (d.costs ?? []).map((c: any) => [c.item, yen(c.unit_price), formatNumber(c.qty), yen(c.unit_price * c.qty)]);
      const sum = (d.costs ?? []).reduce((a: number, c: any) => a + c.unit_price * c.qty, 0);
      rows.push([t(s, "label.total"), "", "", d.total ? x(d.total) : yen(sum)]);
      nodes.push({ t: "table", id, columns: ["column.item", "column.unit-price", "column.qty", "column.amount"].map((k) => t(s, k)), rows });
    } else if (id === "schedule") {
      nodes.push({ t: "table", id, columns: [t(s, "column.period"), t(s, "column.task")], rows: (d.schedule ?? []).map((r: any) => [r.date, x(r.task)]) });
    } else {
      const tb = d.tables.find((tb: any) => tb.id === id);
      nodes.push({
        t: "table",
        id,
        columns: tb.columns.map((c: string) => x(c)),
        rows: tb.rows.map((r: any[]) => r.map((c) => (typeof c === "number" ? formatNumber(c) : x(c)))),
        caption: `${doc.defs[id].label}${tb.title ? ` ${x(tb.title)}` : ""}`,
        breakable: tb.breakable,
      });
    }
  };

  const body = (b: unknown, block?: Record<string, unknown>) => {
    for (const item of Array.isArray(b) ? b : [b]) {
      if (typeof item === "string") para(item, block);
      else if ((item as any).quote) {
        const q = (item as any).quote;
        nodes.push({ t: "quote", text: x(q.text), cite: doc.defs[q.source]?.label });
      } else if ((item as any).table) tableNode((item as any).table);
    }
  };

  const numbered = s["heading.style"] !== "none";
  const sections = (list: any[], prefix: string, level: 2 | 3 | 4) =>
    list.forEach((sec, i) => {
      const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}.`;
      nodes.push({ t: "h", level, id: sec.id, text: numbered ? `${num} ${x(sec.title)}` : x(sec.title) });
      body(sec.body, sec);
      if (sec.children) sections(sec.children, num.replace(/\.$/, ""), Math.min(level + 1, 4) as 3 | 4);
    });

  switch (doc.kind) {
    case "terms":
      if (d.preamble) para(d.preamble);
      for (const a of d.articles)
        group(a.id, () => {
          nodes.push({ t: "h", level: 2, id: a.id, text: t(s, "heading.article", { label: doc.defs[a.id].label!, title: x(a.title) }) });
          if (a.clauses.length === 1) para(a.clauses[0], a);
          else nodes.push({ t: "ol", items: a.clauses.map((c: string) => x(c, a)) });
        });
      if (d.supplement) {
        fixed(2, "section.supplement");
        para(d.supplement);
      }
      break;
    case "procedure":
      fixed(2, "section.purpose");
      para(d.purpose);
      if (d.prerequisites?.length) {
        fixed(2, "section.prerequisites");
        nodes.push({ t: "ul", items: d.prerequisites.map((p: string) => x(p)) });
      }
      fixed(2, "section.steps");
      for (const st of d.steps)
        group(st.id, () => {
        nodes.push({ t: "h", level: 3, id: st.id, text: t(s, "heading.step", { label: doc.defs[st.id].label!, title: x(st.title) }) });
        nodes.push({ t: "ol", items: st.actions.map((a: string) => x(a, st)) });
        nodes.push({ t: "kv", key: "label.expected", label: t(s, "label.expected"), text: x(st.expected, st) });
        const lbl = (id: string) => doc.defs[id]?.label ?? id;
        for (const b of st.branches ?? []) nodes.push({ t: "p", text: t(s, "label.branch", { cond: x(b.if), target: lbl(b.goto) }) });
        if (st.next) nodes.push({ t: "p", text: t(s, "label.goto", { target: lbl(st.next) }) });
        if (st.end) nodes.push({ t: "p", text: t(s, "label.end") });
        });
      if (d.troubleshooting?.length) {
        fixed(2, "section.troubleshooting");
        nodes.push({ t: "table", columns: [t(s, "column.symptom"), t(s, "column.action")], rows: d.troubleshooting.map((r: any) => [x(r.symptom), x(r.action)]) });
      }
      break;
    case "proposal":
    case "guide":
      sections(d.sections, "", 2);
      if (doc.kind === "proposal") {
        if (d.costs?.length && !placedTables.has("costs")) {
          fixed(2, "section.costs");
          tableNode("costs");
        }
        if (d.schedule?.length && !placedTables.has("schedule")) {
          fixed(2, "section.schedule");
          tableNode("schedule");
        }
      }
      break;
  }

  if (doc.citations.length)
    nodes.push({
      t: "sources",
      items: doc.citations.map((id) => {
        const src = d.sources.find((x: any) => x.id === id);
        return { label: doc.defs[id].label!, title: src.title, url: src.url, accessed: src.accessed };
      }),
    });

  return { title: d.meta.title, nodes };
}
