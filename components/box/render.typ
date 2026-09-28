#let render(props, ctx, children) = {
  let c = ctx.theme.colors
  let color(v) = if v == none { none } else { rgb(c.at(v)) }
  let b = props.at("border", default: none)
  let w = props.at("width", default: none)
  block(
    inset: eval(props.padding),
    stroke: if b == none { none } else { eval(b) + rgb(c.border) },
    fill: color(props.at("fill", default: none)),
    width: if w == none { auto } else { eval(w) },
    children.join(),
  )
}
