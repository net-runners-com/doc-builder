#let render(props, ctx, children) = {
  let c = ctx.theme.colors
  let color(v) = if v == none { none } else if v in c { rgb(c.at(v)) } else { rgb(v) }
  let b = props.at("border", default: none)
  let w = props.at("width", default: none)
  block(
    inset: eval(props.padding),
    stroke: if b == none { none } else { eval(b) + rgb(c.text).transparentize(eval(props.border_fade)) },
    fill: color(props.at("fill", default: none)),
    width: if w == none { auto } else { eval(w) },
    children.join(),
  )
}
