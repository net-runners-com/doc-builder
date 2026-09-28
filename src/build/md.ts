import { copyFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import type { Company } from "../page/company";
import { mdCtx, type Registry } from "../page/components";
import { regionMd } from "../page/emit";
import type { ResolvedLayout } from "../page/types";
import { t, type Strings } from "../wording";
import type { Content, Node } from "./content";

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Markdown に反映しないもの */
export const MD_IGNORED = ["テーマ（色・フォント・用紙・透かし）", "レイアウトの header / footer", "md.ts の無い部品"];

export function emitMarkdown(
  l: Content,
  page: ResolvedLayout,
  reg: Registry,
  data: { meta: Record<string, any>; company?: Company; strings: Strings },
  outDir: string,
  docName: string,
): string {
  const headings = l.nodes.filter((n): n is Extract<Node, { t: "h" }> => n.t === "h").map((h) => ({ level: h.level, text: h.text }));
  const ctx = mdCtx({ meta: data.meta, company: data.company, strings: data.strings, headings });
  const out: string[] = [`# ${l.title}`, ""];
  out.push(...regionMd(page.cover, reg, ctx), ...regionMd(page.front, reg, ctx));
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
        out.push(`**${n.label}${t(data.strings, "label.separator")}** ${n.text}`, "");
        break;
      case "code": {
        const fence = n.text.includes("```") ? "~~~~" : "```";
        out.push(fence + "text", n.text.replace(/\n$/, ""), fence, "");
        break;
      }
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
        out.push(`## ${t(data.strings, "section.sources")}`, "", ...n.items.map((s) => `${s.label} ${s.title}. <${s.url}>${t(data.strings, "label.accessed", { date: s.accessed })}  `), "");
        break;
    }
  }
  out.push(...regionMd(page.back, reg, ctx));
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");
}
