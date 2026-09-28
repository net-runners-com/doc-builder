import { m } from "../messages";
import { mkdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { snapshotFile } from "./load";
import type { Expect, Fact, Shell } from "./types";

export interface ProbeResult {
  status: "pass" | "fail" | "unknown";
  messages: string[];
  stdout: string;
  ms: number;
  host: string;
  at: string;
}

const defaultShell = (): Shell => (process.platform === "win32" ? "powershell" : "sh");

function argv(shell: Shell, run: string): string[] | undefined {
  const exe = Bun.which(shell === "powershell" && process.platform !== "win32" ? "pwsh" : shell);
  if (!exe) return undefined;
  return shell === "powershell" || shell === "pwsh" ? [exe, "-NoProfile", "-NonInteractive", "-Command", run] : [exe, "-c", run];
}

const toMs = (t: number | string | undefined, dflt: number) =>
  t === undefined ? dflt : typeof t === "number" ? t * 1000 : t.endsWith("ms") ? Number(t.slice(0, -2)) : Number(t.slice(0, -1)) * 1000;

export async function execute(shell: Shell | undefined, run: string, timeoutMs: number) {
  const sh = shell ?? defaultShell();
  const args = argv(sh, run);
  if (!args) return { error: m("probe.no-shell", { shell: sh }) };
  const start = performance.now();
  const p = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    p.kill();
  }, timeoutMs);
  const [stdout, stderr, exit] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  clearTimeout(timer);
  const ms = Math.round(performance.now() - start);
  if (timedOut) return { error: m("probe.timeout", { ms: timeoutMs }) };
  return { stdout: stdout.replace(/\r\n/g, "\n"), stderr, exit, ms };
}

export function judge(e: Expect, r: { stdout: string; exit: number; ms: number }, value: Fact["value"]): string[] {
  const out = r.stdout.trim();
  const bad: string[] = [];
  const show = (s: string) => JSON.stringify(s.length > 80 ? s.slice(0, 80) + "…" : s);
  if (e.exit !== undefined && r.exit !== e.exit) bad.push(m("probe.exit", { got: r.exit, want: e.exit }));
  if (e.equals !== undefined && out !== e.equals) bad.push(m("probe.equals", { got: show(out), want: show(e.equals) }));
  if (e.stdout_contains !== undefined && !r.stdout.includes(e.stdout_contains)) bad.push(m("probe.contains", { want: show(e.stdout_contains) }));
  if (e.stdout_match !== undefined && !new RegExp(e.stdout_match, "m").test(r.stdout)) bad.push(m("probe.match", { re: e.stdout_match }));
  if (e.lines_equal_value) {
    const want = new Set((Array.isArray(value) ? value : value === undefined ? [] : [String(value)]).map(String));
    const got = new Set(out.split("\n").map((s) => s.trim()).filter(Boolean));
    const missing = [...want].filter((x) => !got.has(x));
    const extra = [...got].filter((x) => !want.has(x));
    if (missing.length || extra.length)
      bad.push([missing.length ? m("probe.lines-missing", { items: missing.join(", ") }) : "", extra.length ? m("probe.lines-extra", { items: extra.join(", ") }) : ""].filter(Boolean).join(" / "));
  }
  if (e.max_ms !== undefined && r.ms > e.max_ms) bad.push(m("probe.max-ms", { ms: r.ms, max: e.max_ms }));
  return bad;
}

export const normalizeOutput = (s: string, patterns: string[] = []) =>
  patterns.reduce((acc, p) => acc.replace(new RegExp(p, "g"), "…"), s).replace(/\s+$/, "") + "\n";

export async function probe(f: Fact, opts: { root: string; timeoutMs: number; updateSnapshots?: boolean; snapshot?: string }): Promise<ProbeResult> {
  const base = { host: hostname(), at: new Date().toISOString() };
  const messages: string[] = [];
  let status: ProbeResult["status"] = "pass";
  let stdout = "";
  let ms = 0;
  const bump = (s: ProbeResult["status"]) => {
    if (s === "fail" || (s === "unknown" && status === "pass")) status = s;
  };

  if (f.verify) {
    const r = await execute(f.verify.shell, f.verify.run, toMs(f.verify.timeout, opts.timeoutMs));
    if ("error" in r) {
      bump("unknown");
      messages.push(r.error!);
    } else {
      stdout = r.stdout;
      ms = r.ms;
      const bad = judge(f.verify.expect, r, f.value);
      if (bad.length) {
        bump("fail");
        messages.push(...bad);
      }
    }
  }
  if (f.capture) {
    const r = await execute(f.capture.shell, f.capture.run, opts.timeoutMs);
    if ("error" in r) {
      bump("unknown");
      messages.push(m("probe.capture-error", { error: r.error }));
    } else {
      const got = normalizeOutput(r.stdout, f.capture.normalize);
      if (opts.updateSnapshots) {
        const p = snapshotFile(opts.root, f.id);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, got);
        messages.push(m("probe.snapshot-updated"));
      } else if (opts.snapshot === undefined) {
        bump("unknown");
        messages.push(m("probe.snapshot-missing"));
      } else if (opts.snapshot !== got) {
        bump("fail");
        messages.push(m("probe.snapshot-diff", { want: opts.snapshot, got }));
      }
    }
  }
  if (!f.verify && !f.capture) messages.push(m("probe.no-verify"));
  return { status, messages, stdout, ms, ...base };
}
