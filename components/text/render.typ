#let render(props, ctx, children) = {
  let v = props.value.replace(regex("\{\{\s*meta\.([a-z_]+)\s*\}\}"), m => ctx.meta.at(m.captures.at(0), default: ""))
  text(size: eval(props.size), weight: if props.bold { "bold" } else { "regular" }, v)
}
