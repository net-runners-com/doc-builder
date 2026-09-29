# doc-builder 設計書

- 日付: 2026-09-28
- 状態: 設計承認済み（実装計画前）

## 1. 目的

提案書・手順書・サービス説明書・利用規約などの文書を、Unity Test Runner のように「テスト一覧 → 実行 → 合否」で検証する。

- 文書は構造化ソース（YAML）で書き、そこから `.md` / `.pdf` をビルドする。
- 検証は 2 段: **ルール判定**（決定的・無料）と **レビュワー**（Claude による文意判定・読み取り専用）。
- 結果はローカル Web UI のツリーで見られ、各テストに固有 URL がある。URL 一覧を書き出し、どの ADE からでも開ける。

### 成功基準

- `samples/README.md` の正解 15 件が、本設計の該当手段（構造的排除・ビルドエラー・ルール・レビュワー）で扱われる（§11 の対応表）。
- `bun run test` が CI で使える（不合格で exit 1）。
- `bun run serve` でツリー UI が開き、`.doc-builder/urls.json` が出力される。

### 前提

- 書き手はエンジニア本人と Claude。YAML を直接書く。
- 非エンジニア向けの Word / GUI 編集は対象外。

## 2. 技術選定

| 用途 | 採用 | 理由 |
|------|------|------|
| ランタイム | Bun + TypeScript | 軽量、TS 直実行、HTTP サーバーとテスト機能内蔵 |
| スキーマ | JSON Schema（ajv） | 中間表現の検証。エディタ補完にも使える |
| YAML | `yaml` パッケージ | 位置情報（行番号）を取れる |
| PDF | Typst CLI | 単体バイナリ、日本語組版に強い |
| 図（diagram） | D2 CLI | 単体バイナリで SVG 出力。ブラウザ不要 |
| グラフ（chart） | Vega-Lite（`vega` + `vega-lite`） | Bun 上で SVG 出力。ブラウザ不要 |
| レビュワー | `claude -p`（読み取り専用設定を同梱） | 追加 API キー不要。書き込み不可を設定で保証 |

Vitest は使わない（テスト単位の固有 URL を持てないため）。ランナーは自作の小さな核とする。

## 3. 全体の流れ

```
content/*.yaml ──parse──▶ 中間表現(JSON) ──schema検証──▶ checks(rules/online/review) ──▶ 結果
      │                         │
      │                         └──build──▶ dist/<theme>/<doc>.md / .pdf
      └── themes/*.yaml（レイアウト）
```

- 中間表現（IR）が唯一の判定対象。ルールもレビュワーも IR を読む。
- 番号（条・手順・図・脚注）は IR 生成時に自動採番する。ソースに番号を書かない。

## 4. ソース形式（YAML）

### 4.1 共通

```yaml
kind: terms | procedure | proposal | guide
theme: sakura                 # 任意。§7
meta:
  title: 必須
  version: 必須（semver）
  updated: 必須（日付）
  owner: 必須
glossary:
  - term: 利用者
    avoid: [ユーザー, ユーザ]
sources: [...]                # §4.3
images: [...]                 # §4.4
figures: [...]                # §4.5
```

本文中の埋め込み記法（これ以外は使えない）:

| 記法 | 意味 | 未定義時 |
|------|------|----------|
| `{{ref:ID}}` | 条・手順・図・表などへの参照。「第4条」「手順3」「図2」に展開 | ビルドエラー |
| `{{cite:ID}}` | 出典。脚注番号 `[1]` に展開し文末に出典一覧 | ビルドエラー |
| `{{img:ID}}` / `{{fig:ID}}` | 画像・図の配置 | ビルドエラー |
| `{{calc:式}}` | ビルド時計算（`sum(list, expr)` など四則演算と集計のみ） | ビルドエラー |
| `{{<field>}}` | 同じブロック内の構造化値の埋め込み（例 `{{notice_days}}`） | ビルドエラー |

ID はファイル内で一意。重複はビルドエラー。

### 4.2 種類別の本文

```yaml
# kind: terms
articles:
  - id: fees
    title: 料金および支払方法
    clauses: [文字列, ...]
  - id: change
    title: 規約の変更
    notice_days: 30          # 構造化値。日付整合ルールで使う
    clauses: [...]
meta.effective: 必須

# kind: procedure
meta.audience, meta.estimated_time: 必須
purpose: 文字列（必須）
prerequisites: [文字列]
steps:
  - id: plan
    title: 文字列
    actions: [文字列]（1 件以上）
    expected: 文字列（必須）
troubleshooting: [{ symptom, action }]

# kind: proposal
meta.client: 必須
sections: [{ id, title, body }]
tables:
  - id: effects
    columns: [item, before, after]
    rows: [...]
costs: [{ id, item, unit_price, qty }]
total: "{{calc:sum(costs, unit_price*qty)}}"
schedule: [{ date: 日付, task }]

# kind: guide
sections: [{ id, title, body, children? }]
tables: [...]
```

