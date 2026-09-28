import { m } from "../../messages";
import { defineCheck } from "../define";

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export const noticePeriod = defineCheck({
  id: "terms/notice-period",
  axis: "fact",
  scope: "document",
  kinds: ["terms"],
  severity: "error",
  run(doc, ctx) {
    const { updated, effective } = doc.data.meta;
    const gap = days(updated, effective);
    return (doc.data.articles as any[])
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => typeof a.notice_days === "number" && gap < a.notice_days)
      .map(({ a, i }) =>
        ctx.fail(m("check.terms.notice-period", { label: doc.defs[a.id].label, days: a.notice_days, updated, effective, gap }), {
          blockId: a.id,
          line: doc.lineOf(`/articles/${i}/notice_days`),
        }),
      );
  },
});

export const scheduleOrder = defineCheck({
  id: "schedule/order",
  axis: "logic",
  scope: "item",
  kinds: ["proposal"],
  severity: "error",
  run(doc, ctx) {
    const s = (doc.data.schedule ?? []) as { date: string; task: string }[];
    const out = [];
    for (let i = 1; i < s.length; i++)
      if (s[i].date < s[i - 1].date)
        out.push(ctx.fail(m("check.schedule.order", { task: s[i].task, date: s[i].date, prevTask: s[i - 1].task, prevDate: s[i - 1].date }), { line: doc.lineOf(`/schedule/${i}`) }));
    return out;
  },
});

export const kindChecks = [noticePeriod, scheduleOrder];
