import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAll } from "../src/build";
import { judge, probe } from "../src/facts/probe";
import { runAll } from "../src/runner/run";
import { MIN, scaffold } from "./helpers";

test("judge: 各 expect", () => {
  const r = { stdout: "AburadaBackup\nAburadaBackupWork\n", exit: 0, ms: 50 };
  expect(judge({ exit: 0, stdout_contains: "Work", stdout_match: "^Aburada" }, r, undefined)).toEqual([]);
  expect(judge({ exit: 1 }, r, undefined)).toEqual(["終了コード 0（期待 1）"]);
  expect(judge({ equals: "1" }, { ...r, stdout: " 1 \n" }, undefined)).toEqual([]);
  expect(judge({ lines_equal_value: true }, r, ["AburadaBackup", "AburadaBackupWork"])).toEqual([]);
  expect(judge({ lines_equal_value: true }, r, ["AburadaBackup", "Other"])).toEqual(["実機に無い: Other / 資料に無い: AburadaBackupWork"]);
  expect(judge({ max_ms: 10 }, r, undefined)).toEqual(["実行時間 50ms（上限 10ms）"]);
});

test("probe: シェル不在は unknown", async () => {
  const r = await probe({ id: "x", origin: "t", verify: { shell: "bash", run: "exit 0", expect: { exit: 0 } } }, { root: "/tmp", timeoutMs: 5000 });
  expect(r.status).toBe(Bun.which("bash") ? "pass" : "unknown");
});

const root = mkdtempSync(join(tmpdir(), "dtr-facts-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, "content"));
mkdirSync(join(root, "reviews"));
scaffold(root);
const writeFacts = (tasks: string) =>
  writeFileSync(
    join(root, "facts.yaml"),
    `facts:
  - id: orca-threshold
    value: 5
  - id: backup-tasks
    value: [AburadaBackup, AburadaBackupWork]
    verify:
      shell: sh
      run: printf '${tasks}'
      expect: { lines_equal_value: true }
  - id: ssh-key-only
    claim: SSH は鍵ファイルでのみ接続できます
    verify:
      shell: sh
      run: echo "PasswordAuthentication yes"
      expect: { stdout_match: '^PasswordAuthentication\\s+no' }
  - id: index-log
    capture:
      shell: sh
      run: printf 'indexed 6 docs at 2026-09-28T10:00:00Z\\n'
      normalize: ['\\d{4}-\\d{2}-\\d{2}T[\\d:]+Z']
  - id: unused-one
    value: x
`,
  );
writeFacts("AburadaBackup\\nAburadaBackupWork\\n");
writeFileSync(
  join(root, "content", "manual.yaml"),
  MIN.guide.replace(
    "body: 本文",
    `body:\n      - "目安は{{fact:orca-threshold}}件。{{fact:ssh-key-only}}。タスク: {{fact:backup-tasks}}"\n      - "{{capture:index-log}}"\n      - "{{fact:nope}}"`,
  ),
);

const get = (r: Awaited<ReturnType<typeof runAll>>, doc: string, id: string) => r.results.find((x) => x.doc === doc && x.checkId === id);

test("fact の展開・未定義参照・未使用", async () => {
  const r = await runAll(root);
  expect(get(r, "manual", "ref/resolve")!.findings.map((f) => f.message)).toEqual(['未定義の fact "nope"']);
  expect(get(r, "@facts", "probe/ssh-key-only")!.status).toBe("skipped");
  expect(get(r, "@facts", "unused/facts")!.findings.map((f) => f.message)).toEqual(['fact "unused-one" はどの文書からも参照されていません']);
});

test("--probe: 実機と不一致の fact と、それを参照する文書が不合格", async () => {
  writeFileSync(join(root, "content", "manual.yaml"), readFileSync(join(root, "content", "manual.yaml"), "utf8").replace('\n      - "{{fact:nope}}"', ""));
  const r = await runAll(root, { probe: true });
  expect(get(r, "@facts", "probe/backup-tasks")!.status).toBe("pass");
  expect(get(r, "@facts", "probe/ssh-key-only")!.findings[0].message).toBe(
    "SSH は鍵ファイルでのみ接続できます: 出力が /^PasswordAuthentication\\s+no/ に一致しない",
  );
  expect(get(r, "@facts", "probe/index-log")!.status).toBe("unknown");
  expect(get(r, "manual", "fact/refs")!.findings.map((f) => f.message.split("（")[0])).toEqual(['fact "ssh-key-only" が実機と一致しません']);
  // --probe なしでは前回結果を使わない
  const again = await runAll(root);
  expect(get(again, "@facts", "probe/ssh-key-only")!.status).toBe("skipped");
  expect(get(again, "manual", "fact/refs")!.status).toBe("skipped");
});

test("capture: スナップショットの取得・一致・不一致", async () => {
  let r = await runAll(root, { probe: true, updateSnapshots: true });
  expect(get(r, "@facts", "probe/index-log")!.status).toBe("pass");
  expect(readFileSync(join(root, "facts/snapshots/index-log.txt"), "utf8")).toBe("indexed 6 docs at …\n");
  r = await runAll(root, { probe: true });
  expect(get(r, "@facts", "probe/index-log")!.status).toBe("pass");
  writeFileSync(join(root, "facts/snapshots/index-log.txt"), "indexed 0 docs at …\n");
  r = await runAll(root, { probe: true });
  expect(get(r, "@facts", "probe/index-log")!.findings[0].message).toContain("--- 資料\nindexed 0 docs");
});

test("タスク一覧が実機とずれたら不合格", async () => {
  writeFacts("AburadaBackup\\n");
  const r = await runAll(root, { probe: true });
  expect(get(r, "@facts", "probe/backup-tasks")!.findings[0].message).toContain("実機に無い: AburadaBackupWork");
  writeFacts("AburadaBackup\\nAburadaBackupWork\\n");
});

test("ビルド: fact は値・主張に展開、capture はコードブロック", async () => {
  writeFileSync(join(root, "facts/snapshots/index-log.txt"), "indexed 6 docs at …\n");
  const res = await buildAll(root, { formats: ["md"] });
  expect(res.errors).toEqual([]);
  const md = readFileSync(res.outputs[0], "utf8");
  expect(md).toContain("目安は5件。SSH は鍵ファイルでのみ接続できます。タスク: AburadaBackup、AburadaBackupWork");
  expect(md).toContain("```text\nindexed 6 docs at …\n```");
});
