import { buildGraph, cannotFinish, danglingEdges, reachable, simulate, unmarkedCycles, unmetRequires, type Step } from "../../flow";
import { m } from "../../messages";
import type { Doc } from "../../types";
import { defineCheck } from "../define";

const steps = (doc: Doc): Step[] => doc.data.steps ?? [];
const label = (doc: Doc, id: string) => doc.defs[id]?.label ?? id;
const loc = (doc: Doc, id: string) => ({ blockId: id, line: doc.defs[id]?.line });
const flowLine = (doc: Doc, i: number) => doc.lineOf(`/flows/${i}`);

export const flowRefs = defineCheck({
  id: "flow/refs",
  axis: "structure",
  scope: "item",
  kinds: ["procedure"],
  severity: "error",
  run(doc, ctx) {
    const g = buildGraph(steps(doc));
    const out = danglingEdges(g).map((e) => ctx.fail(m("check.flow.dangling", { from: label(doc, e.from), to: e.to }), loc(doc, e.from)));
    (doc.data.flows ?? []).forEach((f: any, i: number) => {
      for (const s of [...Object.keys(f.choose ?? {}), f.expect_end])
        if (!g.ids.includes(s)) out.push(ctx.fail(m("check.flow.unknown-step", { flow: f.name, id: s }), { line: flowLine(doc, i) }));
    });
    return out;
  },
});

export const flowReachable = defineCheck({
  id: "flow/reachable",
  axis: "logic",
  scope: "item",
  kinds: ["procedure"],
  severity: "error",
  run(doc, ctx) {
    const g = buildGraph(steps(doc));
    const r = reachable(g);
    return g.ids.filter((id) => !r.has(id)).map((id) => ctx.fail(m("check.flow.unreachable", { step: label(doc, id) }), loc(doc, id)));
  },
});

export const flowTerminates = defineCheck({
  id: "flow/terminates",
  axis: "logic",
  scope: "item",
  kinds: ["procedure"],
  severity: "error",
  run: (doc, ctx) => cannotFinish(buildGraph(steps(doc))).map((id) => ctx.fail(m("check.flow.no-end", { step: label(doc, id) }), loc(doc, id))),
});

export const flowLoop = defineCheck({
  id: "flow/loop",
  axis: "logic",
  scope: "item",
  kinds: ["procedure"],
  severity: "error",
  run(doc, ctx) {
    const ok = new Set(steps(doc).filter((s) => s.loop).map((s) => s.id));
    return unmarkedCycles(buildGraph(steps(doc)), ok).map((c) => ctx.fail(m("check.flow.cycle", { steps: c.map((id) => label(doc, id)).join(" → ") }), loc(doc, c[0])));
  },
});

export const flowState = defineCheck({
  id: "flow/state",
  axis: "logic",
  scope: "item",
  kinds: ["procedure"],
  severity: "error",
  run(doc, ctx) {
    const ss = steps(doc);
    return unmetRequires(ss, buildGraph(ss), doc.data.initial_state ?? []).map((u) =>
      ctx.fail(m("check.flow.unmet", { step: label(doc, u.step), states: u.missing.join(", ") }), loc(doc, u.step)),
    );
  },
});

export const flowScenario = defineCheck({
  id: "flow/scenario",
  axis: "logic",
  scope: "document",
  kinds: ["procedure"],
  severity: "error",
  run(doc, ctx) {
    const ss = steps(doc);
    const g = buildGraph(ss);
    const out = [];
    for (const [i, f] of ((doc.data.flows ?? []) as any[]).entries()) {
      const r = simulate(ss, g, f.choose ?? {}, doc.data.initial_state ?? []);
      const path = r.path.map((id) => label(doc, id)).join(" → ");
      const where = { line: flowLine(doc, i) };
      if (r.error === "bad-choice") out.push(ctx.fail(m("check.flow.bad-choice", { flow: f.name, step: label(doc, r.at!), choice: r.choice ?? "" }), where));
      else if (r.error === "loop") out.push(ctx.fail(m("check.flow.scenario-loop", { flow: f.name, path }), where));
      else if (r.end !== f.expect_end) out.push(ctx.fail(m("check.flow.wrong-end", { flow: f.name, want: label(doc, f.expect_end), got: label(doc, r.end!), path }), where));
      // 到達先が合っていても、経路上で前提を満たさずに進んでいれば不合格
      for (const u of r.unmet) out.push(ctx.fail(m("check.flow.scenario-unmet", { flow: f.name, step: label(doc, u.step), states: u.missing.join(", "), path }), where));
    }
    return out;
  },
});

