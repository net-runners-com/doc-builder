import { m } from "../../messages";
import { countActions, morph, sentenceStyle } from "../../morph";
import { TOKEN } from "../../parse/doc";
import type { Doc, Finding, Kind, TextNode } from "../../types";
import { buildGraph, simulate } from "../../flow";
import { defineCheck, type CheckCtx } from "../define";

/** 判定対象の文: 本文の文（見出し #title を除く）。埋め込みは同じ長さの記号に置換して数える */
function sentences(doc: Doc, filter: (t: TextNode) => boolean = () => true) {
  return doc.texts
    .filter(filter)
    .flatMap((t) =>
      t.sentences
        .filter((s) => !s.id.endsWith("#title"))
        .map((s) => ({ t, s, text: t.raw.slice(s.start, s.end).replace(TOKEN, "□").trim() })),
    )
    .filter((x) => x.text);
}

const rules = (ctx: CheckCtx, kind?: Kind) => ({ ...ctx.config.expression["*"], ...(kind ? ctx.config.expression[kind] : {}) });
const loc = (x: { t: TextNode; s: { id: string } }) => ({ blockId: x.t.blockId, line: x.t.line, sentence: x.s.id });
/** 表・メタ情報・用語集は文章ではないので表現の判定から外す */
const prose = (t: TextNode) => !/^\/(meta|glossary|tables|sources|images|figures|facts|costs|schedule)\//.test(t.ptr) && !t.ptr.endsWith("/title");

export const sentenceLength = defineCheck({
  id: "expression/sentence-length",
  axis: "expression",
  scope: "sentence",
  kinds: ["*"],
  severity: "warn",
  run(doc, ctx) {
    const max = rules(ctx, doc.kind).max_sentence_length;
    if (!max) return [];
    return sentences(doc, prose).filter((x) => [...x.text].length > max).map((x) => ctx.fail(m("check.expression.long", { n: [...x.text].length, max }), loc(x)));
  },
});

export const commas = defineCheck({
  id: "expression/commas",
  axis: "expression",
  scope: "sentence",
  kinds: ["*"],
  severity: "warn",
  run(doc, ctx) {
    const max = rules(ctx, doc.kind).max_commas;
    if (!max) return [];
    return sentences(doc, prose)
      .map((x) => ({ x, n: (x.text.match(/[、,，]/g) ?? []).length }))
      .filter(({ n }) => n > max)
      .map(({ x, n }) => ctx.fail(m("check.expression.commas", { n, max }), loc(x)));
  },
});

export const styleMix = defineCheck({
  id: "expression/style",
  axis: "expression",
  scope: "document",
  kinds: ["*"],
  severity: "warn",
  async run(doc, ctx) {
    const want = rules(ctx, doc.kind).style;
    if (!want || want === "any") return [];
    const out = [];
    for (const x of sentences(doc, prose)) {
      if (!/[。．]$/.test(x.text)) continue; // 箇条書き・表の語句は対象外
      const got = sentenceStyle(await morph(x.text));
      if (got && got !== want) out.push(ctx.fail(m("check.expression.style", { want: m(`style.${want}`), got: m(`style.${got}`) }), loc(x)));
    }
    return out;
  },
});

/** ID のブロック（条・手順・節）を探す */
export function findBlock(doc: Doc, id: string): any {
  const visit = (arr: any[] | undefined): any => {
    for (const b of arr ?? []) {
      if (b.id === id) return b;
      const c = visit(b.children);
      if (c) return c;
    }
  };
  return visit(doc.data.articles) ?? visit(doc.data.steps) ?? visit(doc.data.sections);
}

/** テスト対象のブロック（条・手順・節）の ID */
export function testableBlocks(doc: Doc): string[] {
  const out: string[] = [];
  const visit = (arr: any[] | undefined) => (arr ?? []).forEach((b) => (out.push(b.id), visit(b.children)));
  visit(doc.data.articles);
  visit(doc.data.steps);
  visit(doc.data.sections);
  return out;
}

/** 条・手順・節・文書の expect: を評価する */
export function expectTargets(doc: Doc) {
  const list: { id?: string; expect: any[]; ptr: string; file?: string; lineOf: (p: string) => number | undefined }[] = [];
  const inDoc = { lineOf: doc.lineOf };
  if (doc.data.expect) list.push({ expect: doc.data.expect, ptr: "/expect", ...inDoc });
  const visit = (arr: any[] | undefined, ptr: string) =>
    (arr ?? []).forEach((b, i) => {
      if (b.expect) list.push({ id: b.id, expect: b.expect, ptr: `${ptr}/${i}/expect`, ...inDoc });
      if (b.children) visit(b.children, `${ptr}/${i}/children`);
    });
  visit(doc.data.articles, "/articles");
  visit(doc.data.steps, "/steps");
  visit(doc.data.sections, "/sections");
  // doctests/<文書名>.yaml（指摘はテストファイルの行を指す）
  const t = doc.tests;
  if (t) {
    const inTest = { file: t.path, lineOf: t.lineOf };
    if (t.data.expect) list.push({ expect: t.data.expect, ptr: "/expect", ...inTest });
    for (const [id, e] of Object.entries(t.data.blocks ?? {})) list.push({ id, expect: e, ptr: `/blocks/${id}`, ...inTest });
  }
  return list;
}

const STRUCTURE = ["contains_fact", "contains_ref", "has_table", "has_figure"];
/** review に回す条件（ここでは判定しない） */
const DELEGATED = ["ask"];

