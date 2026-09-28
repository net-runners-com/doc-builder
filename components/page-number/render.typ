#let render(props, ctx, children) = {
  let f = props.format
  let parts = f.split(regex("(\{page\}|\{pages\})"))
  let tokens = f.matches(regex("\{page\}|\{pages\}")).map(m => m.text)
  context {
    for (i, p) in parts.enumerate() {
      p
      if i < tokens.len() {
        if tokens.at(i) == "{page}" { counter(page).display() } else { str(counter(page).final().first()) }
      }
    }
  }
}
