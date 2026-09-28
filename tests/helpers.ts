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
