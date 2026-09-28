import { expect, test } from "bun:test";
import { parse } from "yaml";
import { validateDoc } from "../src/schema/doc";
import { MIN } from "./helpers";

test.each(Object.entries(MIN))("%s の最小例は通る", (_k, src) => {
  expect(validateDoc(parse(src))).toEqual([]);
});

test("procedure の expected 欠落を指摘する", () => {
  const d = parse(MIN.procedure);
  delete d.steps[0].expected;
  const errs = validateDoc(d);
  expect(errs).toHaveLength(1);
  expect(errs[0].ptr).toBe("/steps/0");
  expect(errs[0].message).toContain('"expected"');
});

test("未知の kind", () => {
  expect(validateDoc({ kind: "memo" })[0].ptr).toBe("/kind");
});

test("ルートが配列・null", () => {
  expect(validateDoc([1])).toHaveLength(1);
  expect(validateDoc(null)).toHaveLength(1);
});

test("トップレベルの未知項目", () => {
  const d = parse(MIN.guide);
  d.sectons = [];
  expect(validateDoc(d)[0].message).toContain('"sectons"');
});
