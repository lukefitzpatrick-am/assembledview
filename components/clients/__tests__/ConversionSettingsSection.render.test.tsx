/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import {
  ConversionSettingsSection,
  choicesFromRows,
  mergePickerRows,
} from "../ConversionSettingsSection"

describe("ConversionSettingsSection", () => {
  it("renders the switch, headline and revenue controls", () => {
    const html = renderToStaticMarkup(<ConversionSettingsSection clientId={1} />)
    expect(html).toContain("Conversions")
    expect(html).toContain("Show conversions")
    expect(html).toContain("Show revenue and ROAS")
    expect(html).toContain('id="conversion-settings"')
  })

  it("merges seen events with saved choices and keeps saved labels", () => {
    const rows = mergePickerRows(
      [
        { platform: "meta_ads", eventKey: "purchase", eventName: "purchase", eventCategory: "purchase", conversions: 10, conversionValue: 900, lineCount: 1 },
        { platform: "meta_ads", eventKey: "add_to_cart", eventName: "add_to_cart", eventCategory: "other", conversions: 50, conversionValue: 4000, lineCount: 1 },
      ],
      [{ platform: "meta_ads", eventKey: "purchase", label: "Sales", category: "purchase", includeValue: true }],
    )
    expect(rows[0]?.eventKey).toBe("purchase")
    expect(rows[0]?.chosen).toBe(true)
    expect(rows[0]?.label).toBe("Sales")
    expect(choicesFromRows(rows)).toEqual([
      { platform: "meta_ads", eventKey: "purchase", label: "Sales", category: "purchase", includeValue: true },
    ])
  })

  it("drops include value on events that cannot carry value", () => {
    const rows = mergePickerRows([], [
      { platform: "meta_ads", eventKey: "add_to_cart", label: null, category: "purchase", includeValue: true },
    ])
    expect(choicesFromRows(rows)[0]?.includeValue).toBe(false)
  })
})
