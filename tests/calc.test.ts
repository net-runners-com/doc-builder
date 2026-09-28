import { expect, test } from "bun:test";
import { evalCalc } from "../src/parse/calc";

const data = { costs: [{ unit_price: 1200, qty: 20 }, { unit_price: 0, qty: 1 }], rate: 2 };

test("sum と四則演算", () => {
  expect(evalCalc("sum(costs, unit_price*qty)", data)).toBe(24000);
  expect(evalCalc("(1 + 2) * rate - -1", data)).toBe(7);
  expect(evalCalc("count(costs)", data)).toBe(2);
});

test("エラー", () => {
  expect(() => evalCalc("nope * 2", data)).toThrow("未定義の値");
  expect(() => evalCalc("1 / 0", data)).toThrow("0 で割って");
  expect(() => evalCalc("sum(rate, 1)", data)).toThrow("リストではありません");
  expect(() => evalCalc("1 +", data)).toThrow();
  expect(() => evalCalc("max(costs)", data)).toThrow("未知の関数");
});