`body` は Markdown のインライン記法（強調・リンク・箇条書き）を許す。見出しは構造側で持つので `body` 内の見出しは不可（ルールで検出）。

### 4.3 出典・引用

```yaml
sources:
  - id: mhlw-2025
    url: https://...
    title: 文字列
    accessed: 日付（必須）
# 本文ブロックとして
- quote:
    source: mhlw-2025
    text: 逐語引用
```

### 4.4 画像

```yaml
images:
  - id: dashboard
    path: ./assets/dashboard.png   # ソース YAML からの相対パス
    alt: 必須
    caption: "図{{n}} ..."          # 任意。{{n}} は図番号（図と画像で通し番号）
```

### 4.5 図

```yaml
figures:
  - id: signup-flow
    type: diagram
    caption: 必須
    source: |                      # D2 記法
      signup -> verify -> plan
  - id: cost-chart
    type: chart
    caption: 必須
    chart: bar | line | pie
    data: "{{ref:effects}}"        # tables の ID を参照
    x: item
    y: [before, after]
```

## 5. チェック

### 5.1 定義方法

```ts
export default defineCheck({
  id: "glossary/avoid",
  group: "rules",               // schema | rules | online | review
  kinds: ["*"],
  severity: "error",            // error | warn
  run(doc, ctx) { return [...ctx.fail(msg, loc)] },
});
```

- `checks/*.ts`（ユーザー定義）と `src/checks/*.ts`（組み込み）を自動読み込み。
- 結果の状態: `pass` / `fail` / `warn` / `unknown`（判定不能）/ `skipped`（未実行）。
- `loc` = `{ doc, blockId?, line? }`。line は YAML の行。

### 5.2 組み込みチェック一覧

