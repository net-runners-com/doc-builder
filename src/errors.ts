/** チェック結果を unknown（判定不能）にする */
export class Unknown extends Error {}
/** チェック結果を skipped（未実行）にする */
export class Skip extends Error {}
export class ToolMissing extends Unknown {
  constructor(tool: string, hint: string) {
    super(`${tool} が見つかりません（${hint}）`);
  }
}
export function requireTool(tool: string, hint: string): string {
  const p = Bun.which(tool);
  if (!p) throw new ToolMissing(tool, hint);
  return p;
}
