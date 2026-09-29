import { expect, test } from "bun:test";
import { flowLoop, flowReachable, flowRefs, flowScenario, flowState, flowTerminates } from "../src/checks/builtin/flow";
import { buildGraph, simulate } from "../src/flow";
import { docOf, messages, meta } from "./helpers";

const proc = (steps: string, extra = "") =>
  docOf(`kind: procedure\n${meta("  audience: 管理者\n  estimated_time: 5分\n")}purpose: 目的\nsteps:\n${steps}${extra}`);
const st = (id: string, more = "") => `  - { id: ${id}, title: ${id}, actions: [x], expected: y${more ? ", " + more : ""} }\n`;

// 現実的なフロー: 登録 → 確認（届かなければ再送して戻る）→ プラン → 招待
const signup = () =>
  st("signup", "produces: [account]") +
  st("verify", "loop: true, requires: [account], produces: [verified], branches: [{ if: 届かない, goto: resend }]") +
  st("plan", "requires: [account], produces: [plan]") +
  st("invite", "requires: [verified, plan], end: true") +
  st("resend", "requires: [account], next: verify");

test("グラフ: 既定の次・分岐・終端", () => {
  const d = proc(signup());
  const g = buildGraph(d.data.steps);
  expect(g.edges.get("verify")).toEqual([{ to: "plan" }, { to: "resend", cond: "届かない" }]);
  expect(g.edges.get("resend")).toEqual([{ to: "verify" }]);
  expect([...g.terminals]).toEqual(["invite"]);
});

test("simulate: 訪問ごとに分岐を選ぶ（再送して戻る）", () => {
  const d = proc(signup());
  const g = buildGraph(d.data.steps);
  const r = simulate(d.data.steps, g, { verify: ["届かない", null] });
  expect(r.path).toEqual(["signup", "verify", "resend", "verify", "plan", "invite"]);
  expect(r.end).toBe("invite");
  expect(r.unmet).toEqual([]);
  // 文字列で書くと最初の訪問だけ。以降は既定の次へ進むので無限ループにならない
  expect(simulate(d.data.steps, g, { verify: "届かない" }).end).toBe("invite");
});

test("正しいフローはすべて合格", async () => {
  const d = proc(signup(), "flows:\n  - { name: 通常, expect_end: invite }\n  - { name: 再送, choose: { verify: [届かない, null] }, expect_end: invite }\n");
  for (const c of [flowRefs, flowReachable, flowTerminates, flowLoop, flowState, flowScenario]) expect(await messages(c, d)).toEqual([]);
});

test("flow/refs: 存在しない行き先・シナリオの手順", async () => {
  const d = proc(st("a", "next: nope") + st("b"), "flows:\n  - { name: F, choose: { zz: q }, expect_end: b }\n");
  expect(await messages(flowRefs, d)).toEqual(['手順1 の行き先 "nope" は存在しない手順です', 'フロー「F」が存在しない手順 "zz" を指定しています']);
});

test("flow/reachable: どこからも来ない手順", async () => {
  const d = proc(st("a", "next: c") + st("b") + st("c", "end: true"));
  expect(await messages(flowReachable, d)).toEqual(["手順2 には最初の手順からたどり着けません"]);
});

test("flow/terminates: 抜け出せない繰り返し", async () => {
  const d = proc(st("a") + st("b", "loop: true, next: c") + st("c", "next: b") + st("d", "end: true"));
  expect(await messages(flowTerminates, d)).toEqual(["手順1 から先に進むと終わりにたどり着けません", "手順2 から先に進むと終わりにたどり着けません", "手順3 から先に進むと終わりにたどり着けません"]);
});

test("flow/loop: loop: true の無い繰り返しだけ不合格", async () => {
  const bad = proc(signup().replace("loop: true, ", ""));
  expect(await messages(flowLoop, bad)).toEqual(["意図しない繰り返しがあります: 手順2 → 手順5（繰り返す手順には loop: true を付けてください）"]);
  expect(await messages(flowLoop, proc(signup()))).toEqual([]);
});

test("flow/state: 分岐で必要な手順を飛ばす経路を検出", async () => {
  const skip = proc(signup().replace("branches: [{ if: 届かない, goto: resend }]", "branches: [{ if: 届かない, goto: resend }, { if: 確認済み, goto: invite }]"));
  expect(await messages(flowState, skip)).toEqual(["手順4 の前提 plan が、たどり着く経路のどこかで満たされていません"]);
});

test("flow/state: initial_state を開始時点の状態として使う", async () => {
  const d = proc(st("a", "requires: [account], produces: [x]") + st("b", "requires: [x], end: true"), "initial_state: [account]\n");
  expect(await messages(flowState, d)).toEqual([]);
  const none = proc(st("a", "requires: [account], produces: [x]") + st("b", "requires: [x], end: true"));
  expect(await messages(flowState, none)).toEqual(["手順1 の前提 account が、たどり着く経路のどこかで満たされていません"]);
});

