import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { t, type Strings } from "../wording";
import type { Company } from "./company";
import { REGIONS, type Region } from "./types";

/**
 * 部品はすべて components/<名前>/ のファイルで定義する（コードに部品を持たない）。
 *   component.yaml  description / regions / container / props（JSON Schema）/ defaults / needs
 *   render.typ      #let render(props, ctx, children) = ...（PDF）
 *   md.ts           export default (props, ctx, children) => string[]（Markdown。無ければ container は子を展開、それ以外は出力しない）
 */
export interface MdCtx {
  meta: Record<string, any>;
  company?: Company;
  strings: Strings;
  headings: { level: number; text: string }[];
  t(key: string, vars?: Record<string, string | number>): string;
}
export type MdFn = (props: any, ctx: MdCtx, children: string[]) => string[];

export interface ComponentDef {
  name: string;
  description?: string;
  regions: Region[];
  container: boolean;
  props: object;
  defaults?: unknown;
  /** 必要なデータ: "company" / "meta.<field>" / "meta.$fields"（props.fields の各項目） */
  needs: string[];
  typ: string;
  md?: MdFn;
}
export type Registry = Record<string, ComponentDef>;

export const componentsDir = (root: string) => join(root, "components");

export function loadComponents(root: string): { defs: Registry; errors: string[] } {
  const dir = componentsDir(root);
  const defs: Registry = {};
  const errors: string[] = [];
  if (!existsSync(dir)) return { defs, errors: ["components/ がありません"] };
  for (const f of [...new Bun.Glob("*/component.yaml").scanSync({ cwd: dir })].sort()) {
    const name = f.split("/")[0];
    const base = join(dir, name);
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      errors.push(`components/${name}: 部品名は英小文字・数字・ハイフンにしてください`);
      continue;
    }
    let spec: any;
    try {
      spec = parse(readFileSync(join(base, "component.yaml"), "utf8")) ?? {};
    } catch (e) {
      errors.push(`components/${name}/component.yaml: ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    const typ = join(base, "render.typ");
    if (!existsSync(typ)) errors.push(`components/${name}/render.typ がありません`);
    const bad = (spec.regions ?? []).filter((r: string) => !(REGIONS as readonly string[]).includes(r));
    if (bad.length) errors.push(`components/${name}: 未知の区画 ${bad.join(", ")}`);
    if (!spec.regions?.length) errors.push(`components/${name}: regions がありません`);
    const mdPath = join(base, "md.ts");
    let md: MdFn | undefined;
    if (existsSync(mdPath)) {
      try {
        md = require(mdPath).default;
      } catch (e) {
        errors.push(`components/${name}/md.ts: ${(e as Error).message}`);
      }
    }
    defs[name] = {
      name,
      description: spec.description,
      regions: (spec.regions ?? []).filter((r: string) => !bad.includes(r)),
      container: !!spec.container,
      props: spec.props ?? { type: "null" },
      defaults: spec.defaults,
      needs: spec.needs ?? [],
      typ,
      md,
    };
  }
  return { defs, errors };
}

const cache = new Map<string, Registry>();
export function registry(root: string): Registry {
  if (!cache.has(root)) cache.set(root, loadComponents(root).defs);
  return cache.get(root)!;
}
/** テスト・watch 用 */
export const clearRegistryCache = () => cache.clear();

/** 既定値を合成した設定（オブジェクトはマージ、スカラーは未指定なら既定値） */
export function withDefaults(def: ComponentDef, props: unknown): unknown {
  const d = def.defaults;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const { children: _c, ...rest } = (props && typeof props === "object" ? props : {}) as Record<string, unknown>;
    return { ...(d as object), ...rest };
  }
  return props ?? d ?? null;
}

export const mdCtx = (base: Omit<MdCtx, "t">): MdCtx => ({ ...base, t: (k, v) => t(base.strings, k, v) });
