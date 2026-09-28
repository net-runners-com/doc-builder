import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseReviewOutput } from "../src/review/claude";
import { runAll } from "../src/runner/run";
import type { ClaudeRunner } from "../src/review/claude";
import { MIN, scaffold } from "./helpers";

const root = mkdtempSync(join(tmpdir(), "dtr-review-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, "content"));
mkdirSync(join(root, "reviews"));
writeFileSync(join(root, "content", "g.yaml"), MIN.guide);
writeFileSync(join(root, "reviews", "guide.yaml"), "aspects:\n  - { id: a1, ask: 観点1 }\n");
scaffold(root);

const review = (r: Awaited<ReturnType<typeof runAll>>) => r.results.find((x) => x.checkId === "review/a1")!;

test("parseReviewOutput: structured_output と result 内 JSON", () => {
  expect(parseReviewOutput(JSON.stringify({ structured_output: { verdict: "pass", findings: [] } })).verdict).toBe("pass");
  expect(parseReviewOutput(JSON.stringify({ result: '結果: {"verdict":"fail","findings":[{"reason":"x"}]}' })).findings).toHaveLength(1);
  expect(() => parseReviewOutput(JSON.stringify({ result: "no json" }))).toThrow();
});

test("--review なしは skipped", async () => {
  expect(review(await runAll(root)).status).toBe("skipped");
});

test("不正出力は 1 回再試行する。結果は保存せず、--review なしでは未実行", async () => {
  let calls = 0;
  const claude: ClaudeRunner = async ({ prompt }) => {
    calls++;
    expect(prompt).toContain("観点: 観点1");
    if (calls === 1) return "garbage";
    return JSON.stringify({ structured_output: { verdict: "fail", findings: [{ blockId: "intro", reason: "曖昧" }] } });
  };
  const r = review(await runAll(root, { review: true, claude }));
  expect(calls).toBe(2);
  expect(r.status).toBe("fail");
  expect(r.findings[0]).toMatchObject({ message: "曖昧", loc: { blockId: "intro", line: 8 } });
  expect(review(await runAll(root)).status).toBe("skipped");
});

test("2 回とも不正なら unknown", async () => {
  writeFileSync(join(root, "content", "g.yaml"), MIN.guide.replace("本文", "変更後"));
  const r = review(await runAll(root, { review: true, claude: async () => "bad" }));
  expect(r.status).toBe("unknown");
});
