#let render(props, ctx, children) = {
  let co = ctx.company
  if co == none { return [] }
  let keys = props.show
  let parts = ()
  if props.logo and co.at("logo", default: none) != none {
    parts.push(image(co.logo, height: eval(props.logo_height)))
  }
  for k in keys {
    let v = co.at(k, default: none)
    if v == none { continue }
    if k == "name" { parts.push(text(weight: "bold", size: eval(props.name_size), v)) }
    else if k == "tel" { parts.push(text(size: eval(props.detail_size), ctx.strings.at("label.tel").replace("{tel}", v))) }
    else { parts.push(text(size: eval(props.detail_size), v)) }
  }
  stack(dir: ttb, spacing: eval(props.spacing), ..parts)
}
