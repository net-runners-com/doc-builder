#let render(props, ctx, children) = {
  let fields = props.fields
  let muted = rgb(ctx.theme.colors.text).transparentize(eval(props.label_fade))
  grid(
    columns: 2,
    column-gutter: eval(props.column_gap),
    row-gutter: eval(props.row_gap),
    ..fields.map(f => (text(fill: muted, ctx.strings.at("field." + f)), [#ctx.meta.at(f, default: "")])).flatten(),
  )
}
