import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ツール自体の文言（チェック結果・CLI・UI・ビルドログ）。ID → 文面、{x} は変数。
 * 定義元は src/messages/default.json、プロジェクトの messages.json で上書きできる。
 */
const read = (p: string) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {});
let table: Record<string, string> = read(join(import.meta.dir, "default.json"));

export function useMessages(root: string) {
  table = { ...read(join(import.meta.dir, "default.json")), ...read(join(root, "messages.json")) };
}

export function m(id: string, vars: Record<string, unknown> = {}): string {
  const tpl = table[id];
  if (tpl === undefined) return `⟨${id}⟩`;
  return tpl.replace(/\{([a-zA-Z_]+)\}/g, (all, k) => (k in vars ? String(vars[k]) : all));
}

export const messageIds = () => Object.keys(read(join(import.meta.dir, "default.json")));
