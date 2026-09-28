import { GROUPS, type CheckResult, type Report, type Status } from "../types";

export const ICON: Record<Status, string> = { pass: "✓", fail: "✗", warn: "!", unknown: "?", skipped: "–" };
const ORDER: Status[] = ["fail", "unknown", "warn", "pass", "skipped"];

/** 子の状態から親の状態を決める（fail > unknown > warn > pass > skipped） */
export function worst(statuses: Status[]): Status {
  if (!statuses.length) return "skipped";
  return ORDER.find((s) => statuses.includes(s)) ?? "pass";
}

export function exitCode(report: Report, strict = false): number {
  const bad = report.results.some((r) => r.status === "fail" || (strict && (r.status === "warn" || r.status === "unknown")));
  return bad ? 1 : 0;
}

export function counts(results: CheckResult[]) {
  const c: Record<Status, number> = { pass: 0, fail: 0, warn: 0, unknown: 0, skipped: 0 };
  for (const r of results) c[r.status]++;
  return c;
}

export function formatText(report: Report): string {
  const lines: string[] = [];
  const docs = [...new Set(report.results.map((r) => r.doc))];
  for (const doc of docs) {
    const rs = report.results.filter((r) => r.doc === doc);
    lines.push(`${ICON[worst(rs.map((r) => r.status))]} ${doc}`);
    for (const g of GROUPS) {
      const gs = rs.filter((r) => r.group === g);
      if (!gs.length) continue;
      const notes = new Set(gs.map((r) => r.note));
      if (gs.every((r) => r.status === "skipped") && notes.size === 1) {
        lines.push(`  ${ICON.skipped} ${g}  (${gs.length} 件: ${gs[0].note})`);
        continue;
      }
      lines.push(`  ${ICON[worst(gs.map((r) => r.status))]} ${g}`);
      for (const r of gs) {
        if (r.status === "pass") continue;
        lines.push(`    ${ICON[r.status]} ${r.checkId}${r.note ? `  (${r.note.split("\n")[0]})` : ""}`);
        for (const f of r.findings) {
          const where = [f.loc.blockId, f.loc.line ? `L${f.loc.line}` : ""].filter(Boolean).join(" ");
          lines.push(`        ${where ? `${where}: ` : ""}${f.message}`);
        }
      }
    }
  }
  const c = counts(report.results);
  lines.push("", `pass ${c.pass} / fail ${c.fail} / warn ${c.warn} / unknown ${c.unknown} / skipped ${c.skipped}`);
  return lines.join("\n");
}
