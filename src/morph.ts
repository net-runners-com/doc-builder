import { tokenize } from "kuromojin";

export type Token = Awaited<ReturnType<typeof tokenize>>[number];
export const morph = (s: string): Promise<Token[]> => tokenize(s) as Promise<Token[]>;

/** 動作の数（自立動詞の数。サ変名詞＋する は 1 つ） */
export const countActions = (ts: Token[]) => ts.filter((t) => t.pos === "動詞" && t.pos_detail_1 === "自立").length;

/** 文末の文体: です・ます調 / だ・である調 / 判定なし（体言止め・命令など） */
export function sentenceStyle(ts: Token[]): "desumasu" | "dearu" | undefined {
  const body = ts.filter((t) => t.pos !== "記号");
  for (let i = body.length - 1; i >= 0; i--) {
    const t = body[i];
    if (t.pos === "助詞" && t.pos_detail_1 === "終助詞") continue;
    if (t.pos === "助動詞" && ["です", "ます"].includes(t.basic_form)) return "desumasu";
    if (t.pos === "助動詞" && ["だ", "ある"].includes(t.basic_form)) return "dearu";
    if (t.pos === "助動詞" && ["た", "ない", "ぬ", "う", "よう", "まい"].includes(t.basic_form)) continue;
    if (t.pos === "動詞" && (t.conjugated_form === "基本形" || t.conjugated_form === "連用形")) return "dearu";
    if (t.pos === "形容詞" && t.conjugated_form === "基本形") return "dearu";
    return undefined;
  }
  return undefined;
}
