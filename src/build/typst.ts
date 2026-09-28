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

function node(n: Node, asset: (p: string, id: string) => string, s: Strings): string {
  switch (n.t) {
    case "h":
      return `${"=".repeat(n.level - 1)} ${inline(n.text)}\n`;
    case "p":
      return `${inline(n.text)}\n`;
    case "ol":
      return n.items.map((s) => `+ ${inline(s)}`).join("\n") + "\n";
    case "ul":
      return n.items.map((s) => `- ${inline(s)}`).join("\n") + "\n";
    case "kv":
      return `#strong[${esc(n.label)}：] ${inline(n.text)}\n`;
    case "code":
      return `#raw(block: true, ${str(n.text.replace(/\n$/, ""))})\n`;
    case "table": {
      const cells = (r: string[]) => r.map((c) => `[${inline(c)}]`).join(", ");
      const t = `table(columns: ${n.columns.length}, table.header(${cells(n.columns)}), ${n.rows.map(cells).join(", ")})`;
      return n.caption ? `#figure(${t}, caption: [${inline(n.caption)}])\n` : `#${t}\n`;
    }
    case "quote":
      return `#quote(${n.cite ? `attribution: [${esc(n.cite)}]` : ""})[${inline(n.text)}]\n`;
    case "figure":
      return `#figure(image(${str(asset(n.path, n.id))}, alt: ${str(n.alt)})${n.caption ? `, caption: [${inline(n.caption)}]` : ""})\n`;
    case "sources":
      return `= ${esc(t(s, "section.sources"))}\n${n.items.map((it) => `${esc(it.label)} ${esc(it.title)}. #link(${str(it.url)}) ${esc(t(s, "label.accessed", { date: it.accessed }))}\n`).join("\n")}`;
  }
}

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
  const themeJson = { ...theme, paper: PAPER[theme.page.size], margin: theme.page.margin, fonts: availableFonts(theme.fonts) };
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
  const body = l.nodes.map((n) => node(n, asset, doc.strings)).join("\n");
  const src = [
    `#import "template.typ": template`,
    ...imports,
    `#let theme = json("theme.json")`,
    `#let ctx = json("ctx.json")`,
    `#show: template.with(theme: theme, title: ${str(l.title)}, cover: ${region("cover")}, front: ${region("front")}, back: ${region("back")}, header: ${region("header")}, footer: ${region("footer")}, start: ${str(p.page.page_numbers.start_at)}, watermark: ${wm})`,
    "",
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
