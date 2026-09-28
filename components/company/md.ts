import type { MdCtx } from "../../src/page/components";

export default function md(p: { show: string[] }, c: MdCtx): string[] {
  const co = c.company as Record<string, string> | undefined;
  if (!co) return [];
  const keys = p.show.filter((k) => co[k]);
  return [...keys.map((k) => (k === "name" ? `**${co.name}**  ` : k === "tel" ? `${c.t("label.tel", { tel: co.tel })}  ` : `${co[k]}  `)), ""];
}
