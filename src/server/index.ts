import { existsSync, watch } from "node:fs";
import { join } from "node:path";
import { buildAll } from "../build";
import type { RunOptions } from "../checks/define";
import { loadConfig } from "../config";
import { discover, docName, loadDoc, runAll } from "../runner/run";
import { listLayouts } from "../page/resolve";
import { listThemes } from "../theme/resolve";
import type { Report } from "../types";
import { m, useMessages } from "../messages";
import { parseFocus, previewPage, treePage } from "./html";
import { registerSuperset, urlEntries, writeUrls } from "./urls";

export interface ServeOptions {
  port?: number;
  register?: boolean;
  supersetFile?: string;
  watch?: boolean;
  runOptions?: RunOptions;
}

export async function startServer(root: string, opts: ServeOptions = {}) {
  const config = loadConfig(root);
  useMessages(root);
  let report: Report = await runAll(root, opts.runOptions);
  let version = 1;
  let running = false;
  const files = () => Object.fromEntries(discover(root, config).map((f) => [docName(f), f]));

  const rerun = async (o: RunOptions = {}) => {
    if (running) return;
    running = true;
    try {
      report = await runAll(root, { ...opts.runOptions, ...o });
      version++;
    } finally {
      running = false;
    }
  };

  const html = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8" } });

  const server = Bun.serve({
    port: opts.port ?? config.port,
    idleTimeout: 120,
    async fetch(req) {
      const url = new URL(req.url);
      const p = url.pathname;
      if (p === "/api/state") return Response.json({ version, running });
      if (p === "/api/report") return Response.json(report);
      if (p === "/api/run" && req.method === "POST") {
        void rerun({ online: url.searchParams.has("online"), review: url.searchParams.has("review"), probe: url.searchParams.has("probe"), render: url.searchParams.has("render") });
        return Response.redirect(url.searchParams.get("back") ?? "/", 303);
      }
      if (p === "/" || p.startsWith("/t/")) return html(treePage(root, report, parseFocus(p), files(), version));
      const route = p.match(/^\/(p|pdf)\/([^/]+)$/);
      if (route) {
        const doc = decodeURIComponent(route[2]);
        const file = files()[doc];
        if (!file) return html(m("ui.doc-not-found"), 404);
        const theme = url.searchParams.get("theme") || undefined;
        const layout = url.searchParams.get("layout") || undefined;
        if (route[1] === "p") return html(previewPage(doc, { themes: listThemes(root), layouts: listLayouts(root) }, { theme, layout }, version));
        const res = await buildAll(root, { paths: [doc], themes: theme ? [theme] : undefined, layouts: layout ? [layout] : undefined, formats: ["pdf"] });
        const l = loadDoc(root, config, file, { theme, layout });
        const pdf = join(root, "dist", l.theme.id, l.layout.id, `${doc}.pdf`);
        if (res.errors.length || !existsSync(pdf))
          return new Response([...res.errors, ...res.warnings].join("\n") || m("ui.pdf-failed"), { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
        return new Response(Bun.file(pdf), { headers: { "content-type": "application/pdf" } });
      }
      return html(m("ui.not-found"), 404);
    },
  });

  const base = `http://localhost:${server.port}`;
  const entries = urlEntries(base, report.docs);
  const urlsFile = writeUrls(root, entries);
  if (opts.register) registerSuperset(entries, opts.supersetFile);

  const watchers: ReturnType<typeof watch>[] = [];
  if (opts.watch) {
    let timer: Timer | undefined;
    for (const d of [config.contentDir, "themes", "reviews", "checks"].map((d) => join(root, d)).filter(existsSync))
      watchers.push(
        watch(d, { recursive: true }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => void rerun(), 300);
        }),
      );
  }
  return {
    server,
    base,
    urlsFile,
    stop() {
      watchers.forEach((w) => w.close());
      server.stop(true);
    },
  };
}
