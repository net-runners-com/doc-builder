import { isNode, LineCounter, parseDocument } from "yaml";

export interface Loaded {
  data: any;
  lineOf(ptr: string): number | undefined;
  error?: { message: string; line?: number };
}

const toPath = (ptr: string) =>
  ptr
    .split("/")
    .slice(1)
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s.replace(/~1/g, "/").replace(/~0/g, "~")));

export function loadYaml(src: string): Loaded {
  const lc = new LineCounter();
  const d = parseDocument(src, { lineCounter: lc, prettyErrors: false });
  const lineOf = (ptr: string) => {
    let path = toPath(ptr);
    while (true) {
      const n: any = path.length ? d.getIn(path, true) : d.contents;
      if (isNode(n) && n.range) return lc.linePos(n.range[0]).line;
      if (!path.length) return undefined;
      path = path.slice(0, -1);
    }
  };
  if (d.errors.length) {
    const e = d.errors[0];
    return { data: undefined, lineOf, error: { message: e.message.split("\n")[0], line: lc.linePos(e.pos[0]).line } };
  }
  return { data: d.toJS(), lineOf };
}
