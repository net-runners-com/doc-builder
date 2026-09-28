import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { figureCaption, imageAlt, linkLocal, sourceStale, unusedDefs } from "../src/checks/builtin/defs";
import { MIN, docOf, messages } from "./helpers";

const dir = mkdtempSync(join(tmpdir(), "dtr-defs-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
writeFileSync(join(dir, "exists.md"), "x");
writeFileSync(join(dir, "a.png"), "x");

const guide = (body: string, extra = "") =>
  docOf(MIN.guide.replace("body: 本文", `body: ${JSON.stringify(body)}`) + extra, join(dir, "doc.yaml"));

test("link/local: 相対リンクと画像パス", async () => {
  const d = guide("[ok](./exists.md#x) [ng](./missing.md) [web](https://e.x) [a](#top) {{img:a}} {{img:b}}",
    "images:\n  - { id: a, path: a.png, alt: A }\n  - { id: b, path: nope.png, alt: B }\n");
  expect(await messages(linkLocal, d)).toEqual(["リンク先が存在しません: ./missing.md", "画像ファイルが存在しません: nope.png"]);
});

test("image/alt と figure/caption", async () => {
  const d = guide("{{img:a}} {{fig:f}}",
    'images:\n  - { id: a, path: a.png, alt: " " }\nfigures:\n  - { id: f, type: diagram, source: "a -> b" }\n');
  expect(await messages(imageAlt, d)).toEqual(["alt が空です"]);
  expect(await messages(figureCaption, d)).toEqual(["キャプションがありません"]);
});

test("unused/defs", async () => {
  const d = guide("{{cite:x}}",
    'sources:\n  - { id: x, url: "https://e.x", title: X, accessed: 2026-09-01 }\n  - { id: y, url: "https://e.y", title: Y, accessed: 2026-09-01 }\nimages:\n  - { id: a, path: a.png, alt: A }\n');
  expect(await messages(unusedDefs, d)).toEqual(['image "a" は本文で使われていません', 'source "y" は本文で使われていません']);
});

test("source/stale: 365 日超で警告", async () => {
  const d = guide("{{cite:x}} {{cite:y}}",
    'sources:\n  - { id: x, url: "https://e.x", title: X, accessed: 2025-09-28 }\n  - { id: y, url: "https://e.y", title: Y, accessed: 2025-09-27 }\n');
  expect(await messages(sourceStale, d)).toEqual(["閲覧日 2025-09-27 から 366 日経過（期限 365 日）"]);
});
