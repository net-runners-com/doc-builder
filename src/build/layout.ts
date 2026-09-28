import { resolve } from "node:path";
import { MARKER } from "../parse/doc";
import { formatNumber } from "../parse/calc";
import type { ResolvedTheme } from "../theme/types";
import type { Doc } from "../types";

export type Node =
  | { t: "h"; level: 2 | 3 | 4; text: string }
  | { t: "code"; text: string }
  | { t: "p"; text: string }
  | { t: "ol" | "ul"; items: string[] }
  | { t: "table"; columns: string[]; rows: string[][]; caption?: string }
  | { t: "quote"; text: string; cite?: string }
  | { t: "figure"; id: string; path: string; alt: string; caption?: string }
  | { t: "kv"; label: string; text: string }
  | { t: "sources"; items: { label: string; title: string; url: string; accessed: string }[] };

export interface Layout {
  title: string;
  cover: { label: string; value: string }[];
  nodes: Node[];
}

export const FIELD_LABEL: Record<string, string> = {
  title: "タイトル",
  version: "版",
  updated: "更新日",
  effective: "施行日",
  owner: "作成",
  client: "宛先",
  audience: "対象",
};

/** figures の id → 描画済み SVG の絶対パス */
export type Assets = Record<string, string>;

export function layout(doc: Doc, theme: ResolvedTheme, assets: Assets, snapshot: (id: string) => string | undefined = () => undefined): Layout {
  const d = doc.data;
  const nodes: Node[] = [];
  const x = (s: string, block?: Record<string, unknown>) => doc.expand(s, block);
  const placedTables = new Set<string>();

  const figureNode = (kind: string, id: string): Node => {
    if (kind === "img") {
      const img = d.images.find((i: any) => i.id === id);
      return { t: "figure", id, path: resolve(doc.dir, img.path), alt: img.alt, caption: img.caption ? x(img.caption, img) : undefined };
    }
    const f = d.figures.find((i: any) => i.id === id);
    return { t: "figure", id, path: assets[id] ?? "", alt: f.caption ? x(f.caption, f) : id, caption: f.caption ? x(f.caption, f) : undefined };
  };

  /** 段落テキストを p と figure に分ける */
  const para = (text: string, block?: Record<string, unknown>) => {
    const s = x(text, block);
    let last = 0;
    for (const m of s.matchAll(MARKER)) {
      const before = s.slice(last, m.index).trim();
      if (before) nodes.push({ t: "p", text: before });
      nodes.push(m[1] === "cap" ? { t: "code", text: snapshot(m[2]) ?? "（未取得）" } : figureNode(m[1], m[2]));
      last = m.index! + m[0].length;
    }
    const rest = s.slice(last).trim();
    if (rest) nodes.push({ t: "p", text: rest });
  };

  const tableNode = (id: string) => {
    placedTables.add(id);
    if (id === "costs") {
      const rows = (d.costs ?? []).map((c: any) => [c.item, `${formatNumber(c.unit_price)}円`, formatNumber(c.qty), `${formatNumber(c.unit_price * c.qty)}円`]);
      rows.push(["合計", "", "", x(d.total ?? "{{calc:sum(costs, unit_price*qty)}}円")]);
      nodes.push({ t: "table", columns: ["項目", "単価", "数量", "金額"], rows });
    } else if (id === "schedule") {
      nodes.push({ t: "table", columns: ["時期", "内容"], rows: (d.schedule ?? []).map((s: any) => [s.date, x(s.task)]) });
    } else {
      const t = d.tables.find((t: any) => t.id === id);
      nodes.push({
        t: "table",
        columns: t.columns.map((c: string) => x(c)),
        rows: t.rows.map((r: any[]) => r.map((c) => (typeof c === "number" ? formatNumber(c) : x(c)))),
        caption: `${doc.defs[id].label}${t.title ? ` ${x(t.title)}` : ""}`,
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

  const heading = (num: string, title: string) => (theme.numbering.heading === "none" ? title : `${num} ${title}`);
  const sections = (list: any[], prefix: string, level: 2 | 3 | 4) =>
    list.forEach((s, i) => {
      const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}.`;
      nodes.push({ t: "h", level, text: heading(num, x(s.title)) });
      body(s.body, s);
      if (s.children) sections(s.children, num.replace(/\.$/, ""), Math.min(level + 1, 4) as 3 | 4);
    });

  switch (doc.kind) {
    case "terms":
      if (d.preamble) para(d.preamble);
      for (const a of d.articles) {
        nodes.push({ t: "h", level: 2, text: `${doc.defs[a.id].label}（${x(a.title)}）` });
        if (a.clauses.length === 1) para(a.clauses[0], a);
        else nodes.push({ t: "ol", items: a.clauses.map((c: string) => x(c, a)) });
      }
      if (d.supplement) {
        nodes.push({ t: "h", level: 2, text: "附則" });
        para(d.supplement);
      }
      break;
    case "procedure":
      nodes.push({ t: "h", level: 2, text: "目的" });
      para(d.purpose);
      if (d.prerequisites?.length) {
        nodes.push({ t: "h", level: 2, text: "前提条件" });
        nodes.push({ t: "ul", items: d.prerequisites.map((p: string) => x(p)) });
      }
      nodes.push({ t: "h", level: 2, text: "手順" });
      for (const s of d.steps) {
        nodes.push({ t: "h", level: 3, text: `${doc.defs[s.id].label}：${x(s.title)}` });
        nodes.push({ t: "ol", items: s.actions.map((a: string) => x(a, s)) });
        nodes.push({ t: "kv", label: "期待結果", text: x(s.expected, s) });
      }
      if (d.troubleshooting?.length) {
        nodes.push({ t: "h", level: 2, text: "トラブルシューティング" });
        nodes.push({ t: "table", columns: ["症状", "対処"], rows: d.troubleshooting.map((r: any) => [x(r.symptom), x(r.action)]) });
      }
      break;
    case "proposal":
    case "guide":
      sections(d.sections, "", 2);
      if (doc.kind === "proposal") {
        if (d.costs?.length && !placedTables.has("costs")) {
          nodes.push({ t: "h", level: 2, text: "費用" });
          tableNode("costs");
        }
        if (d.schedule?.length && !placedTables.has("schedule")) {
          nodes.push({ t: "h", level: 2, text: "スケジュール" });
          tableNode("schedule");
        }
      }
      break;
  }

  if (doc.citations.length)
    nodes.push({
      t: "sources",
      items: doc.citations.map((id) => {
        const s = d.sources.find((s: any) => s.id === id);
        return { label: doc.defs[id].label!, title: s.title, url: s.url, accessed: s.accessed };
      }),
    });

  const cover = theme.cover.fields.filter((f) => f !== "title" && d.meta[f]).map((f) => ({ label: FIELD_LABEL[f], value: String(d.meta[f]) }));
  return { title: d.meta.title, cover, nodes };
}
