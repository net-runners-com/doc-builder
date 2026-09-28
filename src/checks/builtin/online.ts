import { Skip, Unknown } from "../../errors";
import type { Finding } from "../../types";
import { defineCheck, type CheckCtx } from "../define";

export interface Fetched {
  status: number;
  text: string;
  fetchedAt: string;
}

export async function fetchPage(url: string, ctx: CheckCtx): Promise<Fetched> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(ctx.config.online.timeoutMs), headers: { "user-agent": ctx.config.online.userAgent } });
    return { status: res.status, text: await res.text(), fetchedAt: new Date().toISOString() };
  } catch (e) {
    return { status: 0, text: String((e as Error).message), fetchedAt: new Date().toISOString() };
  }
}

export const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)));
}

/** 取得結果ごとに判定し、fail が無く unknown / skip があればそれを優先して投げる */
async function perSource(
  ctx: CheckCtx,
  items: { url: string; judge: (f: Fetched) => Finding | "ok" }[],
): Promise<Finding[]> {
  if (!ctx.options.online) throw new Skip("未実行（--online で実行）");
  const out: Finding[] = [];
  const unknown: string[] = [];
  for (const it of items) {
    const f = await fetchPage(it.url, ctx);
    if (f.status === 0) unknown.push(`${it.url}: 取得失敗 (${f.text})`);
    else if (ctx.config.online.blockedStatuses.includes(f.status)) unknown.push(`${it.url}: HTTP ${f.status}（遮断の可能性）`);
    else {
      const r = it.judge(f);
      if (r !== "ok") out.push(r);
    }
  }
  if (out.length) return out;
  if (unknown.length) throw new Unknown(unknown.join(" / "));
  return out;
}

export const onlineUrl = defineCheck({
  id: "online/url",
  group: "online",
  kinds: ["*"],
  severity: "error",
  run: (doc, ctx) =>
    perSource(
      ctx,
      (doc.data.sources ?? []).map((s: any, i: number) => ({
        url: s.url,
        judge: (f: Fetched) =>
          f.status >= 400 ? ctx.fail(`出典 URL が HTTP ${f.status}: ${s.url}`, { blockId: s.id, line: doc.lineOf(`/sources/${i}/url`) }) : "ok",
      })),
    ),
});

export const onlineQuote = defineCheck({
  id: "online/quote",
  group: "online",
  kinds: ["*"],
  severity: "error",
  run(doc, ctx) {
    const quotes = doc.texts
      .filter((t) => t.ptr.endsWith("/quote/text"))
      .map((t) => {
        const srcId = findQuoteSource(doc.data, t.ptr);
        return { t, src: (doc.data.sources ?? []).find((s: any) => s.id === srcId) };
      })
      .filter((q) => q.src);
    return perSource(
      ctx,
      quotes.map(({ t, src }) => ({
        url: src.url,
        judge: (f: Fetched) => {
          if (f.status >= 400) return ctx.fail(`引用元が HTTP ${f.status}: ${src.url}`, { blockId: t.blockId, line: t.line });
          return normalize(pageText(f.text)).includes(normalize(t.raw))
            ? "ok"
            : ctx.fail(`引用文が引用元ページに見つかりません: 「${t.raw.slice(0, 40)}」`, { blockId: t.blockId, line: t.line });
        },
      })),
    );
  },
});

function findQuoteSource(data: any, textPtr: string): string | undefined {
  const path = textPtr.split("/").slice(1, -1);
  let v = data;
  for (const k of path) v = v?.[/^\d+$/.test(k) ? Number(k) : k];
  return v?.source;
}

export const onlineChecks = [onlineUrl, onlineQuote];
