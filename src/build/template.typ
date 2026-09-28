// doc-test-runner 既定テンプレート。theme.template で差し替える場合も同じ引数を受け取ること。
#let template(theme: (:), title: "", cover: (), header: (:), footer: (:), watermark: none, body) = {
  let col = theme.colors
  let primary = rgb(col.primary)
  let accent = rgb(col.accent)
  let fg = rgb(col.text)
  let bg = rgb(col.background)
  let hf(parts) = grid(
    columns: (1fr, 1fr, 1fr),
    align(left, parts.at("left", default: [])),
    align(center, parts.at("center", default: [])),
    align(right, parts.at("right", default: [])),
  )
  let hdr = text(size: 8pt, fill: fg.transparentize(40%), hf(header))
  let ftr = text(size: 8pt, fill: fg.transparentize(40%), hf(footer))
  let m = theme.margin
  let start = theme.start_at

  set document(title: title)
  set page(
    paper: theme.paper,
    margin: (top: eval(m.top), bottom: eval(m.bottom), x: eval(m.x)),
    fill: bg,
    background: if watermark != none {
      rotate(-40deg, text(size: 90pt, weight: "bold", fill: fg.transparentize(90%), watermark))
    },
  )
  set text(font: theme.fonts.body, fill: fg, lang: "ja", size: 10.5pt)
  set par(justify: true, leading: 0.9em)
  show heading: set text(font: theme.fonts.heading, fill: primary)
  show heading.where(level: 1): it => block(above: 1.6em, below: 0.9em, stroke: (bottom: 1pt + primary), inset: (bottom: 4pt), width: 100%, it)
  show raw: set text(font: theme.fonts.mono)
  show link: set text(fill: accent)
  set figure(numbering: none)
  set table(stroke: 0.5pt + fg.transparentize(60%), inset: 6pt, fill: (x, y) => if y == 0 { primary })
  show table.cell.where(y: 0): set text(fill: bg, weight: "bold")
  set quote(block: true)
  show quote: set block(stroke: (left: 2pt + accent), inset: (left: 10pt, y: 4pt))

  if theme.cover.enabled {
    page(header: none, footer: if start == "cover" { ftr } else { none })[
      #v(28%)
      #if theme.cover.logo != none { image(theme.cover.logo, width: 42mm) }
      #v(1.5em)
      #text(size: 26pt, weight: "bold", font: theme.fonts.heading, fill: primary, title)
      #v(2em)
      #for f in cover [
        #text(fill: fg.transparentize(30%), f.label)：#f.value \
      ]
    ]
  }
  if theme.toc.enabled {
    page(header: none, footer: if start == "body" { none } else { ftr })[
      #if start == "toc" { counter(page).update(1) }
      #outline(title: [目次], depth: theme.toc.depth)
    ]
  }
  set page(header: hdr, footer: ftr)
  if start == "body" { counter(page).update(1) }
  if not theme.cover.enabled {
    text(size: 20pt, weight: "bold", font: theme.fonts.heading, fill: primary, title)
    v(1em)
  }
  body
}
