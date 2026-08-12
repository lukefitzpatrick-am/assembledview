/**
 * Timing report — standard OOH card list vs summary (F-28-style microbench).
 * Uses the repo vitest + performance.now pattern from expertGridRowPerf.bench;
 * does not invent Playwright. Full OOHContainer mount is too coupled for a
 * bench; we measure the N-card shell cost the standard path would pay.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  OOH_PANEL_LINE_EXPERT_THRESHOLD,
  shouldShowOohLargeFormatSummary,
} from "@/lib/mediaplans/ingest/oohLargeFormatExpertGate"

type CardProps = { id: string; label: string; onSelect: () => void }

function SyntheticOohCard({ id, label, onSelect }: CardProps) {
  return (
    <div data-testid={`ooh-card-${id}`} className="rounded-card border p-4">
      <button type="button" onClick={onSelect}>
        {label}
      </button>
      <div className="grid grid-cols-4 gap-2 text-sm">
        <span>Network</span>
        <span>Buy Type</span>
        <span>Format</span>
        <span>Bursts</span>
      </div>
    </div>
  )
}

function StandardOohCardList({
  count,
  onInteract,
}: {
  count: number
  onInteract: (i: number) => void
}) {
  if (shouldShowOohLargeFormatSummary(count)) {
    return (
      <div data-testid="ooh-summary">
        <p>
          <span className="num">{count}</span> large-format panel lines
        </p>
        <button type="button" onClick={() => onInteract(-1)}>
          Open expert view
        </button>
      </div>
    )
  }
  return (
    <div data-testid="ooh-card-list">
      {Array.from({ length: count }, (_, i) => (
        <SyntheticOohCard
          key={i}
          id={`r${i}`}
          label={`Line ${i + 1}`}
          onSelect={() => onInteract(i)}
        />
      ))}
    </div>
  )
}

describe("OOH standard container timing (100 / 300)", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function renderCount(count: number): {
    renderMs: number
    interactMs: number
    mode: "cards" | "summary"
  } {
    let last = -2
    const t0 = performance.now()
    act(() => {
      root.render(
        <StandardOohCardList count={count} onInteract={(i) => { last = i }} />,
      )
    })
    const renderMs = performance.now() - t0

    const summary = container.querySelector('[data-testid="ooh-summary"]')
    const cards = container.querySelector('[data-testid="ooh-card-list"]')
    const mode: "cards" | "summary" = summary ? "summary" : "cards"

    const t1 = performance.now()
    act(() => {
      if (summary) {
        ;(summary.querySelector("button") as HTMLButtonElement).click()
      } else {
        const buttons = cards!.querySelectorAll("button")
        const lastBtn = buttons[buttons.length - 1] as HTMLButtonElement
        lastBtn.click()
      }
    })
    const interactMs = performance.now() - t1

    if (mode === "summary") {
      expect(last).toBe(-1)
    } else {
      expect(last).toBe(count - 1)
    }

    return { renderMs, interactMs, mode }
  }

  it("reports 100 and 300; summary path used above threshold", () => {
    // Force card path for 100 by staying at threshold boundary for cards:
    // countOohPanelGranularity uses >30 for summary. For timing of cards we
    // temporarily render with a count that would be cards if under threshold.
    // Measure both: cards at 30 (max card path) and the real 100/300 summary,
    // plus a forced card render at 100/300 via direct SyntheticOohCard map.

    const atThreshold = renderCount(OOH_PANEL_LINE_EXPERT_THRESHOLD)
    expect(atThreshold.mode).toBe("cards")

    const n100 = renderCount(100)
    expect(n100.mode).toBe("summary")
    const n300 = renderCount(300)
    expect(n300.mode).toBe("summary")

    // Forced card mounts at 100 / 300 — the pain the interim rule avoids.
    function forceCards(count: number) {
      let clicked = -1
      const t0 = performance.now()
      act(() => {
        root.render(
          <div>
            {Array.from({ length: count }, (_, i) => (
              <SyntheticOohCard
                key={i}
                id={`f${i}`}
                label={`F${i}`}
                onSelect={() => {
                  clicked = i
                }}
              />
            ))}
          </div>,
        )
      })
      const renderMs = performance.now() - t0
      const t1 = performance.now()
      act(() => {
        const buttons = container.querySelectorAll("button")
        ;(buttons[buttons.length - 1] as HTMLButtonElement).click()
      })
      const interactMs = performance.now() - t1
      expect(clicked).toBe(count - 1)
      return { renderMs, interactMs }
    }

    const cards100 = forceCards(100)
    const cards300 = forceCards(300)

    // eslint-disable-next-line no-console
    console.log(
      [
        "[OOH standard timing]",
        `threshold_cards_n=${OOH_PANEL_LINE_EXPERT_THRESHOLD} render_ms=${atThreshold.renderMs.toFixed(1)} interact_ms=${atThreshold.interactMs.toFixed(1)}`,
        `summary_100 render_ms=${n100.renderMs.toFixed(1)} interact_ms=${n100.interactMs.toFixed(1)}`,
        `summary_300 render_ms=${n300.renderMs.toFixed(1)} interact_ms=${n300.interactMs.toFixed(1)}`,
        `forced_cards_100 render_ms=${cards100.renderMs.toFixed(1)} interact_ms=${cards100.interactMs.toFixed(1)}`,
        `forced_cards_300 render_ms=${cards300.renderMs.toFixed(1)} interact_ms=${cards300.interactMs.toFixed(1)}`,
      ].join(" | "),
    )

    // Sanity: forced 300 cards should be slower to render than summary.
    expect(cards300.renderMs).toBeGreaterThan(n300.renderMs)
  })
})
