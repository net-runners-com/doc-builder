// doc-test-runner 既定テンプレート（見た目のみ。値はすべて theme から受け取る）。
// theme.template で差し替える場合も同じ引数を受け取ること。区画はレイアウトから組み立て済みの content で渡される。
// 改ページはレイアウトの pagebreak 部品で明示する（テンプレートは区画の前後で改ページしない。表紙だけは独立ページ）。
#let template(theme: (:), title: "", cover: none, front: none, back: none, header: none, footer: none, start: "front", watermark: none, body) = {
  let col = theme.colors
  let ty = theme.typography
  let primary = rgb(col.primary)
  let accent = rgb(col.accent)
  let fg = rgb(col.text)
  let bg = rgb(col.background)
  let m = theme.margin
  let small(c) = if c != none { text(size: eval(ty.header_size), fill: fg.transparentize(eval(ty.header_fade)), c) }
  let hdr = small(header)
  let ftr = small(footer)

  set document(title: title)
  set page(
    paper: theme.paper,
    margin: (top: eval(m.top), bottom: eval(m.bottom), x: eval(m.x)),
    fill: bg,
    background: if watermark != none {
      rotate(eval(ty.watermark_angle), text(size: eval(ty.watermark_size), weight: "bold", fill: fg.transparentize(eval(ty.watermark_fade)), watermark))
    },
  )
  set text(font: theme.fonts.body, fill: fg, lang: "ja", size: eval(ty.base_size))
  set par(justify: true, leading: eval(ty.leading))
  show heading: set text(font: theme.fonts.heading, fill: primary)
  show heading.where(level: 1): it => block(above: eval(ty.heading_above), below: eval(ty.heading_below), stroke: (bottom: eval(ty.heading_rule) + primary), inset: (bottom: eval(ty.heading_rule_gap)), width: 100%, it)
  show raw: set text(font: theme.fonts.mono)
  show link: set text(fill: accent)
  set figure(numbering: none)
  set table(stroke: eval(ty.table_stroke) + fg.transparentize(eval(ty.table_line_fade)), inset: eval(ty.table_inset), fill: (x, y) => if y == 0 { primary })
  show table.cell.where(y: 0): set text(fill: bg, weight: "bold")
  set quote(block: true)
  show quote: it => block(stroke: (left: eval(ty.quote_rule) + accent), inset: (left: eval(ty.quote_inset), y: eval(ty.quote_inset_y)), it.body + if it.attribution != none { align(right, text(size: eval(ty.attribution_size))[— #it.attribution]) })

  // ページ設定は途中で変えない（set page は改ページを起こす）。番号の表示開始は状態で切り替える。
  let numbered = state("dtr-numbered", start == "cover")
  set page(header: hdr, footer: context if numbered.get() { ftr })
  if cover != none {
    page(header: none, footer: if start == "cover" { ftr } else { none }, cover)
  }
  let begin = { numbered.update(true); counter(page).update(1) }
  if front != none {
    if start == "front" { begin }
    front
  }
  if start == "body" or (start == "front" and front == none) { begin }
  body
  if back != none { back }
}
