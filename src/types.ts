export type Kind = "terms" | "procedure" | "proposal" | "guide";
export const KINDS: Kind[] = ["terms", "procedure", "proposal", "guide"];
export type Group = "schema" | "rules" | "online" | "review";
export const GROUPS: Group[] = ["schema", "rules", "online", "review"];
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

export type DefType = "article" | "step" | "section" | "table" | "figure" | "image" | "source";
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
export interface Numbering {
  terms: string;
  procedure: string;
  heading: "1.1" | "none";
}
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
  buildErrors: { checkId: BuildErrorId; finding: Finding }[];
  lineOf(ptr: string): number | undefined;
  expand(text: string, block?: Record<string, unknown>): string;
}
