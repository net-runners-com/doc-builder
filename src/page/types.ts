export const REGIONS = ["cover", "front", "back", "header", "footer"] as const;
export type Region = (typeof REGIONS)[number];

/** レイアウトの要素: "部品名" または { 部品名: 設定 } */
export type LNode = string | Record<string, unknown>;

export interface PageLayout {
  name?: string;
  page_numbers: { start_at: "cover" | "front" | "body" };
  cover: LNode[];
  front: LNode[];
  back: LNode[];
  header: LNode[];
  footer: LNode[];
}
export interface ResolvedLayout extends PageLayout {
  id: string;
  errors: string[];
}

export const nodeName = (n: LNode) => (typeof n === "string" ? n : Object.keys(n)[0]);
export const nodeProps = (n: LNode): any => (typeof n === "string" ? undefined : Object.values(n)[0]);
export const childrenOf = (n: LNode): LNode[] => {
  const p = nodeProps(n);
  return p && typeof p === "object" && Array.isArray(p.children) ? p.children : [];
};

/** 木の全要素を（区画, 要素）で列挙する */
export function* walkLayout(l: PageLayout): Generator<{ region: Region; node: LNode }> {
  const rec = function* (region: Region, nodes: LNode[]): Generator<{ region: Region; node: LNode }> {
    for (const n of nodes) {
      yield { region, node: n };
      yield* rec(region, childrenOf(n));
    }
  };
  for (const r of REGIONS) yield* rec(r, l[r] ?? []);
}
