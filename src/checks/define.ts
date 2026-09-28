import type { Config } from "../config";
import type { ProbeResult } from "../facts/probe";
import type { ClaudeRunner } from "../review/claude";
import type { ResolvedLayout } from "../page/types";
import type { ResolvedTheme } from "../theme/types";
import type { Axis, Doc, Finding, Kind, Loc, Scope, TextNode, Trigger } from "../types";

export interface RunOptions {
  online?: boolean;
  review?: boolean;
  probe?: boolean;
  /** PDF を組版して体裁（改ページ・余白）を検査する */
  render?: boolean;
  updateSnapshots?: boolean;
  theme?: string;
  layout?: string;
  wording?: string;
  paths?: string[];
  today?: Date;
  claude?: ClaudeRunner;
}

export interface BaseCtx {
  root: string;
  config: Config;
  options: RunOptions;
  today: Date;
  /** この実行専用の作業ディレクトリ（終了時に削除） */
  workDir: string;
  /** この実行の実機検証結果（fact ID → 結果）。ディスクには保存しない */
  probes: Map<string, ProbeResult>;
  /** この実行の中だけで使う作業結果（実行をまたいで残さない） */
  memo: Map<string, unknown>;
  fail(message: string, loc?: Omit<Loc, "doc">): Finding;
}
export interface CheckCtx extends BaseCtx {
  theme: ResolvedTheme;
  layout: ResolvedLayout;
}

export interface Check {
  id: string;
  axis: Axis;
  scope: Scope;
  /** 省略時 always */
  trigger?: Trigger;
  kinds: (Kind | "*")[];
  severity: "error" | "warn";
  run(doc: Doc, ctx: CheckCtx): Finding[] | Promise<Finding[]>;
}

export type CheckOutput = Finding[] | { findings: Finding[]; note?: string };

/** 文書に紐づかないチェック（テーマ・fact など）。結果の doc は "@themes" / "@facts" */
export interface ProjectCheck {
  id: string;
  axis: Axis;
  scope: Scope;
  trigger?: Trigger;
  severity: "error" | "warn";
  run(ctx: BaseCtx): CheckOutput | Promise<CheckOutput>;
}

export const defineCheck = (c: Check) => c;
export const defineProjectCheck = (c: ProjectCheck) => c;

/** テキストノード（と文字位置）から loc を作る。位置があればその文の ID を付ける */
export const at = (t: TextNode, offset?: number) => ({
  blockId: t.blockId,
  line: t.line,
  sentence: offset === undefined ? undefined : t.sentences.find((s) => offset >= s.start && offset < s.end)?.id,
});
