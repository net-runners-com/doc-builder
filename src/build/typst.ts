import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { requireTool } from "../errors";
import { installedFonts } from "../theme/fonts";
import { watermarkActive } from "../theme/resolve";
import type { ResolvedTheme } from "../theme/types";
import type { Doc } from "../types";
import type { Layout, Node } from "./layout";

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

/** ヘッダー・フッターのテンプレート文字列を Typst content にする */
export function hfContent(tpl: string | undefined, meta: Record<string, unknown>): string {
  if (!tpl) return "[]";
  const parts = tpl.split(/(\{\{\s*(?:page|pages|meta\.[a-z_]+)\s*\}\})/);
  const body = parts
    .map((p) => {
      const m = p.match(/^\{\{\s*(page|pages|meta\.([a-z_]+))\s*\}\}$/);
      if (!m) return esc(p);
      if (m[1] === "page") return "#context counter(page).display()";
      if (m[1] === "pages") return "#context counter(page).final().first()";
      return esc(String(meta[m[2]] ?? ""));
    })
    .join("");
  return `[${body}]`;
}

function node(n: Node, asset: (p: string, id: string) => string): string {
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
    case "table": {
      const cells = (r: string[]) => r.map((c) => `[${inline(c)}]`).join(", ");
      const t = `table(columns: ${n.columns.length}, table.header(${cells(n.columns)}), ${n.rows.map(cells).join(", ")})`;
      return n.caption ? `#figure(${t}, caption: [${inline(n.caption)}])\n` : `#${t}\n`;
    }
    case "quote":
      return `#quote(${n.cite ? `attribution: [${esc(n.cite)}]` : ""})[${inline(n.text)}]\n`;
    case "figure":
      return `#figure(image(${str(asset(n.path, n.id))}, alt: ${str(n.alt)}, width: 80%)${n.caption ? `, caption: [${inline(n.caption)}]` : ""})\n`;
    case "sources":
      return `= 出典\n${n.items.map((s) => `${esc(s.label)} ${esc(s.title)}. #link(${str(s.url)}) （閲覧日: ${esc(s.accessed)}）\n`).join("\n")}`;
  }
}

/** 未インストールのフォントを除く（typst の警告を避ける）。全滅なら元のまま */
function availableFonts(f: ResolvedTheme["fonts"]) {
  const have = installedFonts();
  const pick = (l: string[]) => (l.some((x) => have.has(x)) ? l.filter((x) => have.has(x)) : l);
  return { body: pick(f.body), heading: pick(f.heading), mono: pick(f.mono) };
}

/** Typst ソースを組み立てる（work ディレクトリにアセットをコピーする） */
export function emitTypst(l: Layout, theme: ResolvedTheme, doc: Doc, work: string): string {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, "assets"), { recursive: true });
  const asset = (p: string, id: string) => {
    const f = `assets/${id}${extname(p)}`;
    copyFileSync(p, join(work, f));
    return f;
  };
  copyFileSync(theme.template ?? join(import.meta.dir, "template.typ"), join(work, "template.typ"));
  let logo: string | null = null;
  if (theme.cover.logo && existsSync(theme.cover.logo)) logo = asset(theme.cover.logo, "_logo");
  const t = {
    paper: PAPER[theme.page.size],
    margin: theme.page.margin,
    colors: theme.colors,
    fonts: availableFonts(theme.fonts),
    cover: { enabled: theme.cover.enabled, logo },
    toc: theme.toc,
    start_at: theme.footer.start_at,
  };
  writeFileSync(join(work, "theme.json"), JSON.stringify(t, null, 2));
  const meta = doc.data.meta;
  const hf = (x: { left?: string; center?: string; right?: string }) =>
    `(left: ${hfContent(x.left, meta)}, center: ${hfContent(x.center, meta)}, right: ${hfContent(x.right, meta)})`;
  const wm = watermarkActive(theme, meta) ? str(theme.watermark!.text) : "none";
  const cover = `(${l.cover.map((c) => `(label: ${str(c.label)}, value: ${str(c.value)})`).join(", ")}${l.cover.length === 1 ? "," : ""})`;
  const src = [
    `#import "template.typ": template`,
    `#show: template.with(theme: json("theme.json"), title: ${str(l.title)}, cover: ${cover}, header: ${hf(theme.header)}, footer: ${hf(theme.footer)}, watermark: ${wm})`,
    "",
    ...l.nodes.map((n) => node(n, asset)),
  ].join("\n");
  writeFileSync(join(work, "main.typ"), src);
  return src;
}

export async function emitPdf(l: Layout, theme: ResolvedTheme, doc: Doc, work: string, out: string): Promise<string> {
  const typst = requireTool("typst", "brew install typst");
  emitTypst(l, theme, doc, work);
  mkdirSync(dirname(out), { recursive: true });
  const p = Bun.spawnSync([typst, "compile", "--root", work, join(work, "main.typ"), out], { stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`typst: ${p.stderr.toString().trim().split("\n").slice(0, 6).join(" / ")}（${basename(work)}/main.typ）`);
  return out;
}
