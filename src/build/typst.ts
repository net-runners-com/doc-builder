import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { requireTool } from "../errors";
import { installedFonts } from "../theme/fonts";
import { watermarkActive } from "../theme/resolve";
import type { ResolvedTheme } from "../theme/types";
import type { Doc } from "../types";
import type { Company } from "../page/company";
import type { Registry } from "../page/components";
import { regionTypst, typstFn, usedComponents } from "../page/emit";
import { REGIONS, type Region, type ResolvedLayout } from "../page/types";
import { t, type Strings } from "../wording";
import type { Content, Node } from "./content";

const PAPER = { A4: "a4", A5: "a5", B5: "iso-b5", Letter: "us-letter" } as const;

/** Typst マークアップ用のエスケープ */
export const esc = (s: string) =>
  s.replace(/[\\#\[\]*_`$<>@~=\-+/"]/g, (m) => "\\" + m).replace(/^(\d+)\./gm, "$1\\.");
const str = (s: string) => JSON.stringify(s);

/** 太字とリンクだけを Typst に変換し、残りはエスケープする */
export function inline(s: string): string {
  let out = "";
  let last = 0;
  for (const m of s.matchAll(/\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    out += esc(s.slice(last, m.index));
    out += m[1] !== undefined ? `#strong[${esc(m[1])}]` : `#link(${str(m[3])})[${esc(m[2])}]`;
    last = m.index! + m[0].length;
  }
  return out + esc(s.slice(last));
}

/** ブロック単位のノードは dtr-node で包む（高さを測って収まれば分割しない・位置の目印を置く） */
function node(n: Node, asset: (p: string, id: string) => string, s: Strings, seq: Map<string, number>): string {
  const autoId = (kind: string) => {
    const i = (seq.get(kind) ?? 0) + 1;
    seq.set(kind, i);
    return `${kind}-${i}`;
  };
  const wrap = (kind: string, id: string | undefined, body: string, opts: { keep?: boolean; sticky?: boolean } = {}) =>
    `#dtr-node(${str(kind)}, ${str(id ?? autoId(kind))}, ${body}, keep: ${opts.keep ?? true}, sticky: ${opts.sticky ?? false})\n`;
  switch (n.t) {
    case "h":
      return wrap("heading", n.id ?? n.key, `heading(level: ${n.level - 1})[${inline(n.text)}]`, { keep: false, sticky: true });
    case "group":
      return wrap("group", n.id, `[${n.nodes.map((c) => node(c, asset, s, seq)).join("\n")}]`);
    case "p":
      return `${TEXT_MARK}${inline(n.text)}\n`;
    case "ol":
      return `${TEXT_MARK}\n` + n.items.map((x) => `+ ${inline(x)}`).join("\n") + "\n";
    case "ul":
      return `${TEXT_MARK}\n` + n.items.map((x) => `- ${inline(x)}`).join("\n") + "\n";
    case "kv":
      return `${TEXT_MARK}#strong[${esc(n.label + t(s, "label.separator"))}] ${inline(n.text)}\n`;
    case "code":
      return wrap("code", undefined, `raw(block: true, ${str(n.text.replace(/\n$/, ""))})`);
    case "table": {
      const cells = (r: string[]) => r.map((c) => `[${inline(c)}]`).join(", ");
      const tb = `table(columns: ${n.columns.length}, table.header(${cells(n.columns)}), ${n.rows.map(cells).join(", ")})`;
      return wrap("table", n.id, n.caption ? `figure(${tb}, caption: [${inline(n.caption)}])` : tb, { keep: !n.breakable });
    }
    case "quote":
      return wrap("quote", undefined, `quote(${n.cite ? `attribution: [${esc(n.cite)}]` : ""})[${inline(n.text)}]`);
    case "figure":
      return wrap("figure", n.id, `figure(image(${str(asset(n.path, n.id))}, alt: ${str(n.alt)}, width: eval(theme.typography.figure_width))${n.caption ? `, caption: [${inline(n.caption)}]` : ""})`);
    case "sources":
      return `= ${esc(t(s, "section.sources"))}\n${n.items.map((it) => `${esc(it.label)} ${esc(it.title)}. #link(${str(it.url)}) ${esc(t(s, "label.accessed", { date: it.accessed }))}\n`).join("\n")}`;
  }
}

/** 本文（段落・箇条書き）の始まりの目印。見出しの取り残しの判定に使う */
const TEXT_MARK = `#dtr-mark("text", "", "start", false)`;

/** 位置の目印と、測って収まれば分割しないブロック */
const PAGINATION = `#let dtr-mark(kind, id, edge, keep) = context [#metadata((kind: kind, id: id, edge: edge, keep: keep, page: here().page(), y: here().position().y.pt())) <dtr>]
#let dtr-node(kind, id, body, keep: true, sticky: false) = context {
  let m = theme.margin
  let avail = page.height - eval(m.top) - eval(m.bottom)
  let w = page.width - 2 * eval(m.x)
  let fits = keep and measure(block(width: w, body)).height <= avail * eval(theme.pagination.keep_max)
  block(breakable: not fits, sticky: sticky, width: 100%, [#dtr-mark(kind, id, "start", fits)#body#dtr-mark(kind, id, "end", fits)])
}
#let dtr-page = context [#metadata((kind: "page", height: page.height.pt(), top: eval(theme.margin.top).pt(), bottom: eval(theme.margin.bottom).pt())) <dtr>]`;

/** 未インストールのフォントを除く（typst の警告を避ける）。全滅なら元のまま */
function availableFonts(f: ResolvedTheme["fonts"]) {
  const have = installedFonts();
  const pick = (l: string[]) => (l.some((x) => have.has(x)) ? l.filter((x) => have.has(x)) : l);
  return { body: pick(f.body), heading: pick(f.heading), mono: pick(f.mono) };
}

export interface PageInput {
  page: ResolvedLayout;
  reg: Registry;
  company?: Company;
}

/** Typst ソースを組み立てる（work ディレクトリにアセットをコピーする） */
export function emitTypst(l: Content, theme: ResolvedTheme, doc: Doc, work: string, p: PageInput): string {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, "assets"), { recursive: true });
  const copied = new Map<string, string>();
  const asset = (src: string, id: string) => {
    const f = copied.get(src) ?? `assets/${id}${extname(src)}`;
    if (!copied.has(src)) {
      copyFileSync(src, join(work, f));
      copied.set(src, f);
    }
    return f;
  };
  copyFileSync(theme.template ?? join(import.meta.dir, "template.typ"), join(work, "template.typ"));
  const meta = doc.data.meta;
  const themeJson = { ...theme, paper: PAPER[theme.page.size], margin: theme.page.margin, fonts: availableFonts(theme.fonts), colors: theme.colors };
  writeFileSync(join(work, "theme.json"), JSON.stringify(themeJson, null, 2));
  // 部品に渡す ctx（画像はルート相対パス "/assets/..." にする。Typst は --root 基準で解決する）
  const company = p.company ? { ...p.company, logo: p.company.logo && existsSync(p.company.logo) ? "/" + asset(p.company.logo, "_company-logo") : null } : null;
  const stamps: Record<string, string> = {};
  for (const [i, a] of ((meta.approvals ?? []) as any[]).entries()) {
    const path = a.stamp ? resolve(doc.dir, a.stamp) : undefined;
    if (path && existsSync(path)) stamps[a.role] = "/" + asset(path, `_stamp-${i}`);
  }
  writeFileSync(join(work, "ctx.json"), JSON.stringify({ meta, company, stamps, strings: doc.strings, theme: themeJson }, null, 2));
  const region = (r: Region) => {
    const xs = regionTypst(p.page[r], p.reg);
    return xs.length ? `[${xs.map((e) => `#(${e})`).join("\n\n")}]` : "none";
  };
  mkdirSync(join(work, "components"), { recursive: true });
  const imports = [...usedComponents(REGIONS.flatMap((r) => p.page[r]))].map((name) => {
    copyFileSync(p.reg[name].typ, join(work, "components", `${name}.typ`));
    return `#import "components/${name}.typ": render as ${typstFn(name)}`;
  });
  const wm = watermarkActive(theme, meta) ? str(theme.watermark!.text) : "none";
  const seq = new Map<string, number>();
  const body = l.nodes.map((n) => node(n, asset, doc.strings, seq)).join("\n");
  const src = [
    `#import "template.typ": template`,
    ...imports,
    `#let theme = json("theme.json")`,
    `#let ctx = json("ctx.json")`,
    PAGINATION,
    `#show: template.with(theme: theme, title: ${str(l.title)}, cover: ${region("cover")}, front: ${region("front")}, back: ${region("back")}, header: ${region("header")}, footer: ${region("footer")}, start: ${str(p.page.page_numbers.start_at)}, watermark: ${wm})`,
    "",
    "#dtr-page",
    body,
  ].join("\n");
  writeFileSync(join(work, "main.typ"), src);
  return src;
}

export async function emitPdf(l: Content, theme: ResolvedTheme, doc: Doc, work: string, out: string, p: PageInput): Promise<string> {
  const typst = requireTool("typst", "brew install typst");
  emitTypst(l, theme, doc, work, p);
  mkdirSync(dirname(out), { recursive: true });
  const proc = Bun.spawnSync([typst, "compile", "--root", work, join(work, "main.typ"), out], { stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error(`typst: ${proc.stderr.toString().trim().split("\n").slice(0, 6).join(" / ")}（${basename(work)}/main.typ）`);
  return out;
}
