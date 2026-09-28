import { m } from "../messages";
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
  if (!data || typeof data !== "object" || Array.isArray(data)) return [{ ptr: "", message: m("layout.root") }];
  for (const k of Object.keys(data)) if (!TOP.has(k)) errs.push({ ptr: `/${k}`, message: m("layout.unknown-key", { key: k, keys: [...TOP].join(", ") }) });
  if (data.page_numbers !== undefined && !START.includes(data.page_numbers?.start_at))
    errs.push({ ptr: "/page_numbers", message: m("layout.start-at", { values: START.join(" | ") }) });
  for (const r of REGIONS) {
    const v = data[r];
    if (v === undefined || v === null) {
      if (!partial && v === undefined) continue;
      continue;
    }
    if (!Array.isArray(v)) {
      errs.push({ ptr: `/${r}`, message: m("layout.region-array", { region: r }) });
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
    else return errs.push({ ptr, message: m("layout.node-form") });
    const def = reg[name];
    if (!def) return errs.push({ ptr, message: m("layout.unknown-component", { name }) });
    if (!def.regions.includes(region)) errs.push({ ptr, message: m("layout.region-denied", { name, region, regions: def.regions.join(", ") }) });
    const pptr = typeof n === "string" ? ptr : `${ptr}/${name}`;
    if (!def.container && props && typeof props === "object" && "children" in props) {
      errs.push({ ptr: pptr, message: m("layout.no-children", { name }) });
      return;
    }
    const target = props === undefined ? (isScalarSchema(def.props) ? undefined : null) : props;
    const v = compile(def.props);
    const ok = target === null ? v(null) || v({}) : v(target);
    if (!ok && props === undefined) errs.push({ ptr: pptr, message: m("layout.props-required", { name }) });
    else if (!ok)
      for (const e of v.errors ?? []) {
        if (e.keyword === "anyOf" && (v.errors?.length ?? 0) > 1) continue;
        const extra = (e.params as any).additionalProperty ?? (e.params as any).missingProperty;
        errs.push({ ptr: pptr + e.instancePath, message: `${name}${e.instancePath}: ${e.message}${extra ? ` (${extra})` : ""}` });
      }
    if (def.container && Array.isArray(props?.children)) props.children.forEach((c: LNode, i: number) => node(c, region, `${pptr}/children/${i}`));
  }
}

const isScalarSchema = (s: any) => !!s.anyOf || (s.type && s.type !== "object" && s.type !== "null" && !Array.isArray(s.type));
