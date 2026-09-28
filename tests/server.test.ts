import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFocus } from "../src/server/html";
import { startServer } from "../src/server";
import { registerSuperset } from "../src/server/urls";
import { MIN, scaffold } from "./helpers";

const root = mkdtempSync(join(tmpdir(), "dtr-srv-"));
mkdirSync(join(root, "content"));
mkdirSync(join(root, "reviews"));
scaffold(root);
writeFileSync(join(root, "content", "g.yaml"), MIN.guide.replace("本文", "TBD"));
const superset = join(root, "hosted-urls.json");
writeFileSync(superset, JSON.stringify([{ title: "会社共有", url: "https://x" }, { title: "g テスト", url: "old" }]));
const s = await startServer(root, { port: 0, register: true, supersetFile: superset });
afterAll(() => {
  s.stop();
  rmSync(root, { recursive: true, force: true });
});

test("parseFocus", () => {
  expect(parseFocus("/t/g/surface/text/placeholder/1")).toEqual({ doc: "g", axis: "surface", checkId: "text/placeholder", n: 1 });
  expect(parseFocus("/t/g")).toEqual({ doc: "g", axis: undefined, checkId: undefined, n: undefined });
});

test("ツリーと固有 URL", async () => {
  const top = await (await fetch(s.base + "/")).text();
  expect(top).toContain('href="/t/g/surface/text/placeholder"');
  const one = await (await fetch(s.base + "/t/g/surface/text/placeholder/1")).text();
  expect(one).toContain("未記入のプレースホルダ「TBD」");
  expect(one).toContain('<span class="hl">');
});

test("urls.json と superset 登録（既存項目を保持し同名だけ置換）", () => {
  const urls = JSON.parse(readFileSync(s.urlsFile, "utf8"));
  expect(urls.map((u: any) => u.title)).toEqual(["doc-test-runner", "g テスト", "g プレビュー"]);
  const reg = JSON.parse(readFileSync(superset, "utf8"));
  expect(reg[0]).toEqual({ title: "会社共有", url: "https://x" });
  expect(reg.filter((u: any) => u.title === "g テスト")).toHaveLength(1);
  expect(reg.find((u: any) => u.title === "g テスト").url).toContain("/t/g");
  registerSuperset([{ title: "g テスト", url: "new" }], superset);
  expect(JSON.parse(readFileSync(superset, "utf8"))).toHaveLength(4);
});

test.skipIf(!Bun.which("typst"))("PDF プレビュー", async () => {
  const r = await fetch(s.base + "/pdf/g");
  expect(r.headers.get("content-type")).toBe("application/pdf");
});
