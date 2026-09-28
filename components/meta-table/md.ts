import type { MdCtx } from "../../src/page/components";

export default function md(p: { fields: string[] }, c: MdCtx): string[] {
  return [...p.fields.map((f) => `- ${c.t(`field.${f}`)}: ${c.meta[f] ?? ""}`), ""];
}
