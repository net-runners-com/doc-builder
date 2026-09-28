import { withDefaults, type MdCtx, type Registry } from "./components";
import { childrenOf, nodeName, nodeProps, type LNode } from "./types";

/** Typst の関数名（components/<name>.typ の render を別名で取り込む） */
export const typstFn = (name: string) => `comp-${name}`;
const q = (s: string) => JSON.stringify(s);

export function regionTypst(nodes: LNode[], reg: Registry): string[] {
  return nodes.map((n) => {
    const def = reg[nodeName(n)];
    const kids = def.container ? regionTypst(childrenOf(n), reg) : [];
    const props = JSON.stringify(withDefaults(def, nodeProps(n)));
    return `${typstFn(def.name)}(json(bytes(${q(props)})), ctx, (${kids.map((k) => `${k},`).join(" ")}))`;
  });
}

export function regionMd(nodes: LNode[], reg: Registry, ctx: MdCtx): string[] {
  return nodes.flatMap((n) => {
    const def = reg[nodeName(n)];
    const kids = def.container ? regionMd(childrenOf(n), reg, ctx) : [];
    if (def.md) return def.md(withDefaults(def, nodeProps(n)), ctx, kids);
    return def.container ? kids : [];
  });
}

/** 使われている部品の名前 */
export function usedComponents(nodes: LNode[], acc = new Set<string>()): Set<string> {
  for (const n of nodes) {
    acc.add(nodeName(n));
    usedComponents(childrenOf(n), acc);
  }
  return acc;
}
