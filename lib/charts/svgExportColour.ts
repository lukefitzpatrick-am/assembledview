const PAINT_ATTRS = ["fill", "stroke", "color", "stop-color", "flood-color"] as const

const CSS_VAR = /var\(\s*(--[\w-]+)\s*\)/g

type Paintable = {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  querySelectorAll(selector: string): Iterable<Paintable>
}

/** A colour a standalone SVG can paint. A raw HSL component list is not one. */
export function isCssPaint(value: string): boolean {
  const trimmed = value.trim()
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) return true
  return /^(?:rgb|hsl|hwb|lab|lch|oklab|oklch)a?\(/i.test(trimmed)
}

export function resolveCssVarsInValue(value: string, read: (name: string) => string): string {
  return value.replace(CSS_VAR, (full, name: string) => {
    const next = read(name).trim()
    return isCssPaint(next) ? next : full
  })
}

export function readCssToken(name: string, root: Element = document.documentElement): string {
  return getComputedStyle(root).getPropertyValue(name)
}

/** Replace `var(--token)` paints on an SVG with the token's colour. Non-colours stay. */
export function resolveSvgCssColours(
  svg: Paintable,
  read: (name: string) => string = readCssToken,
): void {
  const nodes = [svg, ...svg.querySelectorAll("*")]
  for (const node of nodes) {
    for (const attr of PAINT_ATTRS) {
      const raw = node.getAttribute(attr)
      if (!raw || !raw.includes("var(")) continue
      const next = resolveCssVarsInValue(raw, read)
      if (next !== raw) node.setAttribute(attr, next)
    }
    const style = node.getAttribute("style")
    if (!style || !style.includes("var(")) continue
    const next = resolveCssVarsInValue(style, read)
    if (next !== style) node.setAttribute("style", next)
  }
}
