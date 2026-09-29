# テストランナーの仕組み

doc-builder のうち、文書を検証する部分（テストランナー）がどう動くかをまとめる。ビルド（md / pdf 出力）もテストを内部で使うので、最後に触れる。

## 全体の流れ

```
content/*.yaml ─┐
facts.yaml ─────┤
themes/ palettes/ layouts/ components/ wordings/ reviews/ checks/ runner.yaml
                │
                ▼
 1. 読み込み   loadDoc: テーマ・レイアウト・表記スタイルを解決し、YAML を中間表現（Doc）にする
                │
                ▼
 2. チェック   runAll: 全チェックを「観点 × 範囲」で実行し、1 件ずつ結果（CheckResult）を作る
                │
                ▼
 3. 結果       CLI のテキスト / --json / Web UI（ツリーと固有 URL）/ manifest.json
```

入口は `src/cli.ts`。`test` は `runAll`（`src/runner/run.ts`）を呼び、結果を表示して終了コードを返す。

## 1. 読み込み（文書 → Doc）

`loadDoc`（`src/runner/run.ts`）が文書 1 つごとに次を行う。

1. **テーマの解決**（`src/theme/resolve.ts`）
   `themes/default.yaml` → `extends` の連鎖 → 文書の `theme:` → CLI の `--theme` の順に重ねる。色はテーマに書かず、テーマが指す `palettes/<名前>.yaml` から読む。
2. **レイアウトの解決**（`src/page/resolve.ts`）
   `layouts/<名前>.yaml` を `extends` で重ね、部品の木を検証する。部品の定義は `components/<名前>/component.yaml`。
3. **Doc の組み立て**（`buildDoc`、`src/parse/doc.ts`）
   - YAML を読み、行番号を引けるようにする（`src/parse/yaml.ts`）
   - JSON Schema で検証する（`src/schema/doc.ts`）。ここで失敗した文書は、以降のチェックを実行しない
   - 表記スタイル（`src/wording/default.json` → `wordings/*.json` → 文書の `strings:`）を決める
   - ID を集めて採番する（第n条・手順n・表n・図n・[n]）。番号の書式は表記スタイルから取る
   - 本文の文字列をすべて集め（`texts`）、文に分けて文 ID（`<blockId>#<n>`、見出しは `#title`）を振る
   - 埋め込み（`{{ref}}` `{{cite}}` `{{fact}}` `{{calc}}` など）を展開し、失敗をビルドエラーとして記録する

Doc が持つ主なもの:

| 項目 | 中身 |
|------|------|
| `data` | 検証済みの YAML |
| `defs` | ID → 種類・行番号・表示ラベル（第4条 など） |
| `texts` | 本文の文字列（位置・所属ブロック・行番号・文の区切り） |
| `buildErrors` | schema/valid・ref/resolve・calc/eval の失敗 |
| `strings` | 表記スタイル（固定の文言と書式） |
| `facts` `factRefs` | 文書内の fact と、本文が参照した fact |

## 2. チェック

### チェックの形

どのチェックも同じ形をしている（`src/checks/define.ts`）。

```ts
defineCheck({
  id: "glossary/avoid",
  axis: "surface",      // 観点（何を確かめるか）
  scope: "word",        // 範囲（どこを見るか）
  trigger: "always",    // 実行条件（省略時 always）
  kinds: ["*"],         // 対象の文書の種類
  severity: "error",    // error なら fail、warn なら warn
  run(doc, ctx) { return [ctx.fail(m("check.glossary.avoid", {...}), loc)] },
});
```

- **観点**: 構造・表層・事実・論理・表現・体裁・レビュー。1 つのチェックは観点を 1 つだけ持つ。表現と事実を同じチェックで判定しない。
- **範囲**: 単語・文・項目・章・文書・資料間。
- **実行条件**: `always` / `probe`（実機）/ `online`（ネット）/ `render`（組版）/ `review`（Claude）。フラグが無ければランナーが `skipped` にする。
- **文言**: メッセージはコードに書かず ID で引く（`src/messages/default.json`、プロジェクトの `messages.json` で上書き）。

### どのチェックが集まるか

`runAll` は次をまとめて実行する。

| 種類 | 定義場所 | 結果の doc 名 |
|------|---------|--------------|
| 組み込みチェック | `src/checks/builtin/*.ts` | 各文書 |
| 自作チェック | `checks/*.ts`（`export default defineCheck(...)`） | 各文書 |
| レビュー観点 | `reviews/_common.yaml` と `reviews/<kind>.yaml` | 各文書 |
| 資料全体のチェック | テーマ・パレット・レイアウト・表記スタイル・レビュー観点の妥当性 | `@themes` |
| fact のチェック | `facts.yaml` の妥当性、実機検証（`probe/<ID>`）、未使用の fact | `@facts` |