/** requires にあるのに、どの手順も作らない（initial_state にも無い）状態 */
export const flowOrphanRequires = defineCheck({
  id: "flow/orphan-requires",
  axis: "logic",
  scope: "item",
  kinds: ["procedure"],
  severity: "error",
  run(doc, ctx) {
    const ss = steps(doc);
    const made = new Set([...(doc.data.initial_state ?? []), ...ss.flatMap((s) => s.produces ?? [])]);
    return ss.flatMap((s) =>
      (s.requires ?? []).filter((r) => !made.has(r)).map((r) => ctx.fail(m("check.flow.orphan-requires", { step: label(doc, s.id), state: r }), loc(doc, s.id))),
    );
  },
});

/**
 * 分岐で前に飛ぶとき、飛ばされる手順に produces が無いと「飛ばしてよいか」を検証できない。
 * 状態を宣言させることで、論理の検査が効く状態を保つ。
 */
export const flowDeclarations = defineCheck({
  id: "flow/declarations",
  axis: "logic",
  scope: "item",
  kinds: ["procedure"],
  severity: "warn",
  run(doc, ctx) {
    const ss = steps(doc);
    const g = buildGraph(ss);
    const byId = new Map(ss.map((s) => [s.id, s]));
    /** 分岐しない場合の道筋（既定の次）を id から終端までたどる */
    const defaultPath = (id: string) => {
      const out: string[] = [];
      let cur: string | undefined = (g.edges.get(id) ?? []).find((e) => !e.cond)?.to;
      while (cur && !out.includes(cur) && byId.has(cur)) {
        out.push(cur);
        cur = (g.edges.get(cur) ?? []).find((e) => !e.cond)?.to;
      }
      return out;
    };
    const out = [];
    for (const s of ss)
      for (const b of s.branches ?? []) {
        // 行き先が既定の道筋の先にあるときだけ「飛ばした」とみなす（補助手順への分岐は対象外）
        const path = defaultPath(s.id);
        const at = path.indexOf(b.goto);
        if (at <= 0) continue;
        for (const skipped of path.slice(0, at).map((id) => byId.get(id)!))
          if (!skipped.produces?.length)
            out.push(ctx.fail(m("check.flow.undeclared-skip", { step: label(doc, s.id), cond: b.if, skipped: label(doc, skipped.id) }), loc(doc, skipped.id)));
      }
    return out;
  },
});

/** どのシナリオ（flows）でも通らない分岐・終端（テストのカバレッジ） */
export const flowCoverage = defineCheck({
  id: "flow/coverage",
  axis: "logic",
  scope: "document",
  kinds: ["procedure"],
  severity: "warn",
  run(doc, ctx) {
    const ss = steps(doc);
    const g = buildGraph(ss);
    const branches = ss.flatMap((s) => (s.branches ?? []).map((b) => ({ from: s.id, to: b.goto, cond: b.if })));
    if (!branches.length) return [];
    const flows = (doc.data.flows ?? []) as any[];
    if (!flows.length) return [ctx.fail(m("check.flow.no-scenarios", { n: branches.length }))];
    const walked = new Set<string>();
    const ends = new Set<string>();
    for (const f of flows) {
      const r = simulate(ss, g, f.choose ?? {}, doc.data.initial_state ?? []);
      r.path.forEach((id, i) => i && walked.add(`${r.path[i - 1]}>${id}`));
      if (r.end) ends.add(r.end);
    }
    const out = branches
      .filter((b) => !walked.has(`${b.from}>${b.to}`))
      .map((b) => ctx.fail(m("check.flow.uncovered-branch", { step: label(doc, b.from), cond: b.cond }), loc(doc, b.from)));
    for (const t of g.terminals) if (reachable(g).has(t) && !ends.has(t)) out.push(ctx.fail(m("check.flow.uncovered-end", { step: label(doc, t) }), loc(doc, t)));
    return out;
  },
});

export const flowChecks = [flowRefs, flowReachable, flowTerminates, flowLoop, flowState, flowOrphanRequires, flowDeclarations, flowScenario, flowCoverage];
