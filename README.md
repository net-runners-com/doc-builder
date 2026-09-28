# doc-test-runner

提案書・手順書・サービス説明書・利用規約を YAML で書き、Unity Test Runner のように検証してから `.md` / `.pdf` にビルドする。

設計: `docs/superpowers/specs/2026-09-28-doc-test-runner-design.md`（追補 A: fact と実機検証、B: レイアウト、C: 表記スタイル・ハードコードなし・キャッシュなし）

## 必要なもの

```sh
brew install bun d2 typst   # d2: 図、typst: PDF
bun install
# レビュワーを使う場合は claude CLI（Claude Code）
```

足りないツールがあっても全体は止まらず、該当チェックが `?`（判定不能）になる。

## 使い方

```sh
bun run test                            # 全文書を検証（不合格があれば exit 1）
bun run test proposal --review          # Claude レビューも実行
bun run test --probe                    # fact を実機で検証
bun run test --probe --update-snapshots # capture の出力を承認
bun run test --online                   # 出典 URL と引用文をネットで確認
bun run test --json                     # 結果を JSON で出力
bun run build --theme default,sakura --layout standard,formal --wording casual
bun run serve                           # http://localhost:4600 のツリー UI
bun run serve --register-superset       # URL 一覧を ~/.superset/hosted-urls.json にも登録
bun test                                # ランナー自体のテスト
```

- `--review` `--probe` `--online` は付けたときだけ実行する。前回の結果は保存も流用もしない（付けなければ `–` 未実行）。
- `serve` は起動時に `.test-runner/urls.json`（`[{title, url}]`）を書き出す。どの ADE からもこの一覧で各テスト・プレビューを開ける。

## 3 つの切り替え軸

| 軸 | ファイル | 中身 | 指定 |
|----|---------|------|------|
| テーマ | `themes/*.yaml` | 色・フォント・用紙・文字組み・透かし | 文書 `theme:` / `--theme` |
| レイアウト | `layouts/*.yaml` | 部品の配置（表紙・前付け・後付け・ヘッダー・フッター） | 文書 `layout:` / `--layout` |
| 表記スタイル | `wordings/*.json` | 番号書式・固定の見出しやラベルの言い回し（ID で参照） | 文書 `wording:` / `--wording`、部分上書きは文書 `strings:` |

どれも `extends` で継承できる。値はすべてファイル側にあり、コードに既定値を持たない（`src/wording/default.json` と `src/defaults/runner.json` が組み込みの定義元）。

## レイアウトと部品

レイアウトは HTML のように部品を入れ子にして書く。

```yaml
# layouts/formal.yaml
extends: standard
cover:
  - row: { justify: space-between, children: [company, { confidential: { text: 社外秘 } }] }
  - spacer: 22%
  - title: { size: 28pt }
  - meta-table: { fields: [number, client, version, updated, owner] }
  - spacer: fill
  - row: { justify: end, children: [{ approval: { roles: [承認, 確認, 作成] } }] }
front: [toc, { spacer: 10mm }, history, pagebreak]
header:
  - row: { justify: space-between, children: [company-mini, { confidential: { text: 社外秘 } }] }
```

部品は `components/<名前>/` に置く（組み込みも自作も同じ扱い）。

| ファイル | 役割 |
|---------|------|
| `component.yaml` | 説明・置ける区画（regions）・子を持てるか（container）・設定の JSON Schema（props）・既定値（defaults）・必要なデータ（needs） |
| `render.typ` | `#let render(props, ctx, children) = ...`（PDF） |
| `md.ts` | `export default (props, ctx, children) => string[]`（Markdown。任意） |

同梱: row / column / grid / box / spacer / pagebreak / text / title / meta-table / company / company-mini / approval / history / toc / page-number / confidential。会社情報は `company.yaml`、承認欄・改訂履歴は文書の `meta.approvals` / `meta.history`。

## ディレクトリ

| パス | 中身 |
|------|------|
| `content/*.yaml` | 文書ソース（`kind: terms / procedure / proposal / guide`） |
| `facts.yaml` `facts/snapshots/` | 資料間で共有する事実と、実機検証の確認コマンド・承認済み出力 |
| `themes/` `layouts/` `components/` `wordings/` | 見た目・配置・部品・表記スタイル |
| `reviews/*.yaml` `reviews/_prompt.md` | レビュー観点と指示文 |
| `checks/*.ts` | 自作チェック（`export default defineCheck({...})`） |
| `company.yaml` `runner.yaml` | 会社情報、ランナー設定（`src/defaults/runner.json` を上書き） |
| `samples/` | 既存 Markdown 版のサンプルと欠陥の正解表 |

`content/` の文書には欠陥を意図的に仕込んである（各ファイル先頭のコメントと `samples/README.md` を参照）。

## 本文の埋め込み記法

| 記法 | 展開 |
|------|------|
| `{{ref:ID}}` | 第4条 / 手順3 / 表1 / 図2 / 「2. 提案内容」（書式は表記スタイル） |
| `{{cite:ID}}` | [1]（文末に出典一覧） |
| `{{img:ID}}` `{{fig:ID}}` | 画像・図の配置 |
| `{{fact:ID}}` `{{capture:ID}}` | 事実の値・主張、実機出力のコードブロック |
| `{{calc:sum(costs, unit_price*qty)}}` | 24,000 |
| `{{field}}` | 同じブロックの値（例 `{{notice_days}}`） |

番号は手書きしない。自動で採番されるので欠番は起きない。