### 実行の順番

1. `@themes` のチェック
2. `@facts` の実機検証（`--probe` のとき）。結果はこの実行の中だけで保持し、次の文書チェック（`fact/refs`）が読む
3. 文書ごとのチェック
4. どの文書も参照しない fact（全文書を対象にしたときだけ）

### 結果の状態

| 状態 | 意味 | 作り方 |
|------|------|--------|
| pass ✓ | 指摘なし | `run` が空配列を返す |
| fail ✗ | 不合格 | severity: error で指摘あり |
| warn ! | 警告 | severity: warn で指摘あり |
| unknown ? | 判定できない | ツールが無い、通信失敗、例外（`Unknown` を投げる） |
| skipped – | 実行していない | 実行条件のフラグが無い、スキーマ違反（`Skip` を投げる） |

終了コードは、fail が 1 件でもあれば 1。`--strict` では warn と unknown も 1。

### 止める・止めない

- YAML 構文エラーとスキーマ違反（`schema/valid`）だけは、その文書の他のチェックを止める。構造が読めないと他の判定が意味を持たないため。
- 参照切れなどは止めない。1 つの誤りで他の誤りが見えなくならないようにする。
- 前回の結果は使わない（キャッシュしない）。レビュー・実機検証・出典の取得はフラグを付けたときだけ毎回実行し、図も毎回描き直す。

## 観点ごとのチェック

### 構造（structure）

| チェック | 内容 |
|---------|------|
| schema/valid | YAML 構文、JSON Schema（必須項目・型・未知の項目）、表記スタイルの上書きの妥当性 |
| ref/resolve | 未定義の参照・出典・図・fact、ID の重複 |
| calc/eval | 計算式の誤り |
| text/heading-in-body | 本文中の Markdown 見出し |
| image/alt, figure/caption, figure/render | 画像の alt、図のキャプション、図が描画できるか |
| unused/defs | 使われていない出典・画像・図・fact |
| layout/data | レイアウトの部品が必要とするデータ（会社情報・承認欄・改訂履歴など） |
| approval/complete | 版 1.0 以上の承認欄の空欄、印影の画像 |
| flow/refs | フローの行き先・シナリオの手順が存在するか |
| expect/structure | 項目ごとの期待値（fact・参照を含むか） |
| @themes 側 | theme/valid、layout/valid、wording/valid、review/valid |

### 表層（surface）

| チェック | 内容 |
|---------|------|
| glossary/avoid | 用語集の「避ける語」（定義語の一部としての出現は除く） |
| text/placeholder | TBD などの未記入（語は `runner.yaml` の `placeholders`） |

誤字脱字は保留中（辞書・モデルを使わない方針で検討した結果）。

### 事実（fact）

| チェック | 内容 |
|---------|------|
| link/local | 相対リンク・画像ファイルの存在 |
| source/stale | 出典の閲覧日が古い（警告） |
| terms/notice-period | 規約の告知期間と施行日の整合 |
| probe/<ID>（@facts） | fact の確認コマンドを実機で実行し、期待値と照合（`--probe`） |
| fact/refs | 実機と合わなかった fact を参照している文書（`--probe`） |
| online/url, online/quote | 出典 URL の状態、引用文がページにあるか（`--online`） |

### 論理（logic）

手順書のフローを、手順をノード、既定の次と分岐を辺にしたグラフとして解析する（`src/flow.ts`）。

| チェック | 内容 |
|---------|------|
| flow/reachable | 最初の手順からたどり着けない手順 |
| flow/terminates | 終わりにたどり着けない手順（抜けられない繰り返し） |
| flow/loop | `loop: true` の無い繰り返し |
| flow/state | `requires` が、あらゆる経路で前の手順の `produces` と `initial_state` によって満たされるか（合流点は積集合を取るデータフロー解析） |
| flow/orphan-requires | どの手順も作らない前提 |
| flow/declarations | 分岐で飛ばす手順に `produces` が無く、飛ばしてよいか検証できない（警告） |
| flow/scenario | `flows` のシナリオを実際にたどり、到達先と経路上の前提を検査 |
| flow/coverage | どのシナリオでも通らない分岐・終端（警告） |
| flow/troubleshooting | トラブルシューティングの `step` / `branch` / `goto` と対処文の参照を、フローと突き合わせる |
| schedule/order | 提案書の日程の時系列 |

