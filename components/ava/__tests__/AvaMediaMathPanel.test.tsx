/**
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BUY_TYPES_WITH_DERIVED_DELIVERABLES } from "@/lib/mediaplan/deliverableBudget"
import { solveMediaMath } from "@/lib/mediaplan/solveMediaMath"
import { formatAUD, formatRate } from "@/lib/format/money"

import {
  AvaMediaMathPanel,
  type AvaMediaMathPanelProps,
} from "../AvaMediaMathPanel"

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event("change", { bubbles: true }))
}

function field(container: HTMLElement, name: "budget" | "rate" | "deliverables" | "weeks" | "months") {
  return container.querySelector<HTMLInputElement>(`[data-testid="ava-math-${name}"]`)
}

function buyTypeSelect(container: HTMLElement) {
  return container.querySelector<HTMLSelectElement>('[data-testid="ava-math-buy-type"]')
}

function resultEl(container: HTMLElement) {
  return container.querySelector('[data-testid="ava-math-result"]')
}

function reasonOf(input: Parameters<typeof solveMediaMath>[0]) {
  const r = solveMediaMath(input)
  if (r.ok) throw new Error(`expected refusal, got ok: ${r.solvedValue}`)
  return r.reason
}

describe("AvaMediaMathPanel", () => {
  let container: HTMLDivElement
  let root: Root
  let onPrefillComposer: ReturnType<typeof vi.fn<(text: string) => void>>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    onPrefillComposer = vi.fn()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function render(extra?: Record<string, unknown>) {
    act(() => {
      root.render(
        <AvaMediaMathPanel onPrefillComposer={onPrefillComposer} {...extra} />,
      )
    })
  }

  function chooseBuyType(buyType: string) {
    const select = buyTypeSelect(container)
    expect(select).toBeTruthy()
    act(() => {
      setSelectValue(select!, buyType)
    })
  }

  function fill(name: "budget" | "rate" | "deliverables" | "weeks" | "months", value: string) {
    const input = field(container, name)
    expect(input).toBeTruthy()
    act(() => {
      setInputValue(input!, value)
    })
  }

  it("declares no form-setter props — only onPrefillComposer", () => {
    type Keys = keyof AvaMediaMathPanelProps
    const allowed: Keys[] = ["onPrefillComposer"]
    type Extra = Exclude<Keys, "onPrefillComposer">
    const noExtra: Extra extends never ? true : false = true
    expect(noExtra).toBe(true)
    expect(allowed).toEqual(["onPrefillComposer"])
    expect(allowed).not.toEqual(expect.arrayContaining(["setValue", "setLineItems", "onApply"]))
  })

  it("populates buy type from BUY_TYPES_WITH_DERIVED_DELIVERABLES with no hardcoded list", () => {
    render()
    const select = buyTypeSelect(container)!
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toEqual([...BUY_TYPES_WITH_DERIVED_DELIVERABLES])
  })

  it("cpm: budget 50000 + rate 12.50 → 4,000,000 impressions", () => {
    render()
    chooseBuyType("cpm")
    fill("budget", "50000")
    fill("rate", "12.50")
    const solved = solveMediaMath({ buyType: "cpm", budget: 50_000, rate: 12.5 })
    expect(solved.ok).toBe(true)
    if (!solved.ok) return
    expect(solved.solvedValue).toBe(4_000_000)
    const text = resultEl(container)?.textContent ?? ""
    expect(text).toContain("4,000,000")
    expect(text).not.toMatch(/\bNaN\b/)
    expect(text).not.toMatch(/\bInfinity\b/)
    expect(text).toContain(solved.formula)
    for (const note of solved.roundingApplied) {
      expect(text).toContain(note)
    }
    const deliverables = field(container, "deliverables")
    expect(deliverables?.readOnly).toBe(true)
  })

  it("cpm: deliverables 2,000,000 + budget 30000 → rate 15.00", () => {
    render()
    chooseBuyType("cpm")
    fill("deliverables", "2000000")
    fill("budget", "30000")
    const solved = solveMediaMath({
      buyType: "cpm",
      budget: 30_000,
      deliverables: 2_000_000,
    })
    expect(solved.ok).toBe(true)
    if (!solved.ok) return
    expect(solved.solvedValue).toBe(15)
    const text = resultEl(container)?.textContent ?? ""
    expect(text).toContain(formatRate(15))
    expect(text).toContain(solved.formula)
    expect(field(container, "rate")?.readOnly).toBe(true)
  })

  it("cpc: budget 10000 + rate 2.50 → 4,000 clicks", () => {
    render()
    chooseBuyType("cpc")
    fill("budget", "10000")
    fill("rate", "2.50")
    const text = resultEl(container)?.textContent ?? ""
    expect(text).toContain("4,000")
    expect(text).toContain(
      solveMediaMath({ buyType: "cpc", budget: 10_000, rate: 2.5 }).ok
        ? (solveMediaMath({ buyType: "cpc", budget: 10_000, rate: 2.5 }) as { formula: string }).formula
        : "",
    )
  })

  it("cpv: budget 5000 + rate 0.05 → 100,000 views", () => {
    render()
    chooseBuyType("cpv")
    fill("budget", "5000")
    fill("rate", "0.05")
    expect(resultEl(container)?.textContent).toContain("100,000")
  })

  it("spots: budget 12000 + rate 500 → 24 spots", () => {
    render()
    chooseBuyType("spots")
    fill("budget", "12000")
    fill("rate", "500")
    expect(resultEl(container)?.textContent).toMatch(/\b24\b/)
  })

  it("weekly_rate with weeks: rate 1000 + 4 weeks → budget $4,000.00", () => {
    render()
    chooseBuyType("weekly_rate")
    expect(field(container, "weeks")).toBeTruthy()
    expect(field(container, "months")).toBeNull()
    fill("rate", "1000")
    fill("weeks", "4")
    const text = resultEl(container)?.textContent ?? ""
    expect(text).toContain(formatAUD(4_000))
    const solved = solveMediaMath({ buyType: "weekly_rate", rate: 1_000, weeks: 4 })
    expect(solved.ok).toBe(true)
    if (solved.ok) expect(text).toContain(solved.formula)
  })

  it("monthly_rate with months: budget 8000 + 2 months → rate $4,000.00", () => {
    render()
    chooseBuyType("monthly_rate")
    expect(field(container, "months")).toBeTruthy()
    expect(field(container, "weeks")).toBeNull()
    fill("budget", "8000")
    fill("months", "2")
    const text = resultEl(container)?.textContent ?? ""
    expect(text).toContain(formatRate(4_000))
  })

  it("hides weeks/months except for weekly_rate / monthly_rate", () => {
    render()
    chooseBuyType("cpm")
    expect(field(container, "weeks")).toBeNull()
    expect(field(container, "months")).toBeNull()
  })

  it("renders the solver reason for three inputs", () => {
    render()
    chooseBuyType("cpm")
    fill("budget", "50000")
    fill("rate", "12.50")
    fill("deliverables", "4000000")
    expect(resultEl(container)?.textContent).toBe(
      reasonOf({ buyType: "cpm", budget: 50_000, rate: 12.5, deliverables: 4_000_000 }),
    )
  })

  it("renders the solver reason for one input", () => {
    render()
    chooseBuyType("cpm")
    fill("budget", "50000")
    expect(resultEl(container)?.textContent).toBe(reasonOf({ buyType: "cpm", budget: 50_000 }))
  })

  it("renders the solver reason for rate 0", () => {
    render()
    chooseBuyType("cpm")
    fill("budget", "50000")
    fill("rate", "0")
    expect(resultEl(container)?.textContent).toBe(
      reasonOf({ buyType: "cpm", budget: 50_000, rate: 0 }),
    )
  })

  it("renders the solver reason for negative budget", () => {
    render()
    chooseBuyType("cpm")
    fill("budget", "-50000")
    fill("rate", "12.50")
    expect(resultEl(container)?.textContent).toBe(
      reasonOf({ buyType: "cpm", budget: -50_000, rate: 12.5 }),
    )
  })

  it("renders the solver reason for a buy type outside the derived set", () => {
    render()
    const select = buyTypeSelect(container)!
    const opt = document.createElement("option")
    opt.value = "bonus"
    opt.textContent = "bonus"
    select.appendChild(opt)
    act(() => {
      setSelectValue(select, "bonus")
    })
    fill("budget", "50000")
    fill("rate", "12.50")
    expect(resultEl(container)?.textContent).toBe(
      reasonOf({ buyType: "bonus", budget: 50_000, rate: 12.5 }),
    )
  })

  it("never shows NaN, Infinity, or a blank result slot", () => {
    render()
    const empty = resultEl(container)?.textContent ?? ""
    expect(empty.length).toBeGreaterThan(0)
    expect(empty).not.toMatch(/\bNaN\b/)
    expect(empty).not.toMatch(/\bInfinity\b/)
    chooseBuyType("cpm")
    fill("budget", "50000")
    fill("rate", "12.50")
    const okText = resultEl(container)?.textContent ?? ""
    expect(okText.length).toBeGreaterThan(0)
    expect(okText).not.toMatch(/\bNaN\b/)
    expect(okText).not.toMatch(/\bInfinity\b/)
  })

  it("Send to Ava prefills the composer and does not send or write the form", () => {
    render()
    chooseBuyType("cpm")
    fill("budget", "50000")
    fill("rate", "12.50")
    const button = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "Send to Ava",
    )
    expect(button).toBeTruthy()
    act(() => {
      button!.click()
    })
    expect(onPrefillComposer).toHaveBeenCalledTimes(1)
    const sentence = String(onPrefillComposer.mock.calls[0]?.[0] ?? "")
    expect(sentence.length).toBeGreaterThan(0)
    expect(sentence).toMatch(/cpm/i)
    expect(sentence).toContain("4,000,000")
    expect(sentence).not.toMatch(/setValue|setLineItems|apply_form_patch/i)
  })
})
