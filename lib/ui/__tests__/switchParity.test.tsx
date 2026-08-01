/**
 * Parity contract for the native Switch primitive (BUG-1 / C-31).
 * Verifies attributes Tailwind + a11y hang off, controlled/uncontrolled,
 * disabled, and the HTML button activation surface Space/Enter use.
 *
 * Run: npx tsx --test lib/ui/__tests__/switchParity.test.tsx
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import React, { act, useState } from "react"
import { JSDOM } from "jsdom"
import { createRoot, type Root } from "react-dom/client"

import { Switch } from "@/components/ui/switch"

const switchSourcePath = new URL(
  "../../../components/ui/switch.tsx",
  import.meta.url
)

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  })
  const { window } = dom
  const g = globalThis as typeof globalThis & {
    window: typeof window
    document: typeof window.document
    HTMLElement: typeof window.HTMLElement
    HTMLButtonElement: typeof window.HTMLButtonElement
    Node: typeof window.Node
    IS_REACT_ACT_ENVIRONMENT?: boolean
    getComputedStyle: typeof window.getComputedStyle
    requestAnimationFrame: typeof window.requestAnimationFrame
    cancelAnimationFrame: typeof window.cancelAnimationFrame
  }
  g.window = window
  g.document = window.document
  g.HTMLElement = window.HTMLElement
  g.HTMLButtonElement = window.HTMLButtonElement
  g.Node = window.Node
  Object.defineProperty(g, "navigator", {
    value: window.navigator,
    configurable: true,
  })
  g.IS_REACT_ACT_ENVIRONMENT = true
  g.getComputedStyle = window.getComputedStyle.bind(window)
  g.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number
  g.cancelAnimationFrame = (id: number) => clearTimeout(id)
  return { dom, window }
}

function mount(ui: React.ReactElement): { root: Root; container: HTMLElement } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return { root, container }
}

test("source keeps data-state + role=switch + aria-checked (no Radix Root)", async () => {
  const source = await readFile(switchSourcePath, "utf8")
  assert.match(source, /role="switch"/)
  assert.match(source, /aria-checked=\{isChecked\}/)
  assert.match(source, /data-state=\{isChecked \? "checked" : "unchecked"\}/)
  assert.match(source, /type="button"/)
  assert.doesNotMatch(source, /from ["']@radix-ui\/react-switch["']/)
  assert.doesNotMatch(source, /import \* as SwitchPrimitives/)
})

test("controlled + uncontrolled + disabled toggle via click (Space/Enter → click on type=button)", () => {
  installDom()
  let lastChecked: boolean | undefined

  const { root, container } = mount(
    <Switch
      aria-label="Demo"
      defaultChecked={false}
      onCheckedChange={(v) => {
        lastChecked = v
      }}
    />
  )

  const btn = container.querySelector('[role="switch"]') as HTMLButtonElement
  assert.ok(btn)
  assert.equal(btn.type, "button")
  assert.equal(btn.getAttribute("role"), "switch")
  assert.equal(btn.getAttribute("aria-checked"), "false")
  assert.equal(btn.getAttribute("data-state"), "unchecked")

  // Space/Enter activate HTML buttons by synthesizing click; toggle lives on click.
  act(() => {
    btn.click()
  })
  assert.equal(lastChecked, true)
  assert.equal(btn.getAttribute("aria-checked"), "true")
  assert.equal(btn.getAttribute("data-state"), "checked")

  act(() => {
    root.render(
      <Switch
        aria-label="Demo"
        checked={true}
        disabled
        onCheckedChange={() => {
          lastChecked = false
        }}
      />
    )
  })
  const disabledBtn = container.querySelector(
    '[role="switch"]'
  ) as HTMLButtonElement
  assert.equal(disabledBtn.disabled, true)
  assert.equal(disabledBtn.getAttribute("data-disabled"), "")
  assert.equal(disabledBtn.getAttribute("data-state"), "checked")
  lastChecked = undefined
  act(() => {
    disabledBtn.click()
  })
  assert.equal(lastChecked, undefined)

  function ControlledHarness() {
    const [on, setOn] = useState(false)
    return (
      <Switch
        aria-label="Controlled"
        checked={on}
        onCheckedChange={(v) => {
          lastChecked = v
          setOn(v)
        }}
      />
    )
  }
  act(() => {
    root.render(<ControlledHarness />)
  })
  const controlled = container.querySelector(
    '[role="switch"]'
  ) as HTMLButtonElement
  assert.equal(controlled.getAttribute("data-state"), "unchecked")
  act(() => {
    controlled.click()
  })
  assert.equal(lastChecked, true)
  assert.equal(controlled.getAttribute("data-state"), "checked")

  act(() => {
    root.unmount()
  })
  container.remove()
})