import { m } from "../messages";
import { AXES, type Axis, type CheckResult, type Report, type Status } from "../types";

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

/** 文書ごとの観点別件数（指摘数） */
export function axisSummary(results: CheckResult[]): Record<Axis, { status: Status; findings: number }> {
  return Object.fromEntries(
    AXES.map((a) => {
      const rs = results.filter((r) => r.axis === a);
      return [a, { status: worst(rs.map((r) => r.status)), findings: rs.reduce((n, r) => n + r.findings.length, 0) }];
    }),
  ) as Record<Axis, { status: Status; findings: number }>;
}

export const where = (f: CheckResult["findings"][number]) =>
  [f.loc.file ? f.loc.file.split("/").slice(-2).join("/") : "", f.loc.sentence ?? f.loc.blockId, f.loc.line ? `L${f.loc.line}` : ""].filter(Boolean).join(" ");

export function formatText(report: Report): string {
  const lines: string[] = [];
  const docs = [...new Set(report.results.map((r) => r.doc))];
  for (const doc of docs) {
    const rs = report.results.filter((r) => r.doc === doc);
    const sum = axisSummary(rs);
    const brief = AXES.filter((a) => rs.some((r) => r.axis === a)).map((a) => `${m(`axis.${a}`)} ${ICON[sum[a].status]}${sum[a].findings || ""}`).join("  ");
    lines.push(`${ICON[worst(rs.map((r) => r.status))]} ${doc}    ${brief}`);
    for (const a of AXES) {
      const gs = rs.filter((r) => r.axis === a);
      if (!gs.length) continue;
      const notes = new Set(gs.map((r) => r.note));
      if (gs.every((r) => r.status === "skipped") && notes.size === 1) {
        lines.push(`  ${ICON.skipped} ${m(`axis.${a}`)}  (${m("cli.skipped-count", { n: gs.length, note: gs[0].note })})`);
        continue;
      }
      lines.push(`  ${ICON[worst(gs.map((r) => r.status))]} ${m(`axis.${a}`)}`);
      for (const r of gs) {
        if (r.status === "pass") continue;
        lines.push(`    ${ICON[r.status]} ${r.checkId} [${m(`scope.${r.scope}`)}]${r.note ? `  (${r.note.split("\n")[0]})` : ""}`);
        for (const f of r.findings) lines.push(`        ${where(f) ? `${where(f)}: ` : ""}${f.message}`);
      }
    }
  }
  const c = counts(report.results);
  lines.push("", m("cli.summary", c));
  return lines.join("\n");
}
