import type { MdCtx } from "../../src/page/components";

export default function md(p: { value: string; bold?: boolean }, c: MdCtx): string[] {
  const v = p.value.replace(/\{\{\s*meta\.([a-z_]+)\s*\}\}/g, (_m, k) => String(c.meta[k] ?? ""));
  return [p.bold ? `**${v}**` : v, ""];
}
