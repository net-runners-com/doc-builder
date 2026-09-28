import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadCompany } from "../../page/company";
import { loadComponents, withDefaults } from "../../page/components";
import { checkLayoutFile, listLayouts } from "../../page/resolve";
import { nodeName, nodeProps, walkLayout } from "../../page/types";
import { listWordings, validateStrings, wordingsDir } from "../../wording";
import { defineCheck, defineProjectCheck } from "../define";

export const layoutValid = defineProjectCheck({
  id: "layout/valid",
  group: "rules",
  severity: "error",
  run(ctx) {
    const { defs, errors } = loadComponents(ctx.root);
    const out = errors.map((e) => ctx.fail(e, { blockId: "components" }));
    for (const id of listLayouts(ctx.root))
      for (const e of checkLayoutFile(ctx.root, id, defs)) out.push(ctx.fail(`layouts/${id}.yaml: ${e.message}`, { blockId: id, line: e.line }));
    return out;
  },
});

export const wordingValid = defineProjectCheck({
  id: "wording/valid",
  group: "rules",
  severity: "error",
  run(ctx) {
    const out = [];
    for (const id of listWordings(ctx.root)) {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(readFileSync(join(wordingsDir(ctx.root), `${id}.json`), "utf8"));
      } catch (e) {
        out.push(ctx.fail(`wordings/${id}.json: ${(e as Error).message}`, { blockId: id }));
        continue;
      }
      for (const e of validateStrings(data)) out.push(ctx.fail(`wordings/${id}.json: ${e.message}`, { blockId: id }));
    }
    return out;
  },
});

/** 文書が使うレイアウトの部品に必要なデータがあるか */
export const layoutData = defineCheck({
  id: "layout/data",
  group: "rules",
  kinds: ["*"],
  severity: "error",
  run(doc, ctx) {
    const out = ctx.layout.errors.map((e) => ctx.fail(`レイアウト "${ctx.layout.id}": ${e}`, { line: doc.lineOf("/layout") }));
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
          const missing = k === "company" ? company.error : k.startsWith("meta.") && !hasValue(meta[k.slice(5)]) ? `${k} がありません` : undefined;
          const msg = missing && `${region}/${def.name}: ${missing}`;
          if (msg && !seen.has(msg)) {
            seen.add(msg);
            out.push(ctx.fail(msg, { line: doc.lineOf(k.startsWith("meta.") ? "/meta" : "") }));
          }
        }
      }
      if (def.name === "company" && company.company?.logo && props?.logo && !existsSync(company.company.logo))
        out.push(ctx.fail(`company.yaml のロゴが存在しません: ${company.company.logo}`));
    }
    return out;
  },
});

const hasValue = (v: unknown) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length);

/** 承認欄: 版 1.0 以上は全役割に氏名・日付、stamp の画像が存在すること */
export const approvalComplete = defineCheck({
  id: "approval/complete",
  group: "rules",
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
        if (released && (!a?.name || !a?.date)) out.push(ctx.fail(`版 ${meta.version}: 承認欄「${r}」の${!a ? "記載" : !a.name ? "氏名" : "日付"}がありません`, { line: line(i < 0 ? undefined : i) }));
      }
    }
    approvals.forEach((a, i) => {
      if (a.stamp && !existsSync(resolve(doc.dir, a.stamp))) out.push(ctx.fail(`印影の画像が存在しません: ${a.stamp}`, { line: line(i) }));
    });
    return out;
  },
});
