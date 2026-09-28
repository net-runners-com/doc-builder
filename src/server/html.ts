import { existsSync, readFileSync } from "node:fs";
import { ICON, counts, where, worst } from "../runner/format";
import { m } from "../messages";
import { AXES, type CheckResult, type Report, type Status } from "../types";

export interface Focus {
  doc?: string;
  axis?: string;
  checkId?: string;
  n?: number;
}

const h = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const enc = encodeURIComponent;
const icon = (s: Status) => `<span class="i ${s}">${ICON[s]}</span>`;

export function parseFocus(path: string): Focus {
  const [, t, doc, axis, a, b, n] = path.split("/").map(decodeURIComponent);
  if (t !== "t") return {};
  return { doc, axis, checkId: a && b ? `${a}/${b}` : undefined, n: n !== undefined ? Number(n) : undefined };
}

const CSS = `
:root{--bg:#fff;--fg:#1d2330;--muted:#6b7280;--line:#e5e7eb;--panel:#f7f8fa;--pass:#1a7f37;--fail:#cf222e;--warn:#9a6700;--unknown:#6b7280;--accent:#0969da}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--line:#30363d;--panel:#161b22;--pass:#3fb950;--fail:#f85149;--warn:#d29922;--unknown:#8b949e;--accent:#58a6ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,"Hiragino Sans",sans-serif}
header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--line)}
header b{margin-right:auto}button,select{font:inherit;padding:4px 10px;border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:6px;cursor:pointer}
main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)}@media(max-width:800px){main{grid-template-columns:1fr}}
.tree,.detail{padding:12px 16px;min-width:0}.detail{border-left:1px solid var(--line);background:var(--panel)}
ul{list-style:none;margin:0;padding-left:18px}.tree>ul{padding-left:0}summary{cursor:pointer}a{color:inherit;text-decoration:none}a:hover{color:var(--accent)}
.sel>a,.sel>summary>a{color:var(--accent);font-weight:600}.i{display:inline-block;width:1.2em;text-align:center;font-weight:700}
.pass{color:var(--pass)}.fail{color:var(--fail)}.warn{color:var(--warn)}.unknown,.skipped{color:var(--unknown)}.n{color:var(--muted);font-size:12px}
pre{background:var(--bg);border:1px solid var(--line);padding:8px;overflow:auto;border-radius:6px;font-size:12px}.hl{background:color-mix(in srgb,var(--fail) 18%,transparent)}
.msg{margin:6px 0;padding:6px 8px;border-left:3px solid var(--line)}iframe{width:100%;height:calc(100vh - 60px);border:0}
`;