test("flow/scenario: 到達先・分岐名・経路上の前提", async () => {
  const skip = signup().replace("branches: [{ if: 届かない, goto: resend }]", "branches: [{ if: 届かない, goto: resend }, { if: 確認済み, goto: invite }]");
  const d = proc(
    skip,
    "flows:\n  - { name: 確認済み, choose: { verify: 確認済み }, expect_end: invite }\n  - { name: 誤り, expect_end: plan }\n  - { name: 無い分岐, choose: { verify: 別 }, expect_end: invite }\n",
  );
  expect(await messages(flowScenario, d)).toEqual([
    "フロー「確認済み」: 手順4 の前提 plan を満たさないまま進みます: 手順1 → 手順2 → 手順4",
    "フロー「誤り」の到達先が 手順4 です（期待 手順3）: 手順1 → 手順2 → 手順3 → 手順4",
    "フロー「無い分岐」: 手順2 に分岐「別」がありません",
  ]);
});

test("flow/orphan-requires: 誰も作らない前提", async () => {
  const { flowOrphanRequires } = await import("../src/checks/builtin/flow");
  const d = proc(st("a", "produces: [x]") + st("b", "requires: [x, typo], end: true"));
  expect(await messages(flowOrphanRequires, d)).toEqual(["手順2 の前提 typo を作る手順がありません（produces にも initial_state にも無い）"]);
});

test("flow/declarations: 飛ばす手順の状態が未宣言なら検証できない", async () => {
  const { flowDeclarations } = await import("../src/checks/builtin/flow");
  const d = proc(st("a", "branches: [{ if: 済み, goto: d }]") + st("b") + st("c", "produces: [z]") + st("d", "end: true"));
  expect(await messages(flowDeclarations, d)).toEqual(["手順1 の分岐「済み」で 手順2 を飛ばしますが、手順2 に produces が無いため飛ばしてよいか検証できません"]);
});

test("flow/coverage: シナリオで通らない分岐・終端", async () => {
  const { flowCoverage } = await import("../src/checks/builtin/flow");
  expect(await messages(flowCoverage, proc(signup()))).toEqual(["分岐が 1 個ありますが、シナリオ（flows）がありません"]);
  const partial = proc(signup(), "flows:\n  - { name: 通常, expect_end: invite }\n");
  expect(await messages(flowCoverage, partial)).toEqual(["手順2 の分岐「届かない」はどのシナリオでも通りません"]);
  const full = proc(signup(), "flows:\n  - { name: 再送, choose: { verify: [届かない, null] }, expect_end: invite }\n");
  expect(await messages(flowCoverage, full)).toEqual([]);
});

test("flow/declarations: 補助手順への分岐は飛ばしとみなさない", async () => {
  const { flowDeclarations } = await import("../src/checks/builtin/flow");
  // verify → resend（末尾の補助手順）は、並び順では plan・invite を越えるが飛ばしではない
  expect(await messages(flowDeclarations, proc(signup()))).toEqual([]);
});

test("flow/troubleshooting: 分岐・対処文と行き先を突き合わせる", async () => {
  const { flowTroubleshooting } = await import("../src/checks/builtin/flow");
  const ts = (entries: string) => proc(signup(), `troubleshooting:\n${entries}`);
  const ok = ts("  - { symptom: 届かない, step: verify, branch: 届かない, goto: resend, action: \"{{ref:resend}}で再送する。\" }\n");
  expect(await messages(flowTroubleshooting, ok)).toEqual([]);
  const bad = ts(
    "  - { symptom: 届かない, step: verify, branch: 届かない, goto: signup, action: \"{{ref:signup}}からやり直す。\" }\n" +
      "  - { symptom: 別件, step: verify, branch: 無い分岐, action: 確認する。 }\n" +
      "  - { symptom: 文と違う, goto: resend, action: \"{{ref:signup}}からやり直す。\" }\n" +
      "  - { symptom: 行き先なし, action: \"{{ref:plan}}へ戻る。\" }\n",
  );
  expect(await messages(flowTroubleshooting, bad)).toEqual([
    "トラブルシューティング「届かない」は 手順1 へ案内していますが、分岐「届かない」の行き先は 手順5 です",
    "トラブルシューティング「別件」: 手順2 に分岐「無い分岐」がありません",
    "トラブルシューティング「文と違う」の対処文は 手順1 を案内していますが、goto は 手順5 です",
    "トラブルシューティング「行き先なし」の対処文は 手順3 を案内していますが、goto がありません",
  ]);
});
