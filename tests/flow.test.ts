import { expect, test } from "bun:test";
import { flowLoop, flowReachable, flowRefs, flowScenario, flowState, flowTerminates } from "../src/checks/builtin/flow";
import { buildGraph, simulate } from "../src/flow";
import { docOf, messages, meta } from "./helpers";

const proc = (steps: string, extra = "") =>
  docOf(`kind: procedure\n${meta("  audience: 管理者\n  estimated_time: 5分\n")}purpose: 目的\nsteps:\n${steps}${extra}`);
const st = (id: string, more = "") => `  - { id: ${id}, title: ${id}, actions: [x], expected: y${more ? ", " + more : ""} }\n`;

test("分岐・行き先・終端", () => {
  const d = proc(st("a", "branches: [{ if: 失敗した, goto: c }]") + st("b") + st("c", "end: true") + st("d"));
  const g = buildGraph(d.data.steps);
  expect(g.edges.get("a")).toEqual([{ to: "b" }, { to: "c", cond: "失敗した" }]);
  expect([...g.terminals].sort()).toEqual(["c", "d"]);
  expect(simulate(d.data.steps, g, { a: "失敗した" })).toEqual({ end: "c", path: ["a", "c"] });
});

test("flow/refs: 存在しない行き先・シナリオの手順", async () => {
  const d = proc(st("a", "next: nope") + st("b"), "flows:\n  - { name: F, choose: { zz: q }, expect_end: b }\n");
  expect(await messages(flowRefs, d)).toEqual(['手順1 の行き先 "nope" は存在しない手順です', 'フロー「F」が存在しない手順 "zz" を指定しています']);
});

test("flow/reachable と flow/terminates", async () => {
  const d = proc(st("a", "next: c") + st("b") + st("c", "next: d") + st("d", "next: c"));
  expect(await messages(flowReachable, d)).toEqual(["手順2 には最初の手順からたどり着けません"]);
  expect(await messages(flowTerminates, d)).toEqual(["手順1 から先に進むと終わりにたどり着けません", "手順3 から先に進むと終わりにたどり着けません", "手順4 から先に進むと終わりにたどり着けません"]);
});

test("flow/loop: loop: true の無い繰り返しだけ不合格", async () => {
  const bad = proc(st("a") + st("b", "branches: [{ if: 失敗, goto: a }]") + st("c", "end: true"));
  expect((await messages(flowLoop, bad))[0]).toStartWith("意図しない繰り返しがあります: 手順1 → 手順2");
  const ok = proc(st("a", "loop: true") + st("b", "branches: [{ if: 失敗, goto: a }]") + st("c", "end: true"));
  expect(await messages(flowLoop, ok)).toEqual([]);
});

test("flow/state: 分岐で前提を飛ばす経路を検出", async () => {
  const d = proc(
    st("verify", "produces: [verified]") +
      st("invite", "requires: [verified], produces: [invited], branches: [{ if: あとで招待する, goto: folder }]") +
      st("send", "requires: [verified]") +
      st("folder", "requires: [invited], end: true"),
  );
  // invite の分岐で send を飛ばしても invited は invite で作られるので OK。folder は満たされる
  expect(await messages(flowState, d)).toEqual([]);
  const bad = proc(
    st("verify", "produces: [verified], branches: [{ if: メールが届かない, goto: folder }]") +
      st("invite", "requires: [verified], produces: [invited]") +
      st("folder", "requires: [invited], end: true"),
  );
  expect(await messages(flowState, bad)).toEqual(["手順3 の前提 invited が、たどり着く経路のどこかで満たされていません"]);
});

test("flow/state: initial_state と繰り返し", async () => {
  const d = proc(st("a", "requires: [account], produces: [x], loop: true") + st("b", "requires: [x], branches: [{ if: 再試行, goto: a }]"), "initial_state: [account]\n");
  expect(await messages(flowState, d)).toEqual([]);
});

test("flow/scenario", async () => {
  const d = proc(
    st("a", "branches: [{ if: 届かない, goto: r }]") + st("b", "end: true") + st("r", "next: b"),
    "flows:\n  - { name: 正常, expect_end: b }\n  - { name: 再送, choose: { a: 届かない }, expect_end: b }\n  - { name: 誤り, choose: { a: 届かない }, expect_end: a }\n  - { name: 無い分岐, choose: { a: 別 }, expect_end: b }\n",
  );
  expect(await messages(flowScenario, d)).toEqual([
    "フロー「誤り」の到達先が 手順2 です（期待 手順1）: 手順1 → 手順3 → 手順2",
    "フロー「無い分岐」: 手順1 に分岐「別」がありません",
  ]);
});
