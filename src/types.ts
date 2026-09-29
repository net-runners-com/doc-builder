import type { Fact } from "./facts/types";
import type { Strings } from "./wording";
export type Kind = "terms" | "procedure" | "proposal" | "guide";
export const KINDS: Kind[] = ["terms", "procedure", "proposal", "guide"];
/** 観点（何を確かめるか）。この順で表示し、structure の致命的エラーがあれば他を実行しない */
export type Axis = "structure" | "surface" | "fact" | "logic" | "expression" | "layout" | "review";
export const AXES: Axis[] = ["structure", "surface", "fact", "logic", "expression", "layout", "review"];
/** 範囲（どこを見るか） */
export type Scope = "word" | "sentence" | "item" | "section" | "document" | "corpus";
/** 実行条件 */
export type Trigger = "always" | "probe" | "online" | "review" | "render";
export type Status = "pass" | "fail" | "warn" | "unknown" | "skipped";

export interface Loc {
  doc: string;
  /** 指摘の行が文書以外のファイル（テストファイルなど）のとき、そのパス */
  file?: string;
  blockId?: string;
  /** 文 ID（<blockId>#<n>） */
  sentence?: string;
  line?: number;
}
export interface Finding {
  message: string;
  loc: Loc;
}
export interface CheckResult {
  doc: string;
  axis: Axis;
  scope: Scope;
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
export interface Sentence {
  /** <blockId>#<n>（ブロック内の本文で 1 始まり。見出しは <blockId>#title。blockId が無い場合は ptr） */
  id: string;
  /** raw 内の開始・終了位置 */
  start: number;
  end: number;
}
export interface TextNode {
  ptr: string;
  raw: string;
  blockId?: string;
  line?: number;
  block?: Record<string, unknown>;
  sentences: Sentence[];
}
export interface DocTests {
  path: string;
  data: { expect?: any[]; blocks?: Record<string, any[]>; flows?: any[] };
  errors: { message: string; line?: number }[];
  lineOf(ptr: string): number | undefined;
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
  /** 表記スタイルの解決に使ったファイル */
  wordingFiles: string[];
  /** 文書内で定義した fact */
  facts: Record<string, Fact>;
  /** 本文から参照した fact / capture の ID */
  factRefs: string[];
  buildErrors: { checkId: BuildErrorId; finding: Finding }[];
  /** doctests/<文書名>.yaml（無ければ undefined） */
  tests?: DocTests;
  lineOf(ptr: string): number | undefined;
  expand(text: string, block?: Record<string, unknown>): string;
}
