import { TOKEN } from "../../parse/doc";
import { at, defineCheck } from "../define";

const plain = (s: string) => s.replace(TOKEN, " ");

export const glossaryAvoid = defineCheck({
  id: "glossary/avoid",
  group: "rules",
  kinds: ["*"],
  severity: "error",
  run(doc, ctx) {
    const entries = (doc.data.glossary ?? []) as { term: string; avoid: string[] }[];
    if (!entries.length) return [];
    const out = [];
    for (const t of doc.texts) {
      if (t.ptr.startsWith("/glossary")) continue;
      // 定義語そのものを先に伏せる（「ユーザ」が「ユーザー」の一部として誤検出されないように）
      let s = plain(t.raw);
      for (const e of entries) s = s.split(e.term).join("\u0000".repeat(e.term.length));
      const pairs = entries.flatMap((e) => e.avoid.map((a) => ({ a, term: e.term }))).sort((x, y) => y.a.length - x.a.length);
      for (const { a, term } of pairs) {
        if (!s.includes(a)) continue;
        out.push(ctx.fail(`「${a}」→「${term}」`, at(t)));
        s = s.split(a).join("\u0000".repeat(a.length));
      }
    }
    return out;
  },
});

export const placeholder = defineCheck({
  id: "text/placeholder",
  group: "rules",
  kinds: ["*"],
  severity: "error",
  run: (doc, ctx) =>
    doc.texts.flatMap((t) => [...plain(t.raw).matchAll(new RegExp(ctx.config.placeholders.join("|"), "g"))].map((m) => ctx.fail(`未記入のプレースホルダ「${m[0]}」`, at(t)))),
});

export const headingInBody = defineCheck({
  id: "text/heading-in-body",
  group: "rules",
  kinds: ["*"],
  severity: "error",
  run: (doc, ctx) =>
    doc.texts
      .filter((t) => /^\s{0,3}#{1,6}\s/m.test(t.raw))
      .map((t) => ctx.fail("本文に Markdown 見出しがあります（見出しは sections / children で構造化してください）", at(t))),
});

export const textChecks = [glossaryAvoid, placeholder, headingInBody];
