import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface UrlEntry {
  title: string;
  url: string;
}

export function urlEntries(base: string, docs: string[]): UrlEntry[] {
  return [
    { title: "doc-test-runner", url: `${base}/` },
    ...docs.flatMap((d) => [
      { title: `${d} テスト`, url: `${base}/t/${encodeURIComponent(d)}` },
      { title: `${d} プレビュー`, url: `${base}/p/${encodeURIComponent(d)}` },
    ]),
  ];
}

export function writeUrls(root: string, entries: UrlEntry[]): string {
  const p = join(root, ".test-runner", "urls.json");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(entries, null, 2) + "\n");
  return p;
}

export const SUPERSET_FILE = join(homedir(), ".superset", "hosted-urls.json");

/** 同じ title の項目だけを置き換え、他の項目は変更しない */
export function registerSuperset(entries: UrlEntry[], file = SUPERSET_FILE): void {
  const cur: UrlEntry[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  const titles = new Set(entries.map((e) => e.title));
  const next = [...cur.filter((e) => !titles.has(e.title)), ...entries];
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(next, null, 1) + "\n");
}
