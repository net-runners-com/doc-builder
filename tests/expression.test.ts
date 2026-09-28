import { expect, test } from "bun:test";
import { actionsPerSentence, commas, expressionChecks, sentenceLength, styleMix } from "../src/checks/builtin/expression";
import { countActions, morph, sentenceStyle } from "../src/morph";
import { MIN, docOf, messages, meta } from "./helpers";

const [expectStructure, expectExpression] = expressionChecks.slice(-2);
const guide = (body: string, extra = "") => docOf(MIN.guide.replace("body: 本文", `body: ${JSON.stringify(body)}`) + extra);

test("文体と動作の数（形態素解析）", async () => {
  expect(sentenceStyle(await morph("設定を開きます。"))).toBe("desumasu");
  expect(sentenceStyle(await morph("設定を開く。"))).toBe("dearu");
  expect(sentenceStyle(await morph("必要です。"))).toBe("desumasu");
  expect(sentenceStyle(await morph("必要である。"))).toBe("dearu");
  expect(sentenceStyle(await morph("管理画面の設定"))).toBeUndefined();
  expect(countActions(await morph("「設定」を開き、プランを選択する。"))).toBe(2);
  expect(countActions(await morph("「確定」をクリックする。"))).toBe(1);
});

test("文長・読点・文体の混在", async () => {
  const d = guide(`${"あ".repeat(121)}。一、二、三、四、五、六です。これは例である。`);
  expect(await messages(sentenceLength, d)).toEqual(["一文が 122 文字あります（上限 120）"]);
  expect(await messages(commas, d)).toEqual(["読点が 5 個あります（上限 4）"]);
  expect(await messages(styleMix, d)).toEqual(["です・ます調の文書にだ・である調の文があります"]);
});

test("手順の一文一動作", async () => {
  const d = docOf(`kind: procedure\n${meta("  audience: 管理者\n  estimated_time: 5分\n")}purpose: 目的。\nsteps:\n  - { id: a, title: 開く, actions: [設定を開き、プランを選択する。, 確定する。], expected: 開く。 }\n`);
  const f = await (await import("./helpers")).runCheck(actionsPerSentence, d);
  expect(f.map((x) => [x.message, x.loc.sentence])).toEqual([["一文に動作が 2 個あります（上限 1）", "a#1"]]);
});

test("expect: 項目ごとの判定条件", async () => {
  const d = docOf(`kind: proposal\n${meta("  client: C\n")}facts:\n  - { id: contact, value: 山田 }\nsections:
  - id: next
    title: 次のステップ
    body: ご不明点があれば担当営業までご連絡ください。など。
    expect:
      - contains_fact: contact
      - contains: [期限]
      - not_contains: [など]
      - max_sentences: 1
  - id: ok
    title: OK
    body: "担当は{{fact:contact}}です。"
    expect:
      - contains_fact: contact
`);
  expect(await messages(expectStructure, d)).toEqual(['next: fact "contact" を参照していません']);
  expect(await messages(expectExpression, d)).toEqual(["next: 「期限」がありません", "next: 「など」を含んでいます", "next: 文が 2 個あります（上限 1）"]);
});
