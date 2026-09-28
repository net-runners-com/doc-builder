import type { Config } from "../config";
import type { ClaudeRunner } from "../review/claude";
import type { ResolvedTheme } from "../theme/types";
import type { Doc, Finding, Group, Kind, Loc } from "../types";

export interface RunOptions {
  online?: boolean;
  review?: boolean;
  theme?: string;
  paths?: string[];
  today?: Date;
  claude?: ClaudeRunner;
}

export interface BaseCtx {
  root: string;
  config: Config;
  options: RunOptions;
  today: Date;
  cacheDir: string;
  fail(message: string, loc?: Omit<Loc, "doc">): Finding;
}
export interface CheckCtx extends BaseCtx {
  theme: ResolvedTheme;
}

export interface Check {
  id: string;
  group: Group;
  kinds: (Kind | "*")[];
  severity: "error" | "warn";
  run(doc: Doc, ctx: CheckCtx): Finding[] | Promise<Finding[]>;
}

/** 文書に紐づかないチェック（テーマなど）。結果の doc は "@themes" */
export interface ProjectCheck {
  id: string;
  group: "rules";
  severity: "error" | "warn";
  run(ctx: BaseCtx): Finding[] | Promise<Finding[]>;
}

export const defineCheck = (c: Check) => c;
export const defineProjectCheck = (c: ProjectCheck) => c;

/** テキストノードから loc を作る */
export const at = (t: { blockId?: string; line?: number }) => ({ blockId: t.blockId, line: t.line });
