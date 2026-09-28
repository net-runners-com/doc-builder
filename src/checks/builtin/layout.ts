import { m } from "../../messages";
import { existsSync, readFileSync } from "node:fs";
import { loadYaml } from "../../parse/yaml";
import { join, resolve } from "node:path";
import { loadCompany } from "../../page/company";
import { loadComponents, withDefaults } from "../../page/components";
import { checkLayoutFile, listLayouts } from "../../page/resolve";
import { nodeName, nodeProps, walkLayout } from "../../page/types";
import { listWordings, validateStrings, wordingsDir } from "../../wording";
import { defineCheck, defineProjectCheck } from "../define";

export const layoutValid = defineProjectCheck({
  id: "layout/valid",
  axis: "structure",
  scope: "corpus",
  severity: "error",
  run(ctx) {
    const { defs, errors } = loadComponents(ctx.root);
    const out = errors.map((e) => ctx.fail(e, { blockId: "components" }));
    for (const id of listLayouts(ctx.root))
      for (const e of checkLayoutFile(ctx.root, id, defs)) out.push(ctx.fail(m("check.layout.file", { file: `layouts/${id}.yaml`, error: e.message }), { blockId: id, line: e.line }));
    return out;
  },
});

export const wordingValid = defineProjectCheck({
  id: "wording/valid",
  axis: "structure",
  scope: "corpus",
  severity: "error",
  run(ctx) {
    const out = [];
    for (const id of listWordings(ctx.root)) {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(readFileSync(join(wordingsDir(ctx.root), `${id}.json`), "utf8"));
      } catch (e) {
        out.push(ctx.fail(m("check.wording.file", { file: `wordings/${id}.json`, error: (e as Error).message }), { blockId: id }));
        continue;
      }
      for (const e of validateStrings(data)) out.push(ctx.fail(m("check.wording.file", { file: `wordings/${id}.json`, error: e.message }), { blockId: id }));
    }
    return out;
  },
});

/** 文書が使うレイアウトの部品に必要なデータがあるか */
export const layoutData = defineCheck({
  id: "layout/data",
  axis: "structure",
  scope: "document",
  kinds: ["*"],
  severity: "error",
  run(doc, ctx) {
    const out = ctx.layout.errors.map((e) => ctx.fail(m("check.layout.error", { id: ctx.layout.id, error: e }), { line: doc.lineOf("/layout") }));
    const { defs } = loadComponents(ctx.root);
    const meta = doc.data.meta;
    const company = loadCompany(ctx.root);
    const seen = new Set<string>();
    for (const { region, node } of walkLayout(ctx.layout)) {
      const def = defs[nodeName(node)];
      if (!def) continue;
      const props: any = withDefaults(def, nodeProps(node));
      for (const need of def.needs) {
        const keys = need === "meta.$fields" ? (props?.fields ?? []).map((f: string) => `meta.${f}`) : [need];
        for (const k of keys) {
          const missing = k === "company" ? company.error : k.startsWith("meta.") && !hasValue(meta[k.slice(5)]) ? m("check.layout.missing-data", { key: k }) : undefined;
          const msg = missing && m("check.layout.needs", { region, component: def.name, error: missing });
          if (msg && !seen.has(msg)) {
            seen.add(msg);
            out.push(ctx.fail(msg, { line: doc.lineOf(k.startsWith("meta.") ? "/meta" : "") }));
          }
        }
      }
      if (def.name === "company" && company.company?.logo && props?.logo && !existsSync(company.company.logo))
        out.push(ctx.fail(m("check.layout.logo-missing", { path: company.company.logo })));
    }
    return out;
  },
});

const hasValue = (v: unknown) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length);

/** 承認欄: 版 1.0 以上は全役割に氏名・日付、stamp の画像が存在すること */
export const approvalComplete = defineCheck({
  id: "approval/complete",
  axis: "structure",
  scope: "item",
  kinds: ["*"],
  severity: "error",
  run(doc, ctx) {
    const { defs } = loadComponents(ctx.root);
    const nodes = [...walkLayout(ctx.layout)].filter(({ node }) => nodeName(node) === "approval");
    if (!nodes.length) return [];
    const meta = doc.data.meta;
    const approvals: any[] = meta.approvals ?? [];
    const released = Number(String(meta.version).split(".")[0]) >= 1;
    const out = [];
    const line = (i?: number) => doc.lineOf(i === undefined ? "/meta/approvals" : `/meta/approvals/${i}`);
    for (const { node } of nodes) {
      const roles: string[] = (withDefaults(defs.approval, nodeProps(node)) as any).roles;
      for (const r of roles) {
        const i = approvals.findIndex((a) => a.role === r);
        const a = approvals[i];
        if (released && (!a?.name || !a?.date)) out.push(ctx.fail(m(`check.approval.${!a ? "missing-role" : !a.name ? "missing-name" : "missing-date"}`, { version: meta.version, role: r }), { line: line(i < 0 ? undefined : i) }));
      }
    }
    approvals.forEach((a, i) => {
      if (a.stamp && !existsSync(resolve(doc.dir, a.stamp))) out.push(ctx.fail(m("check.approval.stamp-missing", { path: a.stamp }), { line: line(i) }));
    });
    return out;
  },
});

/** reviews/*.yaml の観点: ask と why_not_rule が必須、ID の重複なし */
export const reviewValid = defineProjectCheck({
  id: "review/valid",
  axis: "structure",
  scope: "corpus",
  severity: "error",
  run(ctx) {
    const dir = join(ctx.root, "reviews");
    if (!existsSync(dir)) return [];
    const out = [];
    const seen = new Map<string, string>();
    for (const f of [...new Bun.Glob("*.yaml").scanSync({ cwd: dir })].sort()) {
      const l = loadYaml(readFileSync(join(dir, f), "utf8"));
      if (l.error) {
        out.push(ctx.fail(m("parse.yaml", { error: l.error.message }), { blockId: f, line: l.error.line }));
        continue;
      }
      ((l.data?.aspects ?? []) as any[]).forEach((a, i) => {
        const line = l.lineOf(`/aspects/${i}`);
        for (const k of ["id", "ask", "why_not_rule"]) if (!a?.[k]) out.push(ctx.fail(m("check.review.aspect-missing", { file: f, key: k }), { blockId: a?.id, line }));
        const kind = f.replace(/\.yaml$/, "");
        const key = `${kind === "_common" ? "*" : kind}:${a?.id}`;
        if (a?.id && (seen.has(key) || seen.has(`*:${a.id}`))) out.push(ctx.fail(m("check.review.aspect-dup", { id: a.id, file: f }), { blockId: a.id, line }));
        seen.set(key, f);
      });
    }
    return out;
  },
});
