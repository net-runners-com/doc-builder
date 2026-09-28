#let render(props, ctx, children) = {
  let accent = rgb(ctx.theme.colors.accent)
  box(stroke: eval(props.border) + accent, inset: (x: eval(props.padding_x), y: eval(props.padding_y)), text(fill: accent, weight: "bold", size: eval(props.size), props.at("text", default: ctx.strings.at("label.confidential"))))
}
