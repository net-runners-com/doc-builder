import { defineCheck } from "../define";

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export const noticePeriod = defineCheck({
  id: "terms/notice-period",
  group: "rules",
  kinds: ["terms"],
  severity: "error",
  run(doc, ctx) {
    const { updated, effective } = doc.data.meta;
    const gap = days(updated, effective);
    return (doc.data.articles as any[])
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => typeof a.notice_days === "number" && gap < a.notice_days)
      .map(({ a, i }) =>
        ctx.fail(`${doc.defs[a.id].label}は${a.notice_days}日前の告知を定めていますが、updated（${updated}）から effective（${effective}）まで${gap}日しかありません`, {
          blockId: a.id,
          line: doc.lineOf(`/articles/${i}/notice_days`),
        }),
      );
  },
});

export const scheduleOrder = defineCheck({
  id: "schedule/order",
  group: "rules",
  kinds: ["proposal"],
  severity: "error",
  run(doc, ctx) {
    const s = (doc.data.schedule ?? []) as { date: string; task: string }[];
    const out = [];
    for (let i = 1; i < s.length; i++)
      if (s[i].date < s[i - 1].date)
        out.push(ctx.fail(`「${s[i].task}」（${s[i].date}）が前の行「${s[i - 1].task}」（${s[i - 1].date}）より前の日付です`, { line: doc.lineOf(`/schedule/${i}`) }));
    return out;
  },
});

export const kindChecks = [noticePeriod, scheduleOrder];
