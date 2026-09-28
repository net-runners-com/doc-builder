#let render(props, ctx, children) = {
  let a = (left: left, center: center, right: right).at(props.align)
  align(a, stack(dir: ttb, spacing: eval(props.gap), ..children))
}
