import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { m } from "./messages";

/** ツール本体の場所（src/ の 1 つ上） */
export const toolRoot = () => join(import.meta.dir, "..");

/** 複製するもの: [ツール内のパス, 新しいプロジェクト内のパス] */
export const STARTER: [string, string][] = [
  ["themes", "themes"],
  ["palettes", "palettes"],
  ["layouts", "layouts"],
  ["components", "components"],
  ["wordings", "wordings"],
  ["reviews", "reviews"],
  ["company.yaml", "company.yaml"],
  ["runner.yaml", "runner.yaml"],
  ["starter/content", "content"],
  ["starter/doctests", "doctests"],
];

function files(p: string): string[] {
  if (!statSync(p).isDirectory()) return [p];
  return readdirSync(p).flatMap((f) => files(join(p, f)));
}

/** 既存ファイルは上書きしない（force で上書き）。作成・スキップしたパスを返す */
export function initProject(target: string, opts: { force?: boolean; from?: string } = {}) {
  const from = opts.from ?? toolRoot();
  const created: string[] = [];
  const skipped: string[] = [];
  for (const [src, dst] of STARTER) {
    const base = join(from, src);
    if (!existsSync(base)) continue;
    for (const f of files(base)) {
      const rel = relative(base, f);
      const out = rel ? join(target, dst, rel) : join(target, dst);
      if (existsSync(out) && !opts.force) {
        skipped.push(relative(target, out));
        continue;
      }
      mkdirSync(dirname(out), { recursive: true });
      cpSync(f, out);
      created.push(relative(target, out));
    }
  }
  return { created, skipped, message: m("init.done", { created: created.length, skipped: skipped.length }) };
}