地の文の意味は読まない。行き先や状態を構造として書かせ、構造どうしを突き合わせる。

### 表現（expression）

形態素解析（kuromoji）と数値で判定する。辞書は使わない。上限は `runner.yaml` の `expression`（文書の種類ごと）。

| チェック | 内容 |
|---------|------|
| expression/sentence-length | 一文の文字数 |
| expression/commas | 一文の読点の数 |
| expression/style | です・ます調とだ・である調の混在（文末の形態素で判定） |
| expression/actions | 手順の一文に動作（自立動詞）がいくつあるか |
| expect/expression | 項目ごとの期待値（語を含む・含まない、文の数、文の長さ、動作の数） |
| theme/contrast（@themes） | パレットの文字色と背景色のコントラスト比 |

### 体裁（layout、`--render`）

実際に Typst で組版し、各ブロックと段落の始まりに埋め込んだ目印の位置（ページと縦位置）を `typst eval` で取り出して判定する（`src/build/pagination.ts`）。

| チェック | 内容 |
|---------|------|
| layout/breaks | 分割しないはずの塊が 2 ページにまたがった、見出しだけがページ末に残った |
| layout/gaps | 塊を次のページに送った結果、前のページの下部に大きな余白ができた（警告） |

組版側では、条・手順・表・図の高さを `measure()` で測り、本文領域の `theme.pagination.keep_max` 以下なら分割しないブロックにする。

### レビュー（review、`--review`）

`reviews/*.yaml` の観点ごとに `claude -p` を読み取り専用の設定で 1 回呼ぶ。事実の部分は `［事実:ID］` に伏せて渡し、結果は常に警告。観点には「ルールにできない理由」（`why_not_rule`）が必須。

## 3. 結果の見せ方

- **CLI**: 文書ごとに観点別の要約（例: `構造 ✓ 表層 ✗2 事実 ✗1`）と、不合格・警告の指摘（文 ID と行番号つき）。`--json` で機械向けに出す。
- **Web UI**（`bun run serve`）: 文書 → 観点 → チェック → 指摘のツリー。指摘ごとに固有 URL（`/t/<文書>/<観点>/<チェック>/<n>`）があり、YAML の該当行を表示する。起動時に `.doc-builder/urls.json` を書き出し、`--register-superset` で Superset の URL 一覧にも登録する。ファイルの変更を監視して自動で再実行する。
- **manifest**（`build` 時）: 出力ごとに、使った入力ファイル（ハッシュつき）と、その組み合わせでのテスト結果を `dist/manifest.json` に記録する。

## ビルドとの関係

`build` は出力の組み合わせ（テーマ × レイアウト）ごとに、同じ条件で `runAll` を実行してから出力し、結果を manifest に書く。PDF を出すときは体裁のチェック（`render`）も走る。テストが不合格でも出力は作る（ビルドエラーの文書だけは出力しない）。

## 拡張するとき

| やりたいこと | 置く場所 |
|-------------|---------|
| チェックを足す | `checks/<名前>.ts` に `defineCheck`。文言は `messages.json` に ID で |
| レビュー観点を足す | `reviews/<kind>.yaml` に `id` / `ask` / `why_not_rule` |
| 事実を足す | `facts.yaml` に `value` / `claim` / `verify` / `capture` |
| 見た目を変える | `themes/`（文字組み・改ページ）、`palettes/`（色）、`layouts/`（配置）、`components/`（部品） |
| 言い回しを変える | `wordings/<名前>.json`、または文書の `strings:` |
| 上限値を変える | `runner.yaml`（`src/defaults/runner.json` を上書き） |

## 関連するファイル

| ファイル | 役割 |
|---------|------|
| `src/runner/run.ts` | 読み込みと実行の順番、実行条件による未実行、結果の組み立て |
| `src/checks/define.ts` | チェックの型、`ctx` |
| `src/checks/builtin/` | 組み込みチェック（観点ごとにファイルを分けている） |
| `src/parse/doc.ts` | YAML → Doc（採番・文の分割・埋め込みの展開） |
| `src/flow.ts` | フローのグラフ解析とシナリオの実行 |
| `src/morph.ts` | 形態素解析（文体・動作の数） |
| `src/build/pagination.ts` | 組版結果の位置から体裁を判定 |
| `src/runner/format.ts` | CLI のテキスト、終了コード |
| `src/server/` | Web UI、URL 一覧 |
| `docs/superpowers/specs/2026-09-28-doc-builder-design.md` | 設計（追補 A〜G） |
