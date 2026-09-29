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

test("tests/coverage: expect・blocks・シナリオが通った手順をテスト済みとみなす", async () => {
  writeFileSync(join(root, "doctests", "g.yaml"), "blocks:\n  intro:\n    - contains: [本文]\n");
  let r = await runAll(root);
  expect(get(r, "g", "tests/coverage").note).toBe("テスト 1/1 ブロック（100%）");
  // 手順書: シナリオが a → c を通るので b だけが未テスト
  expect(get(r, "proc", "tests/coverage").note).toBe("テスト 2/3 ブロック（67%）");
  writeFileSync(join(root, "runner.yaml"), "minCoverage: 80\n");
  r = await runAll(root);
  const c = get(r, "proc", "tests/coverage");
  expect(c.status).toBe("warn");
  expect(c.findings[0].message).toBe("テストのあるブロックが 67% です（最低 80%）。テストの無いブロック: b");
  rmSync(join(root, "runner.yaml"));
});

test("ask: は LLM レビューの観点になる（--review のときだけ、警告）", async () => {
  writeFileSync(join(root, "doctests", "g.yaml"), "blocks:\n  intro:\n    - ask: 読み手に伝わるか\n");
  let prompt = "";
  const r = await runAll(root, {
    review: true,
    claude: async (a) => {
      prompt = a.prompt;
      return JSON.stringify({ structured_output: { verdict: "fail", findings: [{ blockId: "intro", reason: "伝わらない" }] } });
    },
  });
  const ask = get(r, "g", "review/ask/intro/1");
  expect(ask.status).toBe("warn");
  expect(ask.scope).toBe("item");
  expect(prompt).toContain("ブロック「1. 概要」について: 読み手に伝わるか");
  expect(get(await runAll(root), "g", "review/ask/intro/1").status).toBe("skipped");
});
