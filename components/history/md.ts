import type { MdCtx } from "../../src/page/components";

export default function md(_p: unknown, c: MdCtx): string[] {
  const head = ["column.version", "column.date", "column.note"].map((k) => c.t(k));
  const rows = (c.meta.history ?? []).map((h: any) => `| ${h.version} | ${h.date} | ${h.note} |`);
  return [`**${c.t("section.history")}**`, "", `| ${head.join(" | ")} |`, "|---|---|---|", ...rows, ""];
}
