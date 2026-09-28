#let render(props, ctx, children) = block(width: 100%)[
  #text(weight: "bold", fill: rgb(ctx.theme.colors.primary), ctx.strings.at("section.history"))
  #table(
    columns: (auto, auto, 1fr),
    table.header(..("column.version", "column.date", "column.note").map(k => [#ctx.strings.at(k)])),
    ..ctx.meta.at("history", default: ()).map(h => ([#h.version], [#h.date], [#h.note])).flatten(),
  )
]
