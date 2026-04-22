import assert from "node:assert/strict"
import test from "node:test"

import { AV_HOUSE_PALETTE } from "../palette"
import { buildClientTheme, getChartPalette } from "../theme"

test("buildClientTheme: null client uses AV primary default and derived dark/tint", () => {
  const theme = buildClientTheme(null)
  assert.equal(theme.primary, "#1a2b78")
  assert.equal(theme.name, "")
  assert.equal("subName" in theme, false)
  assert.equal("logoUrl" in theme, false)
  assert.match(theme.primaryDark, /^#[0-9a-f]{6}$/i)
  assert.match(theme.primaryTint, /^#[0-9a-f]{6}$/i)
})

test("buildClientTheme: partial client keeps defaults for missing brand colours", () => {
  const theme = buildClientTheme({
    name: "Acme",
    sub_name: "FY26",
    brand_primary_hex: null,
  })
  assert.equal(theme.primary, "#1a2b78")
  assert.equal(theme.name, "Acme")
  assert.equal(theme.subName, "FY26")
})

test("buildClientTheme: full client maps snake_case fields and explicit tint", () => {
  const theme = buildClientTheme({
    name: "Globex",
    sub_name: "APAC",
    dashboard_logo_url: "https://example.com/logo.png",
    brand_primary_hex: "#112233",
    brand_primary_dark_hex: "#001122",
    brand_primary_tint_hex: "#aabbcc",
  })
  assert.equal(theme.primary, "#112233")
  assert.equal(theme.primaryDark, "#001122")
  assert.equal(theme.primaryTint, "#aabbcc")
  assert.equal(theme.name, "Globex")
  assert.equal(theme.subName, "APAC")
  assert.equal(theme.logoUrl, "https://example.com/logo.png")
})

test("buildClientTheme: auto-derives primaryTint when tint omitted", () => {
  const theme = buildClientTheme({
    name: "TintCo",
    brand_primary_hex: "#0000FF",
  })
  assert.equal(theme.primary, "#0000ff")
  assert.notEqual(theme.primaryTint, theme.primary)
  assert.match(theme.primaryTint, /^#[0-9a-f]{6}$/i)
})

test("getChartPalette: dedupes case-insensitively when primary matches house palette", () => {
  const theme = buildClientTheme({
    name: "Dup",
    brand_primary_hex: "#3A7AB6",
  })
  const palette = getChartPalette(theme)
  assert.equal(palette[0], "#3a7ab6")
  const lowered = palette.map((h) => h.toLowerCase())
  assert.equal(new Set(lowered).size, lowered.length)
  assert.equal(palette.length, AV_HOUSE_PALETTE.length)
})
