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
      const r = simulate(ss, g, f.choose ?? {});
      const path = r.path.map((id) => label(doc, id)).join(" → ");
      if (r.error === "bad-choice") out.push(ctx.fail(m("check.flow.bad-choice", { flow: f.name, step: label(doc, r.at!), choice: f.choose?.[r.at!] ?? "" }), { line: flowLine(doc, i) }));
      else if (r.error === "loop") out.push(ctx.fail(m("check.flow.scenario-loop", { flow: f.name, path }), { line: flowLine(doc, i) }));
      else if (r.end !== f.expect_end) out.push(ctx.fail(m("check.flow.wrong-end", { flow: f.name, want: label(doc, f.expect_end), got: label(doc, r.end!), path }), { line: flowLine(doc, i) }));
    }
    return out;
  },
});

export const flowChecks = [flowRefs, flowReachable, flowTerminates, flowLoop, flowState, flowScenario];
