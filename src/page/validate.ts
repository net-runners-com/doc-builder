import Ajv from "ajv";
import type { Registry } from "./components";
import { REGIONS, type LNode, type Region } from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });
const compile = (schema: object) => ajv.compile(schema);

export interface LayoutError {
  ptr: string;
  message: string;
}

const TOP = new Set(["name", "extends", "page_numbers", ...REGIONS]);
const START = ["cover", "front", "body"];

/** レイアウト（ファイル全体または解決済み）の木を検証する */
export function validateLayout(data: any, reg: Registry, partial = false): LayoutError[] {
  const errs: LayoutError[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return [{ ptr: "", message: "レイアウトのルートはマッピングでなければなりません" }];
  for (const k of Object.keys(data)) if (!TOP.has(k)) errs.push({ ptr: `/${k}`, message: `未知の項目 "${k}"（使えるのは ${[...TOP].join(", ")}）` });
  if (data.page_numbers !== undefined && !START.includes(data.page_numbers?.start_at))
    errs.push({ ptr: "/page_numbers", message: `page_numbers.start_at は ${START.join(" | ")} のいずれかです` });
  for (const r of REGIONS) {
    const v = data[r];
    if (v === undefined || v === null) {
      if (!partial && v === undefined) continue;
      continue;
    }
    if (!Array.isArray(v)) {
      errs.push({ ptr: `/${r}`, message: `${r} は要素の配列で書いてください` });
      continue;
    }
    v.forEach((n: LNode, i: number) => node(n, r, `/${r}/${i}`));
  }
  return errs;

  function node(n: LNode, region: Region, ptr: string) {
    let name: string;
    let props: any;
    if (typeof n === "string") [name, props] = [n, undefined];
    else if (n && typeof n === "object" && !Array.isArray(n) && Object.keys(n).length === 1) [name, props] = Object.entries(n)[0];
    else return errs.push({ ptr, message: "要素は「部品名」か「部品名: 設定」の形で書いてください" });
    const def = reg[name];
    if (!def) return errs.push({ ptr, message: `未知の部品 "${name}"` });
    if (!def.regions.includes(region)) errs.push({ ptr, message: `${name} は ${region} に置けません（置ける区画: ${def.regions.join(", ")}）` });
    const pptr = typeof n === "string" ? ptr : `${ptr}/${name}`;
    if (!def.container && props && typeof props === "object" && "children" in props) {
      errs.push({ ptr: pptr, message: `${name} は子要素（children）を持てません` });
      return;
    }
    const target = props === undefined ? (isScalarSchema(def.props) ? undefined : null) : props;
    const v = compile(def.props);
    const ok = target === null ? v(null) || v({}) : v(target);
    if (!ok)
      for (const e of v.errors ?? []) {
        if (e.keyword === "anyOf" && (v.errors?.length ?? 0) > 1) continue;
        const extra = (e.params as any).additionalProperty ?? (e.params as any).missingProperty;
        errs.push({ ptr: pptr + e.instancePath, message: `${name}${e.instancePath}: ${props === undefined ? "設定が必要です" : e.message}${extra ? ` (${extra})` : ""}` });
      }
    if (def.container && Array.isArray(props?.children)) props.children.forEach((c: LNode, i: number) => node(c, region, `${pptr}/children/${i}`));
  }
}

const isScalarSchema = (s: any) => !!s.anyOf || (s.type && s.type !== "object" && s.type !== "null" && !Array.isArray(s.type));
