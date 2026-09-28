import { join } from "node:path";
import { requireTool } from "../errors";

export interface Mark {
  kind: string;
  id: string;
  edge: "start" | "end";
  keep: boolean;
  page: number;
  y: number;
}
export interface PageInfo {
  height: number;
  top: number;
  bottom: number;
}
export interface PaginationIssue {
  type: "split" | "orphan-heading" | "gap";
  id: string;
  kind: string;
  page: number;
  /** gap のときの余白の割合（0〜1） */
  ratio?: number;
}

/** コンパイルして目印（dtr-mark / dtr-page）の位置を取り出す */
export function queryMarks(work: string): { page: PageInfo; marks: Mark[] } {
  const typst = requireTool("typst", "brew install typst");
  const p = Bun.spawnSync([typst, "eval", "query(<dtr>).map(it => it.value)", "--in", join(work, "main.typ"), "--root", work], { stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(p.stderr.toString().trim().split("\n").slice(0, 4).join(" / "));
  const all = JSON.parse(p.stdout.toString()) as any[];
  const page = all.find((x) => x.kind === "page") as PageInfo;
  return { page, marks: all.filter((x) => x.kind !== "page") as Mark[] };
}

/**
 * - split: 収まるはずの塊（keep=true）が 2 ページにまたがった
 * - orphan-heading: 見出しだけがページ末に残り、続きが次のページに送られた
 * - gap: 塊を次のページに送った結果、前のページの下部に max_gap を超える余白ができた
 */
export function analyze(page: PageInfo, marks: Mark[], maxGap: number): PaginationIssue[] {
  const out: PaginationIssue[] = [];
  const bodyTop = page.top;
  const bodyBottom = page.height - page.bottom;
  const bodyH = bodyBottom - bodyTop;
  const starts = new Map<string, Mark>();
  for (const m of marks) {
    const key = `${m.kind}:${m.id}`;
    if (m.edge === "start") starts.set(key, m);
    else {
      const s = starts.get(key);
      if (s && s.keep && s.page !== m.page) out.push({ type: "split", id: m.id, kind: m.kind, page: s.page });
    }
  }
  const open: Mark[] = []; // 開いている「分割しない塊」
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (m.kind !== "text" && m.keep) {
      if (m.edge === "start") open.push(m);
      else open.splice(open.findIndex((o) => o.kind === m.kind && o.id === m.id), 1);
    }
    // 見出しの終わりの直後の目印が次のページで始まる（分割しない塊の中の見出しは塊ごと動くので対象外）
    if (m.kind === "heading" && m.edge === "end" && !open.length) {
      const next = marks.slice(i + 1).find((x) => x.edge === "start");
      if (next && next.page > m.page) out.push({ type: "orphan-heading", id: m.id, kind: m.kind, page: m.page });
    }
    // 塊が次のページへ送られ、直前の要素の終わりから本文下端までの余白が大きい
    if (m.edge === "start" && m.keep && i > 0) {
      const prev = marks[i - 1];
      if (prev.page < m.page && m.y <= bodyTop + 1) {
        const ratio = (bodyBottom - prev.y) / bodyH;
        if (ratio > maxGap) out.push({ type: "gap", id: m.id, kind: m.kind, page: prev.page, ratio });
      }
    }
  }
  return out;
}
