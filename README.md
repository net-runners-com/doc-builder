# doc-test-runner

提案書・手順書・サービス説明書・利用規約を YAML で書き、Unity Test Runner のように検証してから `.md` / `.pdf` にビルドする。

設計: `docs/superpowers/specs/2026-09-28-doc-test-runner-design.md`

## 必要なもの

```sh
brew install bun d2 typst   # d2: 図、typst: PDF
bun install
# レビュワーを使う場合は claude CLI（Claude Code）
```

足りないツールがあっても全体は止まらず、該当チェックが `?`（判定不能）になる。

## 使い方

```sh
bun run test                         # 全文書を検証（不合格があれば exit 1）
bun run test proposal --review       # Claude レビューも実行（結果はキャッシュ）
bun run test --online                # 出典 URL と引用文をネットで確認
bun run test --json                  # 結果を JSON で出力
bun run build --theme default,sakura # dist/<theme>/ に md と pdf
bun run serve                        # http://localhost:4600 のツリー UI
bun run serve --register-superset    # URL 一覧を ~/.superset/hosted-urls.json にも登録
bun test                             # ランナー自体のテスト
```

`serve` は起動時に `.test-runner/urls.json`（`[{title, url}]`）を書き出す。どの ADE からもこの一覧で各テスト・プレビューを開ける。

## ディレクトリ

| パス | 中身 |
|------|------|
| `content/*.yaml` | 文書ソース（`kind: terms / procedure / proposal / guide`） |
| `themes/*.yaml` | レイアウト（`extends` で継承。同梱: default, dark-green, sakura） |
| `reviews/*.yaml` | レビュー観点（`_common.yaml` は全種類共通） |
| `checks/*.ts` | 自作チェック（`export default defineCheck({...})`） |
| `samples/` | 既存 Markdown 版のサンプルと欠陥の正解表 |

`content/` の文書には欠陥を意図的に仕込んである（各ファイル先頭のコメントと `samples/README.md` を参照）。

## 本文の埋め込み記法

| 記法 | 展開 |
|------|------|
| `{{ref:ID}}` | 第4条 / 手順3 / 表1 / 図2 / 「2. 提案内容」 |
| `{{cite:ID}}` | [1]（文末に出典一覧） |
| `{{img:ID}}` `{{fig:ID}}` | 画像・図の配置 |
| `{{calc:sum(costs, unit_price*qty)}}` | 24,000 |
| `{{field}}` | 同じブロックの値（例 `{{notice_days}}`） |

番号は手書きしない。自動で採番されるので欠番は起きない。

## 自作チェック

```ts
// checks/no-exclamation.ts
import { defineCheck } from "../src/checks/define";
export default defineCheck({
  id: "style/no-exclamation",
  group: "rules",
  kinds: ["*"],
  severity: "warn",
  run: (doc, ctx) => doc.texts.filter((t) => t.raw.includes("！")).map((t) => ctx.fail("感嘆符", { blockId: t.blockId, line: t.line })),
});
```
