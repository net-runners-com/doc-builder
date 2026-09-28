import { parseArgs } from "node:util";
import { buildAll } from "./build";
import { exitCode, formatText } from "./runner/format";
import { runAll } from "./runner/run";

const { values: v, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    online: { type: "boolean", default: false },
    review: { type: "boolean", default: false },
    strict: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    theme: { type: "string" },
    port: { type: "string" },
    "register-superset": { type: "boolean", default: false },
  },
});
const [cmd, ...paths] = positionals;
const root = process.cwd();

switch (cmd) {
  case "test": {
    const report = await runAll(root, { online: v.online, review: v.review, theme: v.theme, paths });
    console.log(v.json ? JSON.stringify(report, null, 2) : formatText(report));
    process.exit(exitCode(report, v.strict));
  }
  case "build": {
    const res = await buildAll(root, { paths, themes: v.theme?.split(",") });
    for (const o of res.outputs) console.log(`✓ ${o}`);
    for (const w of res.warnings) console.log(`! ${w}`);
    for (const e of res.errors) console.log(`✗ ${e}`);
    process.exit(res.errors.length ? 1 : 0);
  }
  default:
    console.error("usage: bun src/cli.ts <test|build|serve> [paths...] [--online] [--review] [--theme a,b] [--strict] [--json]");
    process.exit(2);
}
