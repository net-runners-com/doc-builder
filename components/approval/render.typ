#let render(props, ctx, children) = {
  let roles = props.roles
  let by = (:)
  for a in ctx.meta.at("approvals", default: ()) { by.insert(a.role, a) }
  let get(r, k) = by.at(r, default: (:)).at(k, default: "")
  let stamp(r) = {
    let p = ctx.stamps.at(r, default: none)
    if p == none { box(height: eval(props.cell_height))[] } else { box(height: eval(props.cell_height), align(center + horizon, image(p, height: eval(props.stamp_height)))) }
  }
  table(
    columns: roles.map(_ => eval(props.cell_width)),
    align: center + horizon,
    table.header(..roles.map(r => [#r])),
    ..roles.map(stamp),
    ..roles.map(r => text(size: eval(props.size), get(r, "name"))),
    ..roles.map(r => text(size: eval(props.size), get(r, "date"))),
  )
}
