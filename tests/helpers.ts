

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
import { join } from "node:path";
import { resolveLayout } from "../src/page/resolve";
import { resolveTheme } from "../src/theme/resolve";

export const REPO = join(import.meta.dir, "..");
import type { Doc } from "../src/types";

export const docOf = (src: string, path = "/tmp/dtr-none/doc.yaml") => {
  const d = buildDoc(path, src);
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
    workDir: "/tmp/dtr-none/work",
    probes: new Map(),
    memo: new Map(),
    theme: resolveTheme(REPO, "default"),
    layout: resolveLayout(REPO, "standard"),
    fail: (message, loc = {}) => ({ message, loc: { doc: doc.name, ...loc } }),
    ...over,
  };
}

export const runCheck = async (c: Check, d: Doc, over: Partial<CheckCtx> = {}) => c.run(d, ctxFor(d, over));
export const messages = async (c: Check, d: Doc, over: Partial<CheckCtx> = {}) =>
  (await runCheck(c, d, over)).map((f) => f.message);

import { cpSync } from "node:fs";
/** 一時プロジェクトに定義ファイル（テーマ・レイアウト・部品・レビュー指示文）を用意する */
export function scaffold(root: string) {
  for (const d of ["themes", "layouts", "components"]) cpSync(join(REPO, d), join(root, d), { recursive: true });
  cpSync(join(REPO, "reviews", "_prompt.md"), join(root, "reviews", "_prompt.md"));
  cpSync(join(REPO, "reviews", "_images.md"), join(root, "reviews", "_images.md"));
}
