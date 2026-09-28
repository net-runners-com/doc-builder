import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onlineQuote, onlineUrl } from "../src/checks/builtin/online";
import { MIN, ctxFor, docOf } from "./helpers";
import type { Check } from "../src/checks/define";

let server: ReturnType<typeof Bun.serve>;
const workDir = mkdtempSync(join(tmpdir(), "dtr-online-"));
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const p = new URL(req.url).pathname;
      if (p === "/ok") return new Response("<html><script>x</script><p>資料の検索に費やす時間は\n一日平均３０分であった。</p></html>");
      if (p === "/blocked") return new Response("no", { status: 403 });
      return new Response("nf", { status: 404 });
    },
  });
});
afterAll(() => {
  server.stop(true);
  rmSync(workDir, { recursive: true, force: true });
});

const doc = (path: string, quote: string) =>
  docOf(
    MIN.guide.replace("body: 本文", `body: [{ quote: { source: s, text: "${quote}" } }]`) +
      `sources:\n  - { id: s, url: "${server.url}${path.slice(1)}", title: S, accessed: 2026-09-01 }\n`,
  );
const run = async (c: Check, d: ReturnType<typeof doc>, online: boolean) => {
  try {
    const f = await c.run(d, ctxFor(d, { workDir, options: { online } }));
    return f.length ? `fail: ${f[0].message}` : "pass";
  } catch (e) {
    return `${(e as Error).constructor.name}: ${(e as Error).message}`;
  }
};

test("--online なしは Skip（前回結果も使わない）", async () => {
  expect(await run(onlineUrl, doc("/ok", "x"), false)).toStartWith("Skip");
});

test("引用の照合は空白・全半角を正規化する", async () => {
  expect(await run(onlineQuote, doc("/ok", "資料の検索に費やす時間は一日平均30分であった。"), true)).toBe("pass");
  expect(await run(onlineQuote, doc("/ok", "一日平均60分"), true)).toStartWith("fail: 引用文が");
  expect(await run(onlineUrl, doc("/ok", "x"), false)).toStartWith("Skip");
});

test("404 は fail、403 は unknown", async () => {
  expect(await run(onlineUrl, doc("/missing", "x"), true)).toStartWith("fail: 出典 URL が HTTP 404");
  expect(await run(onlineUrl, doc("/blocked", "x"), true)).toStartWith("Unknown");
});
