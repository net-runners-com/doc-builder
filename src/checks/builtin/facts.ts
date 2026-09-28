import { m } from "../../messages";
import { Skip, Unknown } from "../../errors";
import { loadFacts, readSnapshot } from "../../facts/load";
import { probe, type ProbeResult } from "../../facts/probe";
import { factText, type Fact } from "../../facts/types";
import type { Doc } from "../../types";
import { defineCheck, defineProjectCheck, type BaseCtx, type ProjectCheck } from "../define";

export const FACTS_DOC = "@facts";


export const factsValid = defineProjectCheck({
  id: "facts/valid",
  axis: "structure",
  scope: "corpus",
  severity: "error",
  run: (ctx) => loadFacts(ctx.root).errors.map((e) => ctx.fail(e.message, { line: e.line })),
});

const when = (r: ProbeResult) => `${r.host} ${r.at.slice(0, 16).replace("T", " ")}`;

export function probeCheck(f: Fact): ProjectCheck {
  return defineProjectCheck({
    id: `probe/${f.id}`,
    axis: "fact",
    scope: "corpus",
    trigger: "probe",
    severity: "error",
    async run(ctx: BaseCtx) {
      const r = await probe(f, { root: ctx.root, timeoutMs: ctx.config.probe.timeoutMs, updateSnapshots: ctx.options.updateSnapshots, snapshot: readSnapshot(ctx.root, f.id) });
      ctx.probes.set(f.id, r);
      const note = `${when(r)}${r.ms ? ` ${r.ms}ms` : ""}`;
      const loc = { blockId: f.id, line: f.origin === "facts.yaml" ? f.line : undefined };
      const head = `${f.origin === "facts.yaml" ? "" : `[${f.origin}] `}${factText(f)}`;
      if (r.status === "unknown") throw new Unknown(`${r.messages.join(" / ")}（${note}）`);
      if (r.status === "fail") return { findings: r.messages.map((m) => ctx.fail(`${head}: ${m}`, loc)), note };
      return { findings: [], note };
    },
  });
}

/** 実機検証の対象（facts.yaml と各文書の facts: で verify か capture を持つもの） */
export function probeTargets(root: string, docs: Doc[]): Fact[] {
  const all = [...Object.values(loadFacts(root).facts), ...docs.flatMap((d) => Object.values(d.facts))];
  return all.filter((f) => f.verify || f.capture);
}

export const factRefs = defineCheck({
  id: "fact/refs",
  axis: "fact",
  scope: "item",
  trigger: "probe",
  kinds: ["*"],
  severity: "error",
  run(doc, ctx) {
    const out = [];
    for (const id of doc.factRefs) {
      const r = ctx.probes.get(id);
      if (r?.status !== "fail") continue;
      const t = doc.texts.find((t) => t.raw.includes(`fact:${id}`) || t.raw.includes(`capture:${id}`));
      out.push(ctx.fail(m("check.fact.mismatch", { id, host: r.host, date: r.at.slice(0, 10), detail: r.messages[0].split("\n")[0] }), { blockId: t?.blockId, line: t?.line }));
    }
    return out;
  },
});

export function unusedFacts(docs: Doc[]): ProjectCheck {
  return defineProjectCheck({
    id: "unused/facts",
    axis: "structure",
    scope: "corpus",
    severity: "warn",
    run(ctx) {
      const used = new Set(docs.flatMap((d) => d.factRefs));
      return Object.values(loadFacts(ctx.root).facts)
        .filter((f) => !used.has(f.id))
        .map((f) => ctx.fail(m("check.unused.fact-corpus", { id: f.id }), { blockId: f.id, line: f.line }));
    },
  });
}
