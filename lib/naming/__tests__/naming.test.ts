import assert from "node:assert/strict"
import test from "node:test"
import { composeName, slugify } from "../compose.js"
import { parseName } from "../parse.js"
import { getTemplate, TEMPLATES } from "../templates.js"
import type { NamingTemplate } from "../types.js"
import { validateTemplates, validateValue } from "../validate.js"

function mustGet(platform: string, level: string): NamingTemplate {
  const t = getTemplate(platform, level)
  assert.ok(t, `missing template ${platform}/${level}`)
  return t
}

function expectedSlug(key: string, raw: string): string {
  if (key === "month_start") return raw.trim().toLowerCase()
  if (key === "campaign_name" || key === "io_name") return raw.trim().toLowerCase()
  return slugify(raw)
}

function assertRoundTrip(
  template: NamingTemplate,
  values: Record<string, string>,
  label: string,
): string {
  const composed = composeName(template, values)
  const parsed = parseName(template, composed)
  assert.ok(parsed, `${label}: parse returned null for "${composed}"`)

  for (const el of template.elements) {
    if (el.source === "literal") continue
    const raw = values[el.key]
    if (raw === undefined || raw === "") {
      assert.equal(
        parsed[el.key],
        undefined,
        `${label}: optional ${el.key} should be absent`,
      )
      continue
    }
    assert.equal(
      parsed[el.key],
      expectedSlug(el.key, raw),
      `${label}: round-trip mismatch for ${el.key}`,
    )
  }

  console.log(`  ✓ ${template.platform}/${template.level}: ${composed}`)
  return composed
}

// ---------------------------------------------------------------------------
// validateTemplates
// ---------------------------------------------------------------------------

test("validateTemplates() passes for law templates", () => {
  const issues = validateTemplates()
  assert.deepEqual(issues, [], `unexpected issues: ${JSON.stringify(issues)}`)
})

test("invariant: line_item_id off-terminal fails validator", () => {
  const grain = TEMPLATES.find((t) => t.isPacingGrain)
  assert.ok(grain)
  const withId = grain.elements.find((e) => e.isLineItemId)!
  const withoutId = grain.elements.filter((e) => !e.isLineItemId)
  const broken: NamingTemplate = {
    ...grain,
    elements: [...withoutId, withId, { key: "tail", source: "free" }],
  }
  const issues = validateTemplates([
    ...TEMPLATES.filter((t) => !(t.platform === grain.platform && t.level === grain.level)),
    broken,
  ])
  assert.ok(
    issues.some((i) => i.message.includes("terminal")),
    `expected terminal failure, got: ${JSON.stringify(issues)}`,
  )
})

// ---------------------------------------------------------------------------
// Round-trips for EVERY template
// ---------------------------------------------------------------------------

test("cm360 round-trips", () => {
  console.log("\nSmoke — composed examples per platform:")
  const campaign = mustGet("cm360", "campaign")
  assertRoundTrip(
    campaign,
    {
      brand: "jayco",
      campaign: "jayco001",
      mba: "mba123",
      month_start: "jan26",
    },
    "cm360/campaign",
  )

  assertRoundTrip(
    mustGet("cm360", "package"),
    {
      brand: "jayco",
      campaign: "jayco001",
      month_start: "jan26",
      publisher: "nine",
      media_type: "display",
      targeting: "retargeting",
    },
    "cm360/package",
  )

  assertRoundTrip(
    mustGet("cm360", "placement"),
    {
      brand: "jayco",
      campaign: "jayco001",
      publisher: "nine",
      media_type: "display",
      size: "300x250",
      targeting: "retargeting",
      line_item_id: "jayco001SM1",
    },
    "cm360/placement",
  )

  assertRoundTrip(
    mustGet("cm360", "ad"),
    {
      brand: "jayco",
      campaign: "jayco001",
      publisher: "nine",
      targeting: "retargeting",
      creative_name: "hero_static",
      size: "300x250",
    },
    "cm360/ad",
  )
})

test("dv360 round-trips", () => {
  assertRoundTrip(
    mustGet("dv360", "campaign"),
    {
      brand: "jayco",
      campaign: "jayco001",
      mba: "mba123",
      month_start: "jan26",
    },
    "dv360/campaign",
  )

  const io = mustGet("dv360", "insertion_order")
  assertRoundTrip(
    io,
    {
      brand: "jayco",
      campaign: "jayco001",
      media_type: "video",
    },
    "dv360/insertion_order without custom",
  )
  assertRoundTrip(
    io,
    {
      brand: "jayco",
      campaign: "jayco001",
      media_type: "video",
      custom: "prospecting",
    },
    "dv360/insertion_order with custom",
  )

  const li = mustGet("dv360", "line_item")
  assertRoundTrip(
    li,
    {
      brand: "jayco",
      campaign: "jayco001",
      media_type: "video",
      targeting: "in_market",
      line_item_id: "jayco001SM1",
    },
    "dv360/line_item without custom",
  )
  assertRoundTrip(
    li,
    {
      brand: "jayco",
      campaign: "jayco001",
      media_type: "video",
      targeting: "in_market",
      custom: "freq_cap",
      line_item_id: "jayco001SM1",
    },
    "dv360/line_item with custom",
  )

  const ioName = composeName(io, {
    brand: "jayco",
    campaign: "jayco001",
    media_type: "video",
    custom: "prospecting",
  })
  assertRoundTrip(
    mustGet("dv360", "ad"),
    { io_name: ioName, token: "v1" },
    "dv360/ad",
  )
})

