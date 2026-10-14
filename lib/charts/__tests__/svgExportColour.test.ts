import assert from "node:assert/strict"
import test from "node:test"

import { resolveSvgCssColours } from "../svgExportColour"

type Fake = {
  attrs: Map<string, string>
  children: Fake[]
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  querySelectorAll(selector: string): Fake[]
}

function paintable(attrs: Record<string, string>, children: Fake[] = []): Fake {
  const node: Fake = {
    attrs: new Map(Object.entries(attrs)),
    children,
    getAttribute(name) {
      return this.attrs.get(name) ?? null
    },
    setAttribute(name, value) {
      this.attrs.set(name, value)
    },
    querySelectorAll() {
      return this.children.flatMap((child) => [child, ...child.querySelectorAll("*")])
    },
  }
  return node
}

test("export colours are hex or rgb, not var()", () => {
  const line = paintable({
    stroke: "var(--av-ink)",
    fill: "var(--av-chart-1)",
    style: "stop-color: var(--av-chart-3)",
  })
  const svg = paintable({ stroke: "var(--border)" }, [line])
  resolveSvgCssColours(svg, (name) => {
    if (name === "--av-ink") return "#0F1D13"
    if (name === "--av-chart-1") return "rgb(36, 102, 70)"
    if (name === "--av-chart-3") return "#B5D337"
    return "40 25% 86%"
  })
  assert.equal(line.attrs.get("stroke"), "#0F1D13")
  assert.equal(line.attrs.get("fill"), "rgb(36, 102, 70)")
  assert.equal(line.attrs.get("style"), "stop-color: #B5D337")
  assert.equal(svg.attrs.get("stroke"), "var(--border)")
  assert.doesNotMatch(`${line.attrs.get("stroke")} ${line.attrs.get("fill")} ${line.attrs.get("style")}`, /var\(/)
})
