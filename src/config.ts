import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export interface Config {
  root: string;
  contentDir: string;
  defaultTheme: string;
  defaultLayout: string;
  defaultWording: string;
  review: { model: string; timeoutMs: number; retries: number; imageWidth: number };
  sourceMaxAgeDays: number;
  port: number;
  /** text/placeholder の正規表現 */
  placeholders: string[];
  online: { timeoutMs: number; userAgent: string; blockedStatuses: number[] };
  probe: { timeoutMs: number };
  render: { d2Pad: number };
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
export const workRoot = (root: string) => join(root, ".test-runner", "work");