test("youtube round-trips", () => {
  assertRoundTrip(
    mustGet("youtube", "campaign"),
    {
      brand: "jayco",
      campaign: "jayco001",
      mba: "mba123",
      month_start: "jan26",
    },
    "youtube/campaign",
  )

  const io = mustGet("youtube", "insertion_order")
  assertRoundTrip(
    io,
    { brand: "jayco", campaign: "jayco001", media_type: "video" },
    "youtube/insertion_order without custom",
  )
  assertRoundTrip(
    io,
    {
      brand: "jayco",
      campaign: "jayco001",
      media_type: "video",
      custom: "skippable",
    },
    "youtube/insertion_order with custom",
  )

  const li = mustGet("youtube", "line_item")
  assertRoundTrip(
    li,
    {
      brand: "jayco",
      campaign: "jayco001",
      media_type: "video",
      targeting: "affinity",
      line_item_id: "jayco001SM1",
    },
    "youtube/line_item without custom",
  )
  assertRoundTrip(
    li,
    {
      brand: "jayco",
      campaign: "jayco001",
      media_type: "video",
      targeting: "affinity",
      custom: "bumper",
      line_item_id: "jayco001SM1",
    },
    "youtube/line_item with custom",
  )

  const ioName = composeName(io, {
    brand: "jayco",
    campaign: "jayco001",
    media_type: "video",
  })
  assertRoundTrip(
    mustGet("youtube", "ad"),
    { io_name: ioName, token: "creative_a" },
    "youtube/ad",
  )
})

test("meta round-trips", () => {
  const campaign = mustGet("meta", "campaign")
  assertRoundTrip(
    campaign,
    {
      platform_code: "fbig",
      client: "jayco",
      campaign: "jayco001",
      timing: "fy26q1",
      objective: "traffic",
    },
    "meta/campaign without custom",
  )
  assertRoundTrip(
    campaign,
    {
      platform_code: "fb",
      client: "jayco",
      campaign: "jayco001",
      timing: "fy26q2",
      objective: "conversions",
      custom: "always_on",
    },
    "meta/campaign with custom",
  )

  const campaignName = composeName(campaign, {
    platform_code: "fbig",
    client: "jayco",
    campaign: "jayco001",
    timing: "fy26q1",
    objective: "traffic",
  })

  const adSet = mustGet("meta", "ad_set")
  assertRoundTrip(
    adSet,
    {
      campaign_name: campaignName,
      geo: "nsw",
      targeting: "lookalike",
      line_item_id: "jayco001SM1",
    },
    "meta/ad_set without custom",
  )
  assertRoundTrip(
    adSet,
    {
      campaign_name: campaignName,
      geo: "au",
      targeting: "lookalike",
      custom: "broad",
      line_item_id: "jayco001SM1",
    },
    "meta/ad_set with custom",
  )

  const ad = mustGet("meta", "ad")
  assertRoundTrip(
    ad,
    { creative_name: "hero_static", format: "static" },
    "meta/ad without custom",
  )
  assertRoundTrip(
    ad,
    { creative_name: "hero_video", format: "reel", custom: "ugc" },
    "meta/ad with custom",
  )
})

test("search round-trips", () => {
  const campaign = mustGet("search", "campaign")
  assertRoundTrip(
    campaign,
    {
      client: "jayco",
      campaign: "jayco001",
      match_context: "brand",
    },
    "search/campaign",
  )

  const campaignName = composeName(campaign, {
    client: "jayco",
    campaign: "jayco001",
    match_context: "brand",
  })

  assertRoundTrip(
    mustGet("search", "ad_group"),
    {
      campaign_name: campaignName,
      keyword_theme: "dealer_locator",
      line_item_id: "jayco001SM1",
    },
    "search/ad_group",
  )
})

test("native round-trips", () => {
  assertRoundTrip(
    mustGet("native", "campaign"),
    {
      brand: "jayco",
      campaign: "jayco001",
      mba: "mba123",
      month_start: "jan26",
      line_item_id: "jayco001SM1",
    },
    "native/campaign",
  )
})

