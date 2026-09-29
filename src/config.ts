import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export interface Config {
  root: string;
  contentDir: string;
  /** 文書のテスト（doctests/<文書名>.yaml）の置き場所 */
  testsDir: string;
  defaultTheme: string;
  defaultLayout: string;
  defaultWording: string;
  review: { model: string; timeoutMs: number; retries: number; imageWidth: number };
  sourceMaxAgeDays: number;
  /** theme/contrast の下限（WCAG AA = 4.5） */
  contrastMin: number;
  port: number;
  /** text/placeholder の正規表現 */
  placeholders: string[];
  online: { timeoutMs: number; userAgent: string; blockedStatuses: number[] };
  probe: { timeoutMs: number };
  render: { d2Pad: number };
  /** 表現の数値ルール。"*" が全種類の既定、種類ごとに上書き。style: desumasu | dearu | any */
  expression: Record<string, { max_sentence_length?: number; max_commas?: number; max_actions_per_sentence?: number; style?: "desumasu" | "dearu" | "any" }>;
}

/** 既定値は src/defaults/runner.json、プロジェクトの runner.yaml で上書き（オブジェクトは 1 段マージ） */
export function loadConfig(root: string): Config {
  const defaults = JSON.parse(readFileSync(join(import.meta.dir, "defaults", "runner.json"), "utf8"));
  const p = join(root, "runner.yaml");
  const user = existsSync(p) ? (parse(readFileSync(p, "utf8")) ?? {}) : {};
  const out: any = { ...defaults, root };
  for (const [k, v] of Object.entries(user)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? { ...defaults[k], ...v } : v;
  return out;
}

/** 実行ごとの作業ディレクトリの置き場（中身は毎回作り直し、終了時に削除する） */
export const workRoot = (root: string) => join(root, ".doc-builder", "work");
