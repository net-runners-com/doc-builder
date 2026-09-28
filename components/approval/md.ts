import type { MdCtx } from "../../src/page/components";

export default function md(p: { roles: string[] }, c: MdCtx): string[] {
  const roles = p.roles;
  const by = new Map<string, any>((c.meta.approvals ?? []).map((a: any) => [a.role, a]));
  const row = (k: string) => `| ${roles.map((r) => by.get(r)?.[k] ?? "").join(" | ")} |`;
  return [`| ${roles.join(" | ")} |`, `|${roles.map(() => "---").join("|")}|`, row("name"), row("date"), ""];
}
