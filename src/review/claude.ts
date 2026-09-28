import { m } from "../messages";
import { join } from "node:path";
import { requireTool } from "../errors";

export type ClaudeRunner = (args: { prompt: string; schema: object; model: string; addDirs: string[]; timeoutMs: number }) => Promise<string>;

export const REVIEW_SCHEMA = {
  type: "object",
  required: ["verdict", "findings"],
  additionalProperties: false,
  properties: {
    verdict: { enum: ["pass", "fail"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["reason"],
        additionalProperties: false,
        properties: { blockId: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
};

export interface ReviewOutput {
  verdict: "pass" | "fail";
  findings: { blockId?: string; reason: string }[];
}

/** 同梱の読み取り専用設定で `claude -p` を呼ぶ */
export const defaultClaude: ClaudeRunner = async ({ prompt, schema, model, addDirs, timeoutMs }) => {
  const claude = requireTool("claude", "https://docs.claude.com/claude-code");
  const args = [
    claude, "-p",
    "--settings", join(import.meta.dir, "settings.json"),
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
    "--model", model,
    "--no-session-persistence",
    "--disallowedTools", "Edit", "Write", "MultiEdit", "NotebookEdit", "Bash",
    ...addDirs.flatMap((d) => ["--add-dir", d]),
  ];
  const p = Bun.spawn(args, { stdin: new Blob([prompt]), stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => p.kill(), timeoutMs);
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  clearTimeout(timer);
  if (code !== 0) throw new Error(m("review.exit", { code, output: (err || out).slice(0, 300) }));
  return out;
};

const firstJson = (s: string) => {
  const hit = s.match(/\{[\s\S]*\}/);
  if (!hit) throw new Error(m("review.no-json"));
  return JSON.parse(hit[0]);
};

export function parseReviewOutput(stdout: string): ReviewOutput {
  const outer = JSON.parse(stdout);
  const v = outer.structured_output ?? (typeof outer.result === "string" ? firstJson(outer.result) : outer.result ?? outer);
  if (!v || (v.verdict !== "pass" && v.verdict !== "fail") || !Array.isArray(v.findings)) throw new Error(m("review.bad-output", { output: JSON.stringify(v).slice(0, 200) }));
  return { verdict: v.verdict, findings: v.findings.filter((f: any) => typeof f?.reason === "string") };
}
