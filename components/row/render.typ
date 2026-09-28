#let render(props, ctx, children) = {
  let n = children.len()
  if n == 0 { return [] }
  let j = props.justify
  let (cols, cells) = if j == "end" {
    ((1fr,) + (auto,) * n, ([],) + children)
  } else if j == "center" {
    ((1fr,) + (auto,) * n + (1fr,), ([],) + children + ([],))
  } else if j == "space-between" and n > 1 {
    let c = (auto,)
    let cs = (children.at(0),)
    for i in range(1, n) {
      c += (1fr, auto)
      cs += ([], children.at(i))
    }
    (c, cs)
  } else {
    ((auto,) * n + (1fr,), children + ([],))
  }
  grid(columns: cols, column-gutter: eval(props.gap), align: horizon, ..cells)
}
