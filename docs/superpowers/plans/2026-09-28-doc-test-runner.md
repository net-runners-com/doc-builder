# doc-test-runner Implementation Plan

> 実行方式: Native（メインエージェントが直接実装）。各タスクは TDD（失敗テスト → 実装 → 通過 → コミット）。

**Goal:** YAML 文書ソースを検証（schema / rules / online / review）し、md / pdf にビルドし、ツリー UI と URL 一覧で結果を見せる。

**Architecture:** YAML → 中間表現 `Doc`（採番・埋め込み展開済み）→ チェック関数群 → `CheckResult[]`。ビルドは `Doc` → 中立ノード列 `Layout` → md / Typst の 2 エミッタ。UI は Bun.serve のサーバーレンダリング HTML。

**Tech Stack:** Bun 1.3, TypeScript, yaml 2.9, ajv 8, vega 6 / vega-lite 6, @resvg/resvg-js, d2 CLI, typst CLI, claude CLI。

**Spec:** `docs/superpowers/specs/2026-09-28-doc-test-runner-design.md`

## Global Constraints

- ランタイムは Bun。Python・Chromium を依存に入れない。
- 結果状態は `pass | fail | warn | unknown | skipped` の 5 種。
- exit code: error の fail ≥1 → 1。`--strict` で warn / unknown も 1。
- 外部ツール欠如は `unknown`（全体停止しない）。
- `~/.superset/hosted-urls.json` は `--register-superset` 時のみ書く。
- レビュワーは同梱 settings で書き込み系ツールを deny。claudehac に依存しない。
- 既定ポート 4600、閲覧日期限既定 365 日。

## Review Focus

- 空ファイル・YAML 構文エラー・ルートが配列 → schema/valid fail、例外で落ちない（Task 4）
- 避ける語が定義語の部分文字列（「ユーザ」⊂「ユーザー」）→ 誤検出しない（Task 6）
- 出典サイトが 401/403/429 を返す → fail ではなく unknown（Task 13）
- 異なる種類で ID 重複（条 ID と表 ID が同じ）→ ref/resolve fail（Task 4）
- テーマの extends 循環・欠落 → theme/valid fail、文書チェックは既定採番で続行（Task 9）

## File Structure

```
src/types.ts            共有型
src/errors.ts           Unknown / Skip / ToolMissing
src/config.ts           runner.yaml 読み込み
src/parse/yaml.ts       YAML + 行番号
src/parse/calc.ts       {{calc:}} 評価器
src/parse/doc.ts        buildDoc: 検証・採番・テキスト収集・展開
src/schema/*.ts         JSON Schema（common / kinds / theme）
src/checks/define.ts    Check 定義・ctx
src/checks/builtin/*.ts 組み込みチェック
src/theme/*.ts          テーマ読み込み・解決
src/render/*.ts         d2 / chart / png
src/build/*.ts          layout / md / typst / index
src/review/*.ts         観点・claude 呼び出し・settings.json
src/runner/*.ts         runAll・集約・テキスト出力
src/server/*.ts         UI・urls.json
src/cli.ts
tests/**                bun test
content/ themes/ reviews/ runner.yaml
```

## Tasks

1. **Scaffold + 型 + config + YAML 行番号** — `loadYaml(src) → {data, lineOf(ptr), error?}`。テスト: ネスト要素の行番号、構文エラー時の error.line。
2. **Schema** — kind 別 JSON Schema、`validateDoc(data) → string[]`（`/path: message`）。テスト: 各 kind の最小正常例、procedure の expected 欠落、未知 kind。
3. **calc** — `evalCalc(expr, data, row?) → number`（四則・括弧・単項マイナス・`sum(list, expr)`・`count(list)`）。テスト: 合計、未定義識別子で例外、ゼロ除算で例外。
4. **buildDoc** — `buildDoc(path, src, numbering) → Doc`。defs・採番（条/手順/節/表/図/出典）・テキスト収集・展開・buildErrors（schema/valid, ref/resolve, calc/eval）。テスト: 採番が連番、未定義 ref、ID 重複、図の配置順採番、cite 順、フィールド展開、空ファイル。
5. **チェック基盤 + runner + CLI test** — `defineCheck`、`runAll(root, opts) → Report`、schema 群、skip 伝播、`exitCode`、テキスト出力、`bun run test`。テスト: スキーマ違反で他 group が skipped、例外 → unknown、exit code。
6. **テキスト系ルール** — glossary/avoid、text/placeholder、text/heading-in-body。
7. **ファイル・定義系ルール** — link/local、image/alt、figure/caption、unused/defs、source/stale。
8. **kind 別ルール** — terms/notice-period、schedule/order。
9. **テーマ** — FALLBACK→default→extends→文書→CLI の解決、同梱 3 テーマ、theme/valid（@themes）、theme/contrast。runner が文書テーマの採番を使う。
10. **描画** — renderD2、renderChart、figure/render。
11. **layout + md ビルド + CLI build**。スナップショット。
12. **Typst PDF**（template.typ、ヘッダー/フッター/表紙/目次/透かし）。
13. **online** — fetch キャッシュ、online/url、online/quote。
14. **review** — 観点読み込み、claude 呼び出し（スタブ注入）、キャッシュ、再試行、PNG 添付。
15. **サーバー** — ツリー、固有 URL、再実行、プレビュー、urls.json、--register-superset、watch。
16. **content/ 欠陥入り YAML + e2e** — spec §11 の期待を検証。README。
