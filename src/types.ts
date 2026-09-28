import type { Fact } from "./facts/types";
import type { Strings } from "./wording";
export type Kind = "terms" | "procedure" | "proposal" | "guide";
export const KINDS: Kind[] = ["terms", "procedure", "proposal", "guide"];
export type Group = "schema" | "rules" | "probe" | "online" | "review";
export const GROUPS: Group[] = ["schema", "rules", "probe", "online", "review"];
export type Status = "pass" | "fail" | "warn" | "unknown" | "skipped";

export interface Loc {
  doc: string;
  blockId?: string;
  line?: number;
}
export interface Finding {
  message: string;
  loc: Loc;
}
export interface CheckResult {
  doc: string;
  group: Group;
  checkId: string;
  status: Status;
  findings: Finding[];
  note?: string;
}
export interface Report {
  startedAt: string;
  finishedAt: string;
  docs: string[];
  results: CheckResult[];
}

export type DefType = "fact" | "article" | "step" | "section" | "table" | "figure" | "image" | "source";
export interface Def {
  type: DefType;
  ptr: string;
  line?: number;
  label?: string;
}
export interface TextNode {
  ptr: string;
  raw: string;
  blockId?: string;
  line?: number;
  block?: Record<string, unknown>;
}
export type BuildErrorId = "schema/valid" | "ref/resolve" | "calc/eval";
export interface Doc {
  name: string;
  path: string;
  dir: string;
  kind?: Kind;
  data: any;
  defs: Record<string, Def>;
  texts: TextNode[];
  placements: string[];
  citations: string[];
  /** 固定文言・書式（表記スタイル。組み込み → wordings/<name>.json → 文書の strings:） */
  strings: Strings;
  /** 文書内で定義した fact */
  facts: Record<string, Fact>;
  /** 本文から参照した fact / capture の ID */
  factRefs: string[];
  buildErrors: { checkId: BuildErrorId; finding: Finding }[];
  lineOf(ptr: string): number | undefined;
  expand(text: string, block?: Record<string, unknown>): string;
}
