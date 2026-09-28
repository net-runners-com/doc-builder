import { expect, test } from "bun:test";
import { noticePeriod, scheduleOrder } from "../src/checks/builtin/kinds";
import { MIN, docOf, messages } from "./helpers";

test("terms/notice-period", async () => {
  const src = (eff: string) =>
    MIN.terms.replace("effective: 2026-10-01", `effective: ${eff}`).replace("    clauses: [本文]", "    notice_days: 30\n    clauses: [本文]");
  expect(await messages(noticePeriod, docOf(src("2026-09-18")))).toEqual([
    "第1条は30日前の告知を定めていますが、updated（2026-09-01）から effective（2026-09-18）まで17日しかありません",
  ]);
  expect(await messages(noticePeriod, docOf(src("2026-10-01")))).toEqual([]);
});

test("schedule/order", async () => {
  const d = docOf(MIN.proposal + "schedule:\n  - { date: 2026-10-05, task: A }\n  - { date: 2026-10-19, task: B }\n  - { date: 2026-10-12, task: C }\n");
  expect(await messages(scheduleOrder, d)).toHaveLength(1);
  expect((await messages(scheduleOrder, d))[0]).toContain("「C」");
});
