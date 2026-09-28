import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export interface Config {
  root: string;
  contentDir: string;
  defaultTheme: string;
  review: { model: string };
  sourceMaxAgeDays: number;
  port: number;
}

const DEFAULTS = {
  contentDir: "content",
  defaultTheme: "default",
  review: { model: "sonnet" },
  sourceMaxAgeDays: 365,
  port: 4600,
};

export function loadConfig(root: string): Config {
  const p = join(root, "runner.yaml");
  const user = existsSync(p) ? (parse(readFileSync(p, "utf8")) ?? {}) : {};
  return { ...DEFAULTS, ...user, root, review: { ...DEFAULTS.review, ...(user.review ?? {}) } };
}

export const cacheDir = (root: string) => join(root, ".test-runner", "cache");
