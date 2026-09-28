import type { Numbering } from "../src/types";
export const NUM: Numbering = { terms: "第{n}条", procedure: "手順{n}", heading: "1.1" };

export const meta = (extra = "") =>
  `meta:\n  title: T\n  version: 1.0.0\n  updated: 2026-09-01\n  owner: O\n${extra}`;

export const MIN = {
  terms: `kind: terms\n${meta("  effective: 2026-10-01\n")}articles:\n  - id: a\n    title: 定義\n    clauses: [本文]\n`,
  procedure: `kind: procedure\n${meta("  audience: 管理者\n  estimated_time: 5分\n")}purpose: 目的\nsteps:\n  - id: s1\n    title: 開く\n    actions: [開く。]\n    expected: 開く。\n`,
  proposal: `kind: proposal\n${meta("  client: C\n")}sections:\n  - id: bg\n    title: 背景\n    body: 本文\n`,
  guide: `kind: guide\n${meta()}sections:\n  - id: intro\n    title: 概要\n    body: 本文\n`,
};

import type { Check, CheckCtx } from "../src/checks/define";
import { loadConfig } from "../src/config";
import { buildDoc } from "../src/parse/doc";
import { fallbackTheme } from "../src/theme/types";
import type { Doc } from "../src/types";

export const docOf = (src: string, path = "/tmp/dtr-none/doc.yaml") => {
  const d = buildDoc(path, src, NUM);
  if (d.buildErrors.length) throw new Error(JSON.stringify(d.buildErrors));
  return d;
};

export function ctxFor(doc: Doc, over: Partial<CheckCtx> = {}): CheckCtx {
  const root = "/tmp/dtr-none";
  return {
    root,
    config: loadConfig(root),
    options: {},
    today: new Date("2026-09-28"),
    cacheDir: "/tmp/dtr-none/cache",
    theme: fallbackTheme(),
    fail: (message, loc = {}) => ({ message, loc: { doc: doc.name, ...loc } }),
    ...over,
  };
}

export const runCheck = async (c: Check, d: Doc, over: Partial<CheckCtx> = {}) => c.run(d, ctxFor(d, over));
export const messages = async (c: Check, d: Doc, over: Partial<CheckCtx> = {}) =>
  (await runCheck(c, d, over)).map((f) => f.message);
