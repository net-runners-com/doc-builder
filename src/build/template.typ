// doc-test-runner 既定テンプレート（見た目のみ。値はすべて theme から受け取る）。
// theme.template で差し替える場合も同じ引数を受け取ること。区画はレイアウトから組み立て済みの content で渡される。
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
  set image(width: eval(ty.figure_width))
  set table(stroke: eval(ty.table_stroke) + fg.transparentize(eval(ty.table_line_fade)), inset: eval(ty.table_inset), fill: (x, y) => if y == 0 { primary })
  show table.cell.where(y: 0): set text(fill: bg, weight: "bold")
  set quote(block: true)
  show quote: it => block(stroke: (left: eval(ty.quote_rule) + accent), inset: (left: eval(ty.quote_inset), y: eval(ty.quote_inset_y)), it.body + if it.attribution != none { align(right, text(size: eval(ty.attribution_size))[— #it.attribution]) })

  if cover != none {
    page(header: none, footer: if start == "cover" { ftr } else { none }, cover)
  }
  if front != none {
    set page(header: hdr, footer: if start == "body" { none } else { ftr })
    if start == "front" { counter(page).update(1) }
    front
    pagebreak(weak: true)
  }
  set page(header: hdr, footer: ftr)
  if start == "body" or (start == "front" and front == none) { counter(page).update(1) }
  body
  if back != none {
    pagebreak(weak: true)
    back
  }
}
