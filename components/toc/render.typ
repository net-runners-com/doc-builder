#let render(props, ctx, children) = outline(
  title: props.at("title", default: ctx.strings.at("section.toc")),
  depth: props.depth,
)
