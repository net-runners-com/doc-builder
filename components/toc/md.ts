import type { MdCtx } from "../../src/page/components";

export default function md(p: { depth: number; title?: string }, c: MdCtx): string[] {
  const hs = c.headings.filter((h) => h.level - 1 <= p.depth);
  return hs.length ? [`## ${p.title ?? c.t("section.toc")}`, "", ...hs.map((h) => `${"  ".repeat(h.level - 2)}- ${h.text}`), ""] : [];
}
