/**
 * OOH large-format expert gate (interim >30 panel lines → expert, not N cards).
 */
import assert from "node:assert/strict"
import test from "node:test"
import {
  OOH_PANEL_LINE_EXPERT_THRESHOLD,
  countOohPanelGranularityLines,
  evaluateOohExpertPreference,
  preferOohExpertView,
  shouldShowOohLargeFormatSummary,
  writeIngestOohExpertPreference,
  consumeIngestOohExpertPreference,
} from "../oohLargeFormatExpertGate"

test("threshold constant is 30 with documented interim semantics", () => {
  assert.equal(OOH_PANEL_LINE_EXPERT_THRESHOLD, 30)
  assert.equal(preferOohExpertView(30), false)
  assert.equal(preferOohExpertView(31), true)
  assert.equal(shouldShowOohLargeFormatSummary(30), false)
  assert.equal(shouldShowOohLargeFormatSummary(31), true)
})

test("≤30 panel lines → no expert preference; >30 → prefer expert", () => {
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      lineItemId: `mbaooh${i + 1}`,
      channel: "ooh" as const,
      attrs: { buy_granularity: "panel" as const },
    }))

  assert.equal(
    evaluateOohExpertPreference({ lineItems: mk(30) }).preferOohExpertView,
    false,
  )
  const over = evaluateOohExpertPreference({ lineItems: mk(31) })
  assert.equal(over.panelLineCount, 31)
  assert.equal(over.preferOohExpertView, true)
})

test("pack lines do not count toward the panel threshold", () => {
  const lineItems = [
    ...Array.from({ length: 40 }, (_, i) => ({
      lineItemId: `pack${i}`,
      channel: "ooh",
      attrs: { buy_granularity: "pack" as const },
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      lineItemId: `panel${i}`,
      channel: "ooh",
      attrs: { buy_granularity: "panel" as const },
    })),
  ]
  const r = evaluateOohExpertPreference({ lineItems })
  assert.equal(r.panelLineCount, 10)
  assert.equal(r.preferOohExpertView, false)
})

test("panel rows fallback counts when attrs missing", () => {
  const lineItems = Array.from({ length: 35 }, (_, i) => ({
    lineItemId: `li${i}`,
    channel: "ooh",
    attrs: {},
  }))
  const panels = lineItems.map((li) => ({
    lineItemId: li.lineItemId,
    buyGranularity: "panel" as const,
  }))
  assert.equal(countOohPanelGranularityLines(lineItems, panels), 35)
  assert.equal(
    evaluateOohExpertPreference({ lineItems, panels }).preferOohExpertView,
    true,
  )
})

test("session prefer flag write/consume opens expert path (affordance contract)", () => {
  // jsdom-less: simulate sessionStorage
  const store = new Map<string, string>()
  const prev = globalThis.sessionStorage
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    },
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: globalThis,
  })

  try {
    writeIngestOohExpertPreference(true)
    assert.equal(store.get("av-ingest-ooh-prefer-expert"), "1")
    assert.equal(store.get("av-builder-container-entry-mode"), "schedule")
    assert.equal(consumeIngestOohExpertPreference(), true)
    assert.equal(consumeIngestOohExpertPreference(), false)
  } finally {
    if (prev === undefined) {
      // @ts-expect-error cleanup
      delete globalThis.sessionStorage
      // @ts-expect-error cleanup
      delete globalThis.window
    } else {
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: prev,
      })
    }
  }
})