export function shell(title: string, body: string, version: number): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)}</title><style>${CSS}</style></head><body>${body}
<script>let v=${version};setInterval(async()=>{try{const s=await (await fetch('/api/state')).json();document.body.dataset.running=s.running;const r=document.getElementById('running');if(r)r.hidden=!s.running;if(s.version!==v)location.reload()}catch{}},1500)</script></body></html>`;
}

function excerpt(root: string, file: string | undefined, line?: number): string {
  if (!file || !line || !existsSync(file)) return "";
  const lines = readFileSync(file, "utf8").split("\n");
  const from = Math.max(0, line - 4);
  return `<pre>${lines
    .slice(from, line + 3)
    .map((l, i) => {
      const no = from + i + 1;
      return `<span class="${no === line ? "hl" : ""}">${String(no).padStart(4)}  ${h(l)}</span>`;
    })
    .join("\n")}</pre><div class="n">${h(file.replace(root + "/", ""))}:${line}</div>`;
}

export function treePage(root: string, report: Report, f: Focus, files: Record<string, string>, version: number): string {
  const byDoc = new Map<string, CheckResult[]>();
  for (const r of report.results) byDoc.set(r.doc, [...(byDoc.get(r.doc) ?? []), r]);
  const all = worst(report.results.map((r) => r.status));
  const c = counts(report.results);
  const sel = (on: boolean) => (on ? ' class="sel"' : "");

  let tree = `<ul><li><details open><summary${sel(!f.doc)}>${icon(all)} <a href="/">docs</a> <span class="n">✗${c.fail} !${c.warn} ?${c.unknown} –${c.skipped} ✓${c.pass}</span></summary><ul>`;
  for (const [doc, rs] of byDoc) {
    const openDoc = !f.doc || f.doc === doc || rs.some((r) => r.status === "fail");
    tree += `<li><details${openDoc ? " open" : ""}><summary${sel(f.doc === doc && !f.axis)}>${icon(worst(rs.map((r) => r.status)))} <a href="/t/${enc(doc)}">${h(doc)}</a></summary><ul>`;
    for (const g of AXES) {
      const gs = rs.filter((r) => r.axis === g);
      if (!gs.length) continue;
      const gStatus = worst(gs.map((r) => r.status));
      const openG = (f.doc === doc && f.axis === g) || gStatus === "fail";
      tree += `<li><details${openG ? " open" : ""}><summary${sel(f.doc === doc && f.axis === g && !f.checkId)}>${icon(gStatus)} <a href="/t/${enc(doc)}/${g}">${h(m(`axis.${g}`))}</a></summary><ul>`;
      for (const r of gs) {
        const url = `/t/${enc(doc)}/${g}/${r.checkId}`;
        tree += `<li${sel(f.doc === doc && f.checkId === r.checkId && f.n === undefined)}>${icon(r.status)} <a href="${url}">${h(r.checkId)}</a> <span class="n">${h(m(`scope.${r.scope}`))}${r.findings.length ? ` · ${h(m("ui.count", { n: r.findings.length }))}` : ""}</span>`;
        if (r.findings.length)
          tree += `<ul>${r.findings.map((x, i) => `<li${sel(f.checkId === r.checkId && f.doc === doc && f.n === i + 1)}><a href="${url}/${i + 1}">${h(x.message.slice(0, 60))}</a></li>`).join("")}</ul>`;
        tree += "</li>";
      }
      tree += "</ul></details></li>";
    }
    tree += "</ul></details></li>";
  }
  tree += "</ul></details></li></ul>";

  // 詳細ペイン
  let detail = "";
  const scoped = report.results.filter((r) => (!f.doc || r.doc === f.doc) && (!f.axis || r.axis === f.axis) && (!f.checkId || r.checkId === f.checkId));
  if (f.checkId && f.n !== undefined) {
    const r = scoped[0];
    const x = r?.findings[f.n - 1];
    detail = x
      ? `<h3>${icon(r.status)} ${h(r.checkId)} #${f.n}</h3><div class="msg">${h(x.message)}</div><div class="n">${h(where(x))}</div>${excerpt(root, files[r.doc], x.loc.line)}`
      : `<p>${h(m("ui.not-found"))}</p>`;
  } else {
    const bad = scoped.filter((r) => r.status === "fail" || r.status === "warn" || r.status === "unknown");
    detail = `<h3>${h([f.doc, f.axis, f.checkId].filter(Boolean).join(" / ") || m("ui.all"))}</h3>`;
    if (f.doc && files[f.doc]) detail += `<p><a href="/p/${enc(f.doc)}">${h(m("ui.preview-link"))}</a></p>`;
    detail += bad.length
      ? bad
          .map(
            (r) =>
              `<h4>${icon(r.status)} <a href="/t/${enc(r.doc)}/${r.axis}/${r.checkId}">${h(r.doc)} / ${h(r.checkId)}</a></h4>${r.note ? `<div class="n">${h(r.note)}</div>` : ""}` +
              r.findings.map((x, i) => `<div class="msg"><a href="/t/${enc(r.doc)}/${r.axis}/${r.checkId}/${i + 1}">${h(x.message)}</a> <span class="n">${h(where(x))}</span></div>`).join(""),
          )
          .join("")
      : `<p>${h(m("ui.all-pass"))}</p>`;
  }

  const here = f.doc ? `/t/${[f.doc, f.axis, f.checkId].filter(Boolean).map((s) => s!.split("/").map(enc).join("/")).join("/")}` : "/";
  const btn = (label: string, q: string) => `<form method="post" action="/api/run?${q}&back=${enc(here)}"><button>${label}</button></form>`;
  const header = `<header><b>${icon(all)} doc-builder</b><span id="running" class="n" hidden>${h(m("ui.running"))}</span>${btn(m("ui.rerun"), "")}${btn("+render", "render=1")}${btn("+probe", "probe=1")}${btn("+online", "online=1")}${btn("+review", "review=1")}</header>`;
  return shell("doc-builder", `${header}<main><nav class="tree">${tree}</nav><section class="detail">${detail}</section></main>`, version);
}

export function previewPage(doc: string, lists: { themes: string[]; layouts: string[] }, cur: { theme?: string; layout?: string }, version: number): string {
  const sel = (name: "theme" | "layout", items: string[]) =>
    `<select onchange="const u=new URLSearchParams(location.search);this.value?u.set('${name}',this.value):u.delete('${name}');location.search=u">` +
    `<option value="">${h(m("ui.doc-default", { name }))}</option>${items.map((t) => `<option${t === cur[name] ? " selected" : ""}>${h(t)}</option>`).join("")}</select>`;
  const q = new URLSearchParams(Object.entries(cur).filter(([, v]) => v) as [string, string][]).toString();
  const body = `<header><b><a href="/t/${enc(doc)}">← ${h(doc)}</a></b>${sel("theme", lists.themes)}${sel("layout", lists.layouts)}</header><iframe src="/pdf/${enc(doc)}${q ? `?${q}` : ""}"></iframe>`;
  return shell(m("ui.preview-title", { doc }), body, version);
}