| id | group | severity | 内容 |
|----|-------|----------|------|
| schema/valid | schema | error | JSON Schema 違反 |
| ref/resolve | schema | error | 未定義 ID の ref / cite / img / fig、ID 重複 |
| calc/eval | schema | error | 計算式の評価失敗 |
| glossary/avoid | rules | error | 定義語の代わりに `avoid` の語を使用 |
| text/placeholder | rules | error | `TBD` `TODO` `XXX` `〇〇` `未定` の残存 |
| text/heading-in-body | rules | error | body 内の Markdown 見出し |
| link/local | rules | error | 相対リンク・画像パスのファイル不在 |
| image/alt | rules | error | alt が空 |
| figure/caption | rules | error | キャプション欠落 |
| figure/render | rules | error | D2 構文エラー、chart の参照表・列不在 |
| unused/defs | rules | warn | 未参照の出典・画像・図 |
| source/stale | rules | warn | accessed が `runner.yaml` の期限（既定 365 日）超過 |
| terms/notice-period | rules | error | `effective - updated` < `notice_days`（kind: terms） |
| schedule/order | rules | error | schedule の日付が昇順でない（kind: proposal） |
| theme/valid | rules | error | テーマのスキーマ違反、ロゴ不在、フォント未インストール |
| theme/contrast | rules | warn | text/背景・primary/背景 が WCAG AA 未満（全テーマ対象） |
| online/url | online | error | 出典 URL が 4xx/5xx |
| online/quote | online | error | 引用文がページ本文に存在しない（空白・全半角・改行を正規化して照合） |
| review/* | review | error | §6 の観点ごと |

`online` は `--online` 指定時のみ実行。取得結果は `.doc-builder/cache/http/` に保存し、未指定時はキャッシュがあれば使い、なければ `skipped`。取得失敗（ボット遮断・タイムアウト）は `unknown`。

## 6. レビュワー

```yaml
# reviews/terms.yaml
kind: terms
aspects:
  - id: unfair-clause
    ask: 利用者に一方的に不利な条項はないか
  - id: undefined-term
    ask: 定義されていない専門用語を使っていないか
```

- 共通観点（`reviews/_common.yaml`）: 数値・断定表現に出典があるか、曖昧な定量表現（「大幅に」など）がないか。
- 観点 1 件ごとに `claude -p` を 1 回実行。入力: IR（JSON）+ 観点 + 出力スキーマ。chart / diagram を含む場合は描画 SVG→PNG も添付し、本文との矛盾を確認させる。
- 出力: `{ verdict: pass|fail, findings: [{ blockId, reason }] }`。JSON 解析失敗時は 1 回再試行、再失敗で `unknown`。
- 同梱設定 `src/review/settings.json`: `permissions.defaultMode: plan`、`deny: Edit/Write/MultiEdit/NotebookEdit/Bash`。`claude -p --settings <同梱> --output-format json` で呼ぶ。claudehac には依存しない。
- キャッシュ: キー = hash(IR の対象部分 + 観点 + モデル名)。`.doc-builder/cache/review/`。
- 実行条件: `--review` 指定時のみ実行。未指定時はキャッシュがあれば表示、なければ `skipped`。
- モデルは `runner.yaml` の `review.model`。

## 7. テーマ（レイアウト）

```yaml
# themes/sakura.yaml
name: Sakura
extends: default
page: { size: A4, margin: { top: 25mm, bottom: 20mm, x: 20mm } }
colors: { primary, accent, text, background }
fonts: { body, heading, mono }
cover: { enabled, logo, fields: [title, client, updated, owner] }
toc: { enabled, depth }
header: { left, center, right }        # {{meta.*}} を展開
footer: { left, center, right, start_at: cover|toc|body }   # {{page}} {{pages}}
numbering: { terms: "第{n}条", procedure: "手順{n}", heading: "1.1" }
watermark: { when: "meta.version < 1.0", text: DRAFT }
template: ./custom.typ                 # 任意。Typst テンプレート差し替え
```

- 同梱テーマ: `default`, `dark-green`, `sakura`。
- 解決順（後勝ち）: `default` → `extends` 連鎖 → 文書の `theme:`（名前またはインライン上書き）→ CLI `--theme`。
- `--theme a,b` で複数テーマを一括ビルド → `dist/<theme>/`。
- Markdown 出力が反映するのは `toc` / `numbering` / `cover.fields` のみ。反映しない項目はビルドログに 1 行出す。
- `watermark.when` は `meta.version` の比較のみサポート。

## 8. ビルド出力

- `dist/<theme>/<doc>.md`: 図・グラフは `dist/<theme>/assets/<doc>-<id>.svg` として埋め込み。
- `dist/<theme>/<doc>.pdf`: IR → Typst ソース生成 → `typst compile`。
- ビルドエラーのある文書は出力しない（前回の出力は残す）。

## 9. ランナー UI と CLI

### CLI

```
bun run test [paths...] [--online] [--review] [--theme a,b] [--strict] [--json]
bun run build [paths...] [--theme a,b]
bun run serve [--port 4600] [--register-superset]
```

- exit code: `error` の fail が 1 件以上 → 1。`warn` / `unknown` は 0（`--strict` で 1）。
- `--json`: 結果を JSON で標準出力（ADE やエージェント向け）。

### Web UI（serve）

- ツリー: `文書 → group(schema/rules/online/review) → 個別結果`。各ノードに ✓ / ✗ / ! / ? / – と件数。
- 固有 URL: `/t/<doc>`、`/t/<doc>/<group>`、`/t/<doc>/<group>/<checkId>[/<n>]`。個別結果は YAML の該当行を抜粋表示。
- ボタン: 全体再実行、ノード単位再実行、`--review` / `--online` 付き再実行。
- プレビュー: `/p/<doc>?theme=<name>` で PDF を表示、テーマ切替メニュー。
- ファイル監視: `content/` `themes/` `reviews/` `checks/` の変更で自動再実行（review / online は除く）。
- 起動時に `.doc-builder/urls.json` を `[{ title, url }]` 形式で書き出す（全体・文書ごと・プレビュー）。
- `--register-superset`: 同じ項目を `~/.superset/hosted-urls.json` に追記（既存項目は title で重複排除、他の項目は変更しない）。既定では書かない。

## 10. エラー処理

| 状況 | 挙動 |
|------|------|
| YAML 解析失敗・スキーマ違反 | その文書は schema group が fail、以降の group は `skipped`。他文書は続行 |
| d2 / typst / claude が未インストール | 該当チェック・ビルドを `unknown`、インストール方法を表示。全体は続行 |
| レビュワー出力が不正 | 1 回再試行 → `unknown` |
| ネットワーク失敗 | `unknown` |
| ユーザー定義チェックが例外 | そのチェックを `unknown`、スタックを UI に表示 |

## 11. サンプル正解との対応

`samples/*.md` は既存 Markdown。**Markdown 取り込み（import）は本スコープ外**。代わりに `content/` に同内容の YAML 版を作り、欠陥を YAML 上で再現して検証する。

| 正解 | YAML 版での扱い | 検出手段 |
|------|------------------|----------|
| T1, P1（欠番） | 自動採番で発生しない | —（再現不可を確認するテスト） |
| R1（合計不一致） | `calc` で発生しない | — |
| T2（未定義条参照） | `{{ref:refund}}` 未定義 | ref/resolve |
| P2（期待結果なし） | `expected` 欠落 | schema/valid |
| S1, T3（表記ゆれ・定義語違反） | glossary | glossary/avoid |
| S2（TBD） | | text/placeholder |
| S3, P3（リンク切れ） | | link/local |
| T4（告知期間） | | terms/notice-period |
| R2（時系列逆転） | | schedule/order |
| T5（不利条項） | | review/unfair-clause |
| R3（曖昧な定量） | | review/_common |
| R4（次のステップ不足） | | review/proposal の観点 |

## 12. ディレクトリ構成

```
content/            文書ソース *.yaml、assets/
themes/             default.yaml dark-green.yaml sakura.yaml
reviews/            _common.yaml terms.yaml procedure.yaml proposal.yaml guide.yaml
checks/             ユーザー定義チェック
src/
  parse/            YAML → IR（位置情報つき）、採番、埋め込み展開
  schema/           JSON Schema
  checks/           組み込みチェック
  review/           claude 呼び出し、settings.json、キャッシュ
  render/           d2, vega-lite
  build/            md, typst
  runner/           実行・結果集約
  server/           Web UI、urls.json
  cli.ts
samples/            既存 Markdown サンプルと正解表（参考資料）
dist/               ビルド出力（git 管理外）
.doc-builder/       キャッシュ、urls.json（git 管理外）
runner.yaml         既定テーマ、review.model、source 期限日数、port
```

## 13. 自己テスト

- `bun test`: 各組み込みチェックに合格例・不合格例のフィクスチャ。
- `content/` の欠陥入り YAML 版に対し、§11 の期待結果（レビュー以外）を検証。
- レビュワーは `claude` をスタブ化したテストでプロトコル（入力組立・JSON 解析・再試行・キャッシュ）のみ検証。実モデルの判定精度は手動確認。
- ビルド出力（md、Typst ソース）はスナップショット比較。PDF のバイナリ比較はしない。

## 14. スコープ外

- Markdown / Word からの取り込み
- 見た目の回帰テスト（PDF 画像差分）
- 非エンジニア向け編集 UI
- docx 出力

---

## 追補 A: 事実（fact）と実機検証（2026-09-28）

背景: 実運用のマニュアル検査で出た指摘の大半は文章の質ではなく「事実が実機・他資料と合わない」だった（SSH 設定、環境変数、タスク一覧、資料間の件数不一致、古いログ例）。事実を 1 か所で定義し、実機で検証できるようにする。

### A.1 事実の定義

- 場所: `facts.yaml`（プロジェクト共通）と文書内 `facts:`（その文書専用）。ID はプロジェクト全体で一意（重複は ref/resolve）。
- 種類:
  - **値**: `value`（文字列・数値・文字列配列）。本文 `{{fact:ID}}` で値に展開（配列は「、」区切り）。
  - **主張**: `claim`（文）。本文 `{{fact:ID}}` で claim に展開。`value` と `claim` の両方がある場合は claim を優先。
  - **出力取り込み**: `capture`。本文 `{{capture:ID}}` はコードブロックとして配置（段落単独で書く）。
- `verify`（任意）: 実機での確認方法。
  ```yaml
  verify:
    shell: powershell | pwsh | sh | bash   # 省略時: Windows は powershell、それ以外は sh
    run: <コマンド>
    timeout: 30s                           # 省略時 30s
    expect:                                # すべて AND。1 つ以上必須
      exit: 0
      equals: "1"                          # stdout（前後空白除去）と完全一致
      stdout_contains: 文字列
      stdout_match: 正規表現
      lines_equal_value: true              # stdout の非空行の集合 == value（配列）の集合
      max_ms: 45000                        # 実行時間の上限
  ```
- `capture`:
  ```yaml
  capture:
    shell: ...                             # 省略時は verify と同じ既定
    run: <コマンド>
    normalize: [正規表現, ...]             # 一致部分を "…" に置換してから比較・保存
  ```
  スナップショットは `facts/snapshots/<ID>.txt`（git 管理）。未作成なら `{{capture}}` はビルドエラーにせず「（未取得）」と表示し、probe で `unknown`。

### A.2 チェック

| id | group | severity | 内容 |
|----|-------|----------|------|
| ref/resolve（拡張） | schema | error | 未定義の `{{fact}}` / `{{capture}}`、fact ID 重複 |
| unused/defs（拡張） | rules | warn | どの文書からも参照されない fact（`facts.yaml` 分は `@facts` に出す） |
| probe/&lt;ID&gt; | probe | error | fact ごとの実機検証。`@facts` の下に並ぶ |
| fact/refs | rules | error | 文書が参照している fact のうち、直近の probe 結果が fail のもの |

- probe は `--probe` 指定時のみ実行。未指定時は前回結果（`.doc-builder/cache/probe/<ID>.json`: `{status, stdout, ms, host, at}`）を表示し、無ければ `skipped`。
- 結果の表示にはマシン名と日時を付ける。
- 実行前に件数を表示する（コマンドは YAML の記述をそのまま実行。読み取り専用にするのは書き手の責任）。
- `--update-snapshots`: capture の出力をスナップショットに書き込み、その fact は pass。
- シェルが無い（例: macOS で powershell 指定）→ `unknown`。
- グループ順は `schema / rules / probe / online / review`。

### A.3 対象外

- SSH 経由のリモート検証（doc-builder は検証対象のマシン上で実行する）
- 禁止語リスト

---

## 追補 B: レイアウト（部品の組み合わせ）（2026-09-28）

見た目（色・フォント・用紙・番号書式・透かし）は**テーマ**、部品の配置は**レイアウト**に分ける。テーマから `cover` / `toc` / `header` / `footer` を削除し、レイアウトへ移す。

### B.1 レイアウトファイル

`layouts/<名前>.yaml`。`extends` で継承（区画単位で置き換え）。解決順（後勝ち）: 組み込み既定 → `layouts/default.yaml` → extends 連鎖 → 文書の `layout:`（名前またはインライン）→ CLI `--layout`（文書指定を丸ごと置き換え）。既定名は `runner.yaml` の `defaultLayout`（既定 `standard`）。

```yaml
name: 正式文書
extends: standard
page_numbers: { start_at: front }     # cover | front | body（既定 front）
cover:  [要素...]                      # 空または省略で表紙なし
front:  [要素...]                      # 表紙の後・本文の前
back:   [要素...]                      # 本文の後
header: [要素...]
footer: [要素...]
```

要素 = `部品名` または `{ 部品名: 設定 }`。コンテナは設定の `children` に要素を持つ。設定がスカラーの部品もある（`spacer: 25%`）。

### B.2 部品

| 部品 | 設定 | 置ける区画 | 必要なデータ |
|------|------|-----------|-------------|
| row | justify(start/center/end/space-between), gap, children | 全部 | — |
| column | gap, align(left/center/right), children | 全部 | — |
| grid | columns(長さ・fr の配列), gap, children | 全部 | — |
| box | padding, border(太さ), fill(色 or primary/accent), width, children | 全部 | — |
| spacer | 長さ / % / `fill` | cover, front, back | — |
| pagebreak | — | front, back | — |
| text | value（`{{meta.x}}` 可）, size, bold | 全部 | — |
| title | size | cover, front | meta.title |
| meta-table | fields | cover, front, back | meta の各 field |
| company | show(name/address/tel/email/url の配列), logo(bool) | cover, front, back | company.yaml |
| company-mini | — | header, footer, cover | company.yaml |
| approval | roles | cover, front, back | meta.approvals |
| history | — | front, back | meta.history |
| toc | depth, title | cover, front | — |
| page-number | format（`{page}` `{pages}`） | header, footer | — |
| confidential | text | 全部 | — |

自作部品: `components/<名前>.yaml`（`props`: JSON Schema、`regions`、`container`）と `components/<名前>.typ`（`#let <名前>(props, ctx, children) = ...`。ctx は meta / company）。Markdown には出力しない（ビルドログに 1 行）。

### B.3 データ

- `company.yaml`（プロジェクト直下）: `name`（必須）, `logo`, `address`, `tel`, `email`, `url`。logo はこのファイルからの相対パス。
- `meta.number`（文書番号）, `meta.approvals: [{ role, name?, date?, stamp? }]`, `meta.history: [{ version, date, note }]` を meta に追加。stamp は文書からの相対パス。

### B.4 チェック

| id | 対象 | severity | 内容 |
|----|------|----------|------|
| layout/valid | @themes | error | 全レイアウトの木を検証: 未知の部品、設定の型違い、children 不可の部品に子、区画違反、extends 循環・欠落、自作部品のファイル欠落（行番号付き） |
| layout/data | 文書 | error | 文書が使うレイアウトの部品が必要とするデータの欠落（company.yaml、meta.approvals の役割不足、meta.history、meta-table の field） |
| approval/complete | 文書 | error | version ≥ 1.0 で承認欄に name / date の空欄、stamp 画像の欠落 |

### B.5 出力

- PDF: レイアウトの木を Typst 式に変換。表紙は独立ページ、front/back は本文の前後に流す。
- Markdown: 区画を上から文字で表現（row 等の配置は無視、approval / history / meta-table は表、company は行）。header / footer は反映しない。
- 出力先: `dist/<theme>/<layout>/<doc>.{md,pdf}`。`--layout a,b` で複数レイアウトを一括ビルド。
- 同梱レイアウト: `simple`（表紙なし・目次なし）、`standard`（表紙＋目次、現行相当）、`formal`（ロゴ・社外秘・承認印・改訂履歴）。

---

## 追補 C: 表記スタイル・ハードコードなし・キャッシュなし（2026-09-28）

追補 B の実装中に受けた方針を記録する。追補 B と食い違う箇所はこちらを優先する。

### C.1 部品はすべてファイル

- 組み込み部品もコードに持たない。`components/<名前>/component.yaml`（regions / container / props / defaults / needs）＋ `render.typ`（`#let render(props, ctx, children)`）＋任意の `md.ts`。
- row / column / grid / box / spacer / pagebreak も同じ形式の部品。
- 部品の既定値は `component.yaml` の `defaults`。render.typ / md.ts に値を書かない。
- 改ページはテンプレートが自動で入れない。レイアウトで `pagebreak` を置く（表紙のみ独立ページ）。

### C.2 表記スタイル（wording）

- 言語切り替えではなく、書き方・表現の仕方の切り替え。番号書式（第{n}条 / STEP {n}）、固定の見出し・ラベル（目的 / 期待結果 / 目次 …）を ID で引く。
- 定義元は `src/wording/default.json`（全キー）。プロジェクトの `wordings/<名前>.json`（`extends` 可）、文書の `strings:` で上書き。
- 選択: 文書 `wording:` / CLI `--wording`。テーマから `numbering` を削除。
- 検査: 未知のキー、キーごとに使える変数以外の `{x}`、必須変数（`number.*` の `{n}` 等）の欠落（`wording/valid`、文書の `strings:` は schema/valid）。
- チェック結果のメッセージ（ツールの UI 文言）は対象外。

### C.3 ハードコードなし

- テーマ・レイアウト・ランナー設定のコード内既定値（FALLBACK）を廃止。`themes/default.yaml`、`layouts/*.yaml`、`src/defaults/runner.json` が唯一の定義元。
- テーマに `typography`（本文サイズ・行送り・見出し罫・表・引用・透かし・図の幅）と `charts`（幅・高さ・フォント）を追加し、template.typ と描画処理の値をすべて移した。
- ランナー設定に `placeholders`（text/placeholder の正規表現）、`online`（タイムアウト・UA・判定不能にするステータス）、`probe.timeoutMs`、`render.d2Pad`、`review`（タイムアウト・再試行回数・画像幅）を追加。
- レビューの指示文は `reviews/_prompt.md` / `reviews/_images.md`。

### C.4 キャッシュなし

- レビュー・実機検証・出典取得は、フラグ指定時のみ毎回実行し、結果を保存・流用しない。未指定は `skipped`。
- `fact/refs` は同じ実行の実機検証結果だけを見る（`--probe` なしは skipped）。
- 図は毎回描画し、実行ごとの作業ディレクトリ（`.doc-builder/work/run-*`、終了時に削除）に出す。
- メモリ上のキャッシュ（部品定義・フォント一覧・スキーマ）も持たない。
- `facts/snapshots/` は承認済みの期待出力（git 管理）でありキャッシュではない。

---

## 追補 D: 観点 × 範囲によるテストの仕分け（2026-09-28）

1 つのテストが事実・表現・構造を同時に判定すると結果が破綻する。すべてのテストは**観点を 1 つ、範囲を 1 つ**だけ持つ。判定は原則システム（決定的）。統計モデル（誤字検出モデル）は検証の結果不採用（それらしい漢字への置換を拾えず、括弧内で誤検出）。

### D.1 観点（axis）と範囲（scope）

| axis | 中身 | 判定 |
|------|------|------|
| structure | 必須項目・採番・参照・順序・型・テーマ/レイアウト/表記スタイルの妥当性 | スキーマ・参照解決 |
| surface | 誤字脱字・表記ゆれ・用字用語・禁止語・連語の誤り・助詞の重複・括弧・全半角 | 形態素解析（kuromoji）＋ textlint ＋辞書 |
| fact | 実機・出典・計算・資料間一致 | fact / probe / online / calc |
| logic | 手順フロー（到達・終端・分岐網羅・状態の連鎖・シナリオ） | グラフ解析 |
| expression | 文長・読点数・文体混在・曖昧語・要注意表現・1 文 1 動作・項目ごとの expect | 形態素解析＋辞書＋数値 |
| review | LLM による補助判定 | 警告のみ・既定で実行しない |

scope: `word` / `sentence` / `item`（条・手順・表・図）/ `section` / `document` / `corpus`（資料間）。

- 各チェックは `axis` と `scope` を宣言する。結果ツリーは「文書 → axis → チェック → 指摘」、指摘は scope に応じた位置（`blockId#文番号`）を持つ。
- 旧 group（schema/rules/probe/online/review）は廃止し、実行条件は `trigger: always | probe | online | review` で表す。
- ゲート: structure の致命的エラー（YAML 構文・スキーマ違反 = schema/valid）がある文書は他の axis を実行しない（参照切れ等では止めない）。surface の指摘がある文は expression で評価しない（同じ文に二重の指摘をしない）。
- 結果の要約は文書ごとに axis 別の件数（1 つの合否に畳まない）。exit code は error の fail があれば 1（review は常に warn）。

### D.2 文の分割

本文テキストを文（「。」「！」「？」、改行、箇条書き要素）に分け、`<blockId>#<n>`（1 始まり）の ID を振る。surface / expression の指摘は文 ID と文内の位置を持つ。

### D.3 surface / expression のルールと辞書

- 設定と辞書はすべて `lint/` に置く（コードに語を持たない）:
  - `lint/textlint.yaml`: 使う textlint ルールと設定（既定は ja-technical-writing 相当）。ルールごとに axis と severity を割り当てる。
  - `lint/dict/*.yaml`: 表記ゆれ（prh 形式）、誤変換（`暗合 → 暗号`）、連語（`{ noun: [設定, 画面, ファイル], particle: を, wrong: [聞く], right: 開く }`）、曖昧語、要注意表現（kind 別）、未知語の許可リスト（製品名・固有名詞）。
- 形態素解析による組み込み判定: 未知語（辞書・用語集・許可リスト・fact の値・英数字記号列を除く）、同一文書内の表記ゆれ（同じ読み・品詞で表記が違う）、1 文の動詞数（手順の actions）。
- 事実の遮蔽: `{{fact}}` `{{calc}}` `{{ref}}` などの埋め込みは、surface / expression の判定前に記号に置き換える（事実の値を表現として判定しない）。

### D.4 項目ごとの expect

各ブロック（条・手順・節）に判定条件を書ける。単体テストの matcher に相当。
```yaml
expect:
  - contains_fact: sales-contact
  - not_contains_vague: true
  - max_sentence_length: 80
  - max_actions_per_sentence: 1
  - contains: [期限]
  - not_contains: [など]
```
自由文の `ask:` は review 扱い（警告のみ）。

### D.5 フロー（kind: procedure）

```yaml
steps:
  - id: verify
    requires: [signup-done]
    produces: [email-verified]
    next: plan                         # 省略時は次の手順
    branches:
      - { if: 確認メールが届かない, goto: resend }
  - id: done
    end: true
flows:
  - { name: メールが届かない場合, choose: { verify: 確認メールが届かない }, expect_end: done }
```
logic の検査: 全手順の到達可能性、全経路の終端到達、意図しないループ（`loop: true` のない循環）、分岐先の未定義、`requires` が全経路で先行手順の `produces` により満たされるか、`flows` シナリオの到達先。フロー図（D2）は手順定義から生成できる。

### D.6 review（LLM）

- axis = review、常に warn、`--review` 指定時のみ。
- 観点に `why_not_rule`（ルールにできない理由）を必須にする。
- 事実の遮蔽（D.3）をした本文を渡し、事実の正誤は判定対象外と指示する。

### D.7 メッセージと init

- チェック結果のメッセージは `src/messages/default.json`（ID → 文面、変数 `{x}`）。プロジェクトの `messages.json` で上書き可。コードは ID で参照する。
- `bun src/cli.ts init [dir]`: themes / layouts / components / wordings / reviews / lint / runner.yaml / company.yaml / content サンプルを複製する。既存ファイルは上書きしない（`--force` で上書き）。

---

## 追補 E: manifest・体裁（改ページ）（2026-09-28）

### E.1 dist/manifest.json

Vite の manifest と同様に、出力ファイル（dist からの相対パス）ごとに記録する。
- `doc` `format` `theme` `layout` `wording` `builtAt`
- `output`: path / bytes / sha256
- `inputs`: 使ったファイル（role: source / theme / template / layout / component / wording / company / facts / snapshot / image / config）と sha256。ツール本体のファイルは `tool:` 接頭辞。
- `tests`: その組み合わせで検証した結果（状態、件数、観点別の状態と指摘数、問題のあったチェック）。ビルド時に `--render` 相当で実行する。
- 既存 manifest に追記し、出力ファイルが無くなった項目は削除する。

### E.2 体裁（axis: layout、trigger: render）

- 防止: 条・手順は「まとまり（group）」、表・図・引用・コードはブロックとして、Typst の `measure()` で実寸を測り、本文領域の `theme.pagination.keep_max`（既定 60%）以下なら分割しない。見出しは次の要素と同じページに置く（sticky）。表の `breakable: true` で分割を許可できる。
- 検出: 各ブロックと段落の始まりに位置の目印（metadata）を埋め込み、`typst eval 'query(<dtr>)'` でページと縦位置を取得して判定する。
  - `layout/breaks`（error）: 分割しないはずの塊が 2 ページにまたがった、見出しがページ末に取り残された。
  - `layout/gaps`（warn）: 塊を次ページに送った結果、前ページ下部の余白が `theme.pagination.max_gap`（既定 35%）を超えた。
- `--render` 指定時と `build`（PDF）時に実行する。

---

## 追補 F: 配色ファイル（2026-09-28）

- 色は `palettes/<名前>.yaml` にだけ置く。トークン: background / surface / text / muted / primary / accent / border / grid / watermark、`series`（グラフの系列色）、`diagram_theme`（D2 の配色 ID）。`extends` 可（トークン単位でマージ）。
- テーマは `palette: <名前>` で参照し、色の値を持たない。テンプレート・部品・グラフ・図はトークン名だけで色を参照する（透明度による色の生成もしない）。
- レイアウトの `box.fill` はトークン名のみ。
- theme/valid はパレットも検査し、theme/contrast はパレットごとに text / primary / muted と background の比を見る。
- manifest の入力に role `palette` を追加。同梱: default / dark-green / sakura / midnight。同梱テーマ midnight とレイアウト modern を追加。

---

## 追補 G: フローの論理チェックの仕組み化（2026-09-29）

- シナリオ（flows）は到達先に加え、たどった経路の上で requires が満たされているかを検査する。`choose` は文字列なら最初の訪問のみ、配列なら訪問ごと（null で既定の次）。
- 分岐のある手順は「それ以外は〜へ」と既定の行き先も出力する。
- 追加チェック:
  - `flow/orphan-requires`（error）: requires にあるのに produces / initial_state のどこにも無い状態。
  - `flow/declarations`（warn）: 分岐が既定の道筋の先へ飛ぶとき、飛ばされる手順に produces が無い（飛ばしてよいか検証できない）。
  - `flow/coverage`（warn）: どのシナリオでも通らない分岐・終端、分岐があるのにシナリオが無い。
  - `flow/troubleshooting`（error）: トラブルシューティングの `step` / `branch` / `goto` を分岐と突き合わせる。branch の行き先と goto の不一致、対処文の {{ref}} と goto の不一致、手順を参照しているのに goto が無い。
- 地の文の意味の矛盾そのものは判定しない。行き先を構造（goto・branch）として書かせ、構造同士を突き合わせる。

---

## 追補 H: 文書のテストを本文から分ける（2026-09-29）

- `doctests/<文書名>.yaml`（`runner.yaml` の `testsDir`）に、その文書のテストを置く。
  ```yaml
  expect: [...]            # 文書全体の判定条件
  blocks:                  # ブロック ID ごとの判定条件
    next: [{ contains: [期限] }, { contains_fact: sales-contact }]
  flows: [...]             # 手順書のシナリオ
  ```
- 本文の中の `expect:` / `flows:` も残し、両方を実行する。
- テストファイル由来の指摘は `loc.file` にテストファイルのパスを持ち、行番号はテストファイルの行。UI の抜粋もそのファイルを表示する。
- `tests/valid`（文書ごと）: 構文・スキーマ・存在しないブロック ID。壊れていても文書のチェックは止めない。`tests/orphan`（@themes）: 対応する文書の無いテストファイル。
- manifest の入力に role `test`。init で `doctests/example.yaml` を作る。
- サンプル: `doctests/setup-procedure.yaml`（フロー 3 本）、`doctests/proposal.yaml`（R4 を expect で検出。旧来は LLM）。
