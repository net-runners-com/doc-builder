#let render(props, ctx, children) = {
  let co = ctx.company
  if co == none { return [] }
  let name = text(size: eval(props.size), co.name)
  if co.at("logo", default: none) != none {
    grid(columns: 2, column-gutter: eval(props.gap), align: horizon, image(co.logo, height: eval(props.logo_height)), name)
  } else { name }
}
