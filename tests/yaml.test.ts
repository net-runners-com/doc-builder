import { expect, test } from "bun:test";
import { loadYaml } from "../src/parse/yaml";

test("ネストした要素の行番号を返す", () => {
  const l = loadYaml("a:\n  - x: 1\n    y: 2026-01-02\n");
  expect(l.data.a[0].y).toBe("2026-01-02");
  expect(l.lineOf("/a/0/y")).toBe(3);
  expect(l.lineOf("/a/0/missing")).toBe(2);
});

test("構文エラーは error に行番号付きで返す", () => {
  const l = loadYaml("a: [1, 2\nb: 3\n");
  expect(l.data).toBeUndefined();
  expect(l.error?.line).toBeGreaterThan(0);
});
