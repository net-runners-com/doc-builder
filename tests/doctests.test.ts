import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAll } from "../src/runner/run";
import { MIN, meta, scaffold } from "./helpers";

const root = mkdtempSync(join(tmpdir(), "dtr-doctests-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, "content"));
mkdirSync(join(root, "reviews"));
mkdirSync(join(root, "doctests"));
scaffold(root);
writeFileSync(
  join(root, "content", "proc.yaml"),
  `kind: procedure\n${meta("  audience: 管理者\n  estimated_time: 5分\n")}purpose: 目的。\nsteps:
  - { id: a, title: 開く, actions: [開く。], expected: 開く。, produces: [x], branches: [{ if: 済み, goto: c }] }
  - { id: b, title: 選ぶ, actions: [選ぶ。], expected: 選ぶ。, produces: [y] }
  - { id: c, title: 送る, actions: [送る。], expected: 送る。, requires: [y], end: true }
`,
);
writeFileSync(join(root, "content", "g.yaml"), MIN.guide);

const get = (r: Awaited<ReturnType<typeof runAll>>, doc: string, id: string) => r.results.find((x) => x.doc === doc && x.checkId === id)!;

test("doctests/<文書名>.yaml の flows と blocks が実行され、指摘はテストファイルの行を指す", async () => {
  writeFileSync(join(root, "doctests", "proc.yaml"), "flows:\n  - { name: 済み, choose: { a: 済み }, expect_end: c }\nblocks:\n  a:\n    - contains: [必ず]\n");
  const r = await runAll(root);
  const sc = get(r, "proc", "flow/scenario");
  expect(sc.status).toBe("fail");
  expect(sc.findings[0].loc).toMatchObject({ file: join(root, "doctests", "proc.yaml"), line: 2 });
  const ex = get(r, "proc", "expect/expression");
  expect(ex.findings.map((f) => f.message)).toEqual(["a: 「必ず」がありません"]);
  expect(ex.findings[0].loc.line).toBe(5);
  // テストで分岐を通したので coverage は満たされる
  expect(get(r, "proc", "flow/coverage").status).toBe("pass");
});

test("tests/valid: 存在しないブロック・スキーマ違反。tests/orphan: 文書の無いテスト", async () => {
  writeFileSync(join(root, "doctests", "g.yaml"), "blocks:\n  nope:\n    - contains: [x]\n");
  writeFileSync(join(root, "doctests", "ghost.yaml"), "expect: []\n");
  let r = await runAll(root);
  expect(get(r, "g", "tests/valid").findings.map((f) => f.message)).toEqual(['テストが指定したブロック "nope" は文書にありません']);
  expect(get(r, "@themes", "tests/orphan").findings.map((f) => f.message)).toEqual(['テストファイル doctests/ghost.yaml に対応する文書 "ghost" がありません']);
  writeFileSync(join(root, "doctests", "g.yaml"), "blockz: {}\n");
  r = await runAll(root);
  expect(get(r, "g", "tests/valid").findings[0].message).toContain('未知の項目 "blockz"');
  // テストファイルが壊れていても、文書のチェックは止めない
  expect(get(r, "g", "schema/valid").status).toBe("pass");
});