test("every template has at least one round-trip coverage", () => {
  const covered = new Set(
    [
      "cm360/campaign",
      "cm360/package",
      "cm360/placement",
      "cm360/ad",
      "dv360/campaign",
      "dv360/insertion_order",
      "dv360/line_item",
      "dv360/ad",
      "youtube/campaign",
      "youtube/insertion_order",
      "youtube/line_item",
      "youtube/ad",
      "meta/campaign",
      "meta/ad_set",
      "meta/ad",
      "search/campaign",
      "search/ad_group",
      "native/campaign",
    ],
  )
  for (const t of TEMPLATES) {
    assert.ok(
      covered.has(`${t.platform}/${t.level}`),
      `missing round-trip coverage for ${t.platform}/${t.level}`,
    )
  }
})

// ---------------------------------------------------------------------------
// Negatives
// ---------------------------------------------------------------------------

test("negative: wrong element count → parse null", () => {
  const t = mustGet("cm360", "campaign")
  assert.equal(parseName(t, "jayco-jayco001-mba123"), null)
  assert.equal(parseName(t, "jayco-jayco001-mba123-jan26-extra"), null)
})

test("negative: bad month token → compose throws / validate fails", () => {
  const t = mustGet("cm360", "campaign")
  assert.throws(() =>
    composeName(t, {
      brand: "jayco",
      campaign: "jayco001",
      mba: "mba123",
      month_start: "2026-01",
    }),
  )
  const monthEl = t.elements.find((e) => e.key === "month_start")!
  assert.equal(validateValue(monthEl, "13xx").ok, false)
  assert.equal(validateValue(monthEl, "jan26").ok, true)
})

test("negative: foreign picklist value → validate fails / parse null", () => {
  const t = mustGet("cm360", "placement")
  const sizeEl = t.elements.find((e) => e.key === "size")!
  assert.equal(validateValue(sizeEl, "999x999").ok, false)

  const bad = "jayco-jayco001-nine-display-999x999-retargeting-jayco001SM1"
  assert.equal(parseName(t, bad), null)
})

test("optional handling: compose+parse with and without each optional", () => {
  const templatesWithOptionals = TEMPLATES.filter((t) =>
    t.elements.some((e) => e.optional),
  )
  assert.ok(templatesWithOptionals.length > 0)

  for (const t of templatesWithOptionals) {
    const optionals = t.elements.filter((e) => e.optional)
    for (const opt of optionals) {
      const base: Record<string, string> = {}
      for (const el of t.elements) {
        if (el.source === "literal") continue
        if (el.optional) continue
        if (el.key === "month_start") base[el.key] = "jan26"
        else if (el.key === "size") base[el.key] = "300x250"
        else if (el.key === "platform_code") base[el.key] = "fbig"
        else if (el.key === "timing") base[el.key] = "fy26q1"
        else if (el.key === "objective") base[el.key] = "traffic"
        else if (el.key === "geo") base[el.key] = "nsw"
        else if (el.key === "format") base[el.key] = "static"
        else if (el.key === "campaign_name" || el.key === "io_name") {
          // Build a minimal composite from sibling campaign/io template
          if (t.platform === "meta") {
            base[el.key] = composeName(mustGet("meta", "campaign"), {
              platform_code: "fbig",
              client: "jayco",
              campaign: "jayco001",
              timing: "fy26q1",
              objective: "traffic",
            })
          } else if (t.platform === "dv360" || t.platform === "youtube") {
            base[el.key] = composeName(mustGet(t.platform, "insertion_order"), {
              brand: "jayco",
              campaign: "jayco001",
              media_type: "video",
            })
          } else if (t.platform === "search") {
            base[el.key] = composeName(mustGet("search", "campaign"), {
              client: "jayco",
              campaign: "jayco001",
              match_context: "brand",
            })
          }
        } else if (el.key === "line_item_id") base[el.key] = "jayco001SM1"
        else if (el.key === "token") base[el.key] = "v1"
        else if (el.key === "match_context") base[el.key] = "brand"
        else if (el.key === "keyword_theme") base[el.key] = "theme"
        else if (el.key === "creative_name") base[el.key] = "creative"
        else if (el.key === "media_type") base[el.key] = "display"
        else if (el.key === "targeting") base[el.key] = "prospecting"
        else if (el.key === "publisher") base[el.key] = "nine"
        else if (el.key === "client") base[el.key] = "jayco"
        else if (el.key === "brand") base[el.key] = "jayco"
        else if (el.key === "campaign") base[el.key] = "jayco001"
        else if (el.key === "mba") base[el.key] = "mba123"
        else base[el.key] = "x"
      }

      // without optional
      assertRoundTrip(t, base, `${t.platform}/${t.level} without ${opt.key}`)

      // with optional
      assertRoundTrip(
        t,
        { ...base, [opt.key]: "opt_value" },
        `${t.platform}/${t.level} with ${opt.key}`,
      )
    }
  }
})
