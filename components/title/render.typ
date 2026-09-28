#let render(props, ctx, children) = text(
  size: eval(props.size),
  weight: "bold",
  font: ctx.theme.fonts.heading,
  fill: rgb(ctx.theme.colors.primary),
  ctx.meta.title,
)
