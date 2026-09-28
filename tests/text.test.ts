import { expect, test } from "bun:test";
import { glossaryAvoid, headingInBody, placeholder } from "../src/checks/builtin/text";
import { MIN, docOf, messages } from "./helpers";

const guide = (body: string, extra = "") => docOf(MIN.guide.replace("body: 本文", `body: ${JSON.stringify(body)}`) + extra);

test("glossary/avoid: 避ける語を検出し、定義語の部分一致は誤検出しない", async () => {
  const g = "glossary:\n  - term: ユーザー\n    avoid: [ユーザ, 会員]\n";
  expect(await messages(glossaryAvoid, guide("ユーザー数とユーザ数と会員", g))).toEqual(["「ユーザ」→「ユーザー」", "「会員」→「ユーザー」"]);
  expect(await messages(glossaryAvoid, guide("ユーザーだけ", g))).toEqual([]);
});

test("glossary/avoid: 長い語を優先（ユーザー と ユーザ の両方を避ける場合）", async () => {
  const g = "glossary:\n  - term: 利用者\n    avoid: [ユーザ, ユーザー]\n";
  expect(await messages(glossaryAvoid, guide("ユーザーは", g))).toEqual(["「ユーザー」→「利用者」"]);
});

test("text/placeholder", async () => {
  expect(await messages(placeholder, guide("Android：TBD、価格は未定、〇〇様"))).toHaveLength(3);
  expect(await messages(placeholder, guide("未定義の語、TBDX"))).toEqual([]);
});

test("text/heading-in-body", async () => {
  expect(await messages(headingInBody, guide("## 見出し\n本文"))).toHaveLength(1);
  expect(await messages(headingInBody, guide("#タグ と 本文"))).toEqual([]);
});
