import { parseArgs } from "node:util";
import { exitCode, formatText } from "./runner/format";
import { runAll } from "./runner/run";
import "./setup";

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
  default:
    console.error("usage: bun src/cli.ts <test|build|serve> [paths...] [--online] [--review] [--theme a,b] [--strict] [--json]");
    process.exit(2);
}