function expectCheck(axis: "structure" | "expression") {
  return defineCheck({
    id: `expect/${axis}`,
    axis,
    scope: "item",
    kinds: ["*"],
    severity: "error",
    async run(doc, ctx) {
      const out: Finding[] = [];
      for (const target of expectTargets(doc)) {
        const inBlock = (t: TextNode) => (target.id ? t.blockId === target.id : true) && prose(t);
        const raw = doc.texts.filter(inBlock).map((t) => t.raw).join("\n");
        const expanded = doc.texts.filter(inBlock).map((t) => doc.expand(t.raw, t.block)).join("\n");
        const blockData = target.id ? JSON.stringify(findBlock(doc, target.id) ?? {}) : JSON.stringify(doc.data);
        const ss = sentences(doc, inBlock);
        for (const [i, e] of target.expect.entries()) {
          const [k, v] = Object.entries(e)[0] as [string, any];
          if (DELEGATED.includes(k) || STRUCTURE.includes(k) !== (axis === "structure")) continue;
          const where = { blockId: target.id, file: target.file, line: target.lineOf(`${target.ptr}/${i}`) };
          const fail = (id: string, vars: Record<string, unknown>) => out.push(ctx.fail(m(`check.expect.${id}`, { block: target.id ?? doc.name, ...vars }), where));
          if (k === "contains_fact" && !new RegExp(`\\{\\{\\s*(fact|capture):${v}\\s*\\}\\}`).test(raw)) fail("fact", { id: v });
          if (k === "contains_ref" && !new RegExp(`\\{\\{\\s*ref:${v}\\s*\\}\\}`).test(raw)) fail("ref", { id: v });
          if (k === "contains") for (const w of v as string[]) if (!raw.includes(w)) fail("contains", { word: w });
          if (k === "not_contains") for (const w of v as string[]) if (raw.includes(w)) fail("not-contains", { word: w });
          if (k === "max_sentences" && ss.length > v) fail("sentences", { n: ss.length, max: v });
          if (k === "max_sentence_length") for (const x of ss) if ([...x.text].length > v) fail("length", { sentence: x.s.id, n: [...x.text].length, max: v });
          if (k === "min_sentences" && ss.length < v) fail("min-sentences", { n: ss.length, min: v });
          if (k === "contains_number" && !new RegExp(ctx.config.expectPatterns.number).test(expanded)) fail("number", {});
          if (k === "contains_date" && !new RegExp(ctx.config.expectPatterns.date).test(expanded)) fail("date", {});
          if (k === "matches" && !new RegExp(v).test(expanded)) fail("matches", { re: v });
          if (k === "has_table" && !/"table":/.test(blockData)) fail("table", {});
          if (k === "has_figure" && !/\{\{\s*(fig|img):/.test(raw)) fail("figure", {});
          if (k === "max_actions_per_sentence")
            for (const x of ss) {
              const n = countActions(await morph(x.text));
              if (n > v) fail("actions", { sentence: x.s.id, n, max: v });
            }
        }
      }
      return out;
    },
  });
}

export const actionsPerSentence = defineCheck({
  id: "expression/actions",
  axis: "expression",
  scope: "sentence",
  kinds: ["procedure"],
  severity: "warn",
  async run(doc, ctx) {
    const max = rules(ctx, doc.kind).max_actions_per_sentence;
    if (!max) return [];
    const out = [];
    for (const x of sentences(doc, (t) => /^\/steps\/\d+\/actions\//.test(t.ptr))) {
      const n = countActions(await morph(x.text));
      if (n > max) out.push(ctx.fail(m("check.expression.actions", { n, max }), loc(x)));
    }
    return out;
  },
});

/** doctests/<文書名>.yaml 自体の検査: 構文・スキーマ、存在しないブロック ID */
export const testsValid = defineCheck({
  id: "tests/valid",
  axis: "structure",
  scope: "document",
  kinds: ["*"],
  severity: "error",
  run(doc, ctx) {
    const t = doc.tests;
    if (!t) return [];
    const out = t.errors.map((e) => ctx.fail(e.message, { file: t.path, line: e.line }));
    for (const id of Object.keys(t.data.blocks ?? {}))
      if (!doc.defs[id]) out.push(ctx.fail(m("check.tests.unknown-block", { id }), { file: t.path, line: t.lineOf(`/blocks/${id}`) }));
    return out;
  },
});

/**
 * ブロック単位のテストカバレッジ。テストがあるとみなすのは:
 * 本文の expect:、doctests の blocks:、（手順書）シナリオがその手順を通る
 */
export const testsCoverage = defineCheck({
  id: "tests/coverage",
  axis: "structure",
  scope: "document",
  kinds: ["*"],
  severity: "warn",
  run(doc, ctx) {
    const all = testableBlocks(doc);
    if (!all.length) return [];
    const tested = new Set<string>();
    for (const t of expectTargets(doc)) if (t.id) tested.add(t.id);
    if (doc.kind === "procedure") {
      const ss = doc.data.steps ?? [];
      const g = buildGraph(ss);
      const flows = [...(doc.data.flows ?? []), ...(doc.tests?.data.flows ?? [])];
      for (const f of flows) for (const id of simulate(ss, g, f.choose ?? {}, doc.data.initial_state ?? []).path) tested.add(id);
    }
    const n = all.filter((id) => tested.has(id)).length;
    const pct = Math.round((n / all.length) * 100);
    const note = m("check.tests.coverage", { n, total: all.length, pct });
    const untested = all.filter((id) => !tested.has(id));
    const findings = pct < ctx.config.minCoverage ? [ctx.fail(m("check.tests.coverage-low", { pct, min: ctx.config.minCoverage, blocks: untested.join(", ") }))] : [];
    return { findings, note };
  },
});

export const expressionChecks = [testsValid, testsCoverage, sentenceLength, commas, styleMix, actionsPerSentence, expectCheck("structure"), expectCheck("expression")];
