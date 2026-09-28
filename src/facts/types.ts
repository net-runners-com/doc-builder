export interface Expect {
  exit?: number;
  equals?: string;
  stdout_contains?: string;
  stdout_match?: string;
  lines_equal_value?: true;
  max_ms?: number;
}
export type Shell = "powershell" | "pwsh" | "sh" | "bash";
export interface Fact {
  id: string;
  value?: string | number | string[];
  claim?: string;
  verify?: { shell?: Shell; run: string; timeout?: number | string; expect: Expect };
  capture?: { shell?: Shell; run: string; normalize?: string[] };
  /** 定義元（"facts.yaml" または文書名）と行 */
  origin: string;
  line?: number;
}

/** 本文 {{fact:ID}} の展開結果 */
export const factText = (f: Fact) =>
  f.claim ?? (Array.isArray(f.value) ? f.value.join("、") : f.value !== undefined ? String(f.value) : f.id);
