import { copyFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import type { ResolvedTheme } from "../theme/types";
import type { Layout, Node } from "./layout";

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Markdown に反映しないテーマ項目 */
export const MD_IGNORED = ["page", "colors", "fonts", "header", "footer", "watermark", "template", "cover.logo"];

export function emitMarkdown(l: Layout, theme: ResolvedTheme, outDir: string, docName: string): string {
  const out: string[] = [`# ${l.title}`, ""];
  if (theme.cover.enabled && l.cover.length) out.push(...l.cover.map((c) => `- ${c.label}: ${c.value}`), "");
  if (theme.toc.enabled) {
    const hs = l.nodes.filter((n): n is Extract<Node, { t: "h" }> => n.t === "h" && n.level - 1 <= theme.toc.depth);
    if (hs.length) out.push("## 目次", "", ...hs.map((h) => `${"  ".repeat(h.level - 2)}- ${h.text}`), "");
  }
  for (const n of l.nodes) {
    switch (n.t) {
      case "h":
        out.push(`${"#".repeat(n.level)} ${n.text}`, "");
        break;
      case "p":
        out.push(n.text, "");
        break;
      case "ol":
        out.push(...n.items.map((s, i) => `${i + 1}. ${s}`), "");
        break;
      case "ul":
        out.push(...n.items.map((s) => `- ${s}`), "");
        break;
      case "kv":
        out.push(`**${n.label}：** ${n.text}`, "");
        break;
      case "table":
        if (n.caption) out.push(`**${n.caption}**`, "");
        out.push(`| ${n.columns.map(cell).join(" | ")} |`, `|${n.columns.map(() => "---").join("|")}|`, ...n.rows.map((r) => `| ${r.map(cell).join(" | ")} |`), "");
        break;
      case "quote":
        out.push(...n.text.split("\n").map((s) => `> ${s}`), ...(n.cite ? [`> — ${n.cite}`] : []), "");
        break;
      case "figure": {
        mkdirSync(join(outDir, "assets"), { recursive: true });
        const file = `${docName}-${n.id}${extname(n.path)}`;
        if (n.path) copyFileSync(n.path, join(outDir, "assets", file));
        out.push(`![${n.alt}](assets/${file})`, ...(n.caption ? ["", `*${n.caption}*`] : []), "");
        break;
      }
      case "sources":
        out.push("## 出典", "", ...n.items.map((s) => `${s.label} ${s.title}. <${s.url}>（閲覧日: ${s.accessed}）  `), "");
        break;
    }
  }
  return out.join("\n").replace(/\n+$/, "\n");
}
