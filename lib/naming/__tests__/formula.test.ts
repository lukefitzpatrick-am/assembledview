import assert from "node:assert/strict"
import test from "node:test"

import { composeName, slugify } from "../compose.js"
import {
  composeFormula,
  evaluateNamingFormula,
} from "../formula.js"
import { getTemplate } from "../templates.js"
import type { NamingTemplate } from "../types.js"

function mustGet(platform: string, level: string): NamingTemplate {
  const t = getTemplate(platform, level)
  assert.ok(t, `missing template ${platform}/${level}`)
  return t
}

const INPUT = "'Input sheet'"

/** Shared fixed row — Input sheet absolutes + per-row + local cells. */
const FIXED_ROW = {
  brand: `${INPUT}!$B$1`,
  campaign: `${INPUT}!$B$2`,
  mba: `${INPUT}!$B$3`,
  month_start: `${INPUT}!$B$4`,
  client: `${INPUT}!$B$5`,
  publisher: `${INPUT}!$A$7`,
  media_type: `${INPUT}!$B$7`,
  line_item_id: `${INPUT}!$C$7`,
  targeting: `${INPUT}!$E$7`, // targeting_token column
  geo: `${INPUT}!$F$7`, // geo_token column
  creative_name: `${INPUT}!$G$7`,
  buy_type: `${INPUT}!$H$7`,
  size: "$C14",
  custom: "$D14",
  token: "$E14",
  campaign_name: "$B10",
  keyword_theme: "$C14",
  platform_code: "$A14",
  timing: "$B14",
  objective: "$C14",
  format: "$D14",
  match_context: "$C14",
} as const

test("composeFormula: CM360 placement includes size (local) + terminal line_item_id", () => {
  const template = mustGet("cm360", "placement")
  const formula = composeFormula(template, {
    brand: FIXED_ROW.brand,
    campaign: FIXED_ROW.campaign,
    publisher: FIXED_ROW.publisher,
    media_type: FIXED_ROW.media_type,
    size: FIXED_ROW.size,
    targeting: FIXED_ROW.targeting,
    line_item_id: FIXED_ROW.line_item_id,
  })

  assert.equal(
    formula,
    `=LOWER(${FIXED_ROW.brand}&"-"&${FIXED_ROW.campaign}&"-"&${FIXED_ROW.publisher}&"-"&${FIXED_ROW.media_type}&"-"&${FIXED_ROW.size}&"-"&${FIXED_ROW.targeting}&"-"&${FIXED_ROW.line_item_id})`,
  )
  assert.ok(formula.endsWith(`&${FIXED_ROW.line_item_id})`))
  assert.ok(formula.includes(`&"-"&${FIXED_ROW.size}&"-"`))
})

test("composeFormula: DV360 line_item wraps optional custom in IF (no dangling separator)", () => {
  const template = mustGet("dv360", "line_item")
  const formula = composeFormula(template, {
    brand: FIXED_ROW.brand,
    campaign: FIXED_ROW.campaign,
    media_type: FIXED_ROW.media_type,
    targeting: FIXED_ROW.targeting,
    custom: FIXED_ROW.custom,
    line_item_id: FIXED_ROW.line_item_id,
  })

  assert.equal(
    formula,
    `=LOWER(${FIXED_ROW.brand}&"-"&${FIXED_ROW.campaign}&"-"&${FIXED_ROW.media_type}&"-"&${FIXED_ROW.targeting}&IF(${FIXED_ROW.custom}<>"","-"&${FIXED_ROW.custom},"")&"-"&${FIXED_ROW.line_item_id})`,
  )
})

test("composeFormula: YouTube line_item mirrors DV360 IF + terminal id", () => {
  const template = mustGet("youtube", "line_item")
  const formula = composeFormula(template, {
    brand: FIXED_ROW.brand,
    campaign: FIXED_ROW.campaign,
    media_type: FIXED_ROW.media_type,
    targeting: FIXED_ROW.targeting,
    custom: FIXED_ROW.custom,
    line_item_id: FIXED_ROW.line_item_id,
  })

  assert.equal(
    formula,
    `=LOWER(${FIXED_ROW.brand}&"-"&${FIXED_ROW.campaign}&"-"&${FIXED_ROW.media_type}&"-"&${FIXED_ROW.targeting}&IF(${FIXED_ROW.custom}<>"","-"&${FIXED_ROW.custom},"")&"-"&${FIXED_ROW.line_item_id})`,
  )
})

test("composeFormula: YouTube campaign uses quoted literal youtube", () => {
  const template = mustGet("youtube", "campaign")
  const formula = composeFormula(template, {
    brand: FIXED_ROW.brand,
    campaign: FIXED_ROW.campaign,
    mba: FIXED_ROW.mba,
    month_start: FIXED_ROW.month_start,
  })
  assert.equal(
    formula,
    `=LOWER(${FIXED_ROW.brand}&"-"&${FIXED_ROW.campaign}&"-"&${FIXED_ROW.mba}&"-"&${FIXED_ROW.month_start}&"-"&"youtube")`,
  )
})

test("composeFormula: Meta ad_set — composite campaign_name, geo, optional custom, terminal id", () => {
  const template = mustGet("meta", "ad_set")
  const formula = composeFormula(template, {
    campaign_name: FIXED_ROW.campaign_name,
    geo: FIXED_ROW.geo,
    targeting: FIXED_ROW.targeting,
    custom: FIXED_ROW.custom,
    line_item_id: FIXED_ROW.line_item_id,
  })

  // geo is free() — wrap in IF so a blank cell does not leave a dangling separator
  assert.equal(
    formula,
    `=LOWER(${FIXED_ROW.campaign_name}&IF(${FIXED_ROW.geo}<>"","-"&${FIXED_ROW.geo},"")&"-"&${FIXED_ROW.targeting}&IF(${FIXED_ROW.custom}<>"","-"&${FIXED_ROW.custom},"")&"-"&${FIXED_ROW.line_item_id})`,
  )
})

test("composeFormula: Search ad_group — campaign_name + keyword_theme IF + terminal id", () => {
  const template = mustGet("search", "ad_group")
  const formula = composeFormula(template, {
    campaign_name: FIXED_ROW.campaign_name,
    keyword_theme: FIXED_ROW.keyword_theme,
    line_item_id: FIXED_ROW.line_item_id,
  })

  assert.equal(
    formula,
    `=LOWER(${FIXED_ROW.campaign_name}&IF(${FIXED_ROW.keyword_theme}<>"","-"&${FIXED_ROW.keyword_theme},"")&"-"&${FIXED_ROW.line_item_id})`,
  )
})

test("composeFormula: optional without ref is omitted (same as empty optional in composeName)", () => {
  const template = mustGet("dv360", "line_item")
  const formula = composeFormula(template, {
    brand: FIXED_ROW.brand,
    campaign: FIXED_ROW.campaign,
    media_type: FIXED_ROW.media_type,
    targeting: FIXED_ROW.targeting,
    line_item_id: FIXED_ROW.line_item_id,
    // custom omitted
  })
  assert.equal(
    formula,
    `=LOWER(${FIXED_ROW.brand}&"-"&${FIXED_ROW.campaign}&"-"&${FIXED_ROW.media_type}&"-"&${FIXED_ROW.targeting}&"-"&${FIXED_ROW.line_item_id})`,
  )
  assert.ok(!formula.includes("IF("))
})

test("parity: composeName === evaluated composeFormula for fixed row (slugified cells)", () => {
  const cases: Array<{
    platform: string
    level: string
    values: Record<string, string>
    refs: Record<string, string>
    cells: Record<string, string>
  }> = [
    {
      platform: "cm360",
      level: "placement",
      values: {
        brand: "Jayco",
        campaign: "Jayco 001",
        publisher: "Nine",
        media_type: "display",
        size: "300x250",
        targeting: "Retargeting",
        line_item_id: "jayco001SM1",
      },
      refs: {
        brand: FIXED_ROW.brand,
        campaign: FIXED_ROW.campaign,
        publisher: FIXED_ROW.publisher,
        media_type: FIXED_ROW.media_type,
        size: FIXED_ROW.size,
        targeting: FIXED_ROW.targeting,
        line_item_id: FIXED_ROW.line_item_id,
      },
      cells: {
        [FIXED_ROW.brand]: slugify("Jayco"),
        [FIXED_ROW.campaign]: slugify("Jayco 001"),
        [FIXED_ROW.publisher]: slugify("Nine"),
        [FIXED_ROW.media_type]: slugify("display"),
        [FIXED_ROW.size]: slugify("300x250"),
        [FIXED_ROW.targeting]: slugify("Retargeting"),
        [FIXED_ROW.line_item_id]: slugify("jayco001SM1"),
      },
    },
    {
      platform: "dv360",
      level: "line_item",
      values: {
        brand: "Jayco",
        campaign: "Jayco 001",
        media_type: "video",
        targeting: "In Market",
        custom: "Prospecting",
        line_item_id: "jayco001SM1",
      },
      refs: {
        brand: FIXED_ROW.brand,
        campaign: FIXED_ROW.campaign,
        media_type: FIXED_ROW.media_type,
        targeting: FIXED_ROW.targeting,
        custom: FIXED_ROW.custom,
        line_item_id: FIXED_ROW.line_item_id,
      },
      cells: {
        [FIXED_ROW.brand]: slugify("Jayco"),
        [FIXED_ROW.campaign]: slugify("Jayco 001"),
        [FIXED_ROW.media_type]: slugify("video"),
        [FIXED_ROW.targeting]: slugify("In Market"),
        [FIXED_ROW.custom]: slugify("Prospecting"),
        [FIXED_ROW.line_item_id]: slugify("jayco001SM1"),
      },
    },
    {
      platform: "dv360",
      level: "line_item",
      values: {
        brand: "Jayco",
        campaign: "Jayco 001",
        media_type: "video",
        targeting: "In Market",
        line_item_id: "jayco001SM1",
      },
      refs: {
        brand: FIXED_ROW.brand,
        campaign: FIXED_ROW.campaign,
        media_type: FIXED_ROW.media_type,
        targeting: FIXED_ROW.targeting,
        custom: FIXED_ROW.custom,
        line_item_id: FIXED_ROW.line_item_id,
      },
      cells: {
        [FIXED_ROW.brand]: slugify("Jayco"),
        [FIXED_ROW.campaign]: slugify("Jayco 001"),
        [FIXED_ROW.media_type]: slugify("video"),
        [FIXED_ROW.targeting]: slugify("In Market"),
        [FIXED_ROW.custom]: "", // blank optional — IF drops separator
        [FIXED_ROW.line_item_id]: slugify("jayco001SM1"),
      },
    },
    {
      platform: "youtube",
      level: "line_item",
      values: {
        brand: "Jayco",
        campaign: "Jayco 001",
        media_type: "video",
        targeting: "Affinity",
        line_item_id: "jayco001YT1",
      },
      refs: {
        brand: FIXED_ROW.brand,
        campaign: FIXED_ROW.campaign,
        media_type: FIXED_ROW.media_type,
        targeting: FIXED_ROW.targeting,
        custom: FIXED_ROW.custom,
        line_item_id: FIXED_ROW.line_item_id,
      },
      cells: {
        [FIXED_ROW.brand]: slugify("Jayco"),
        [FIXED_ROW.campaign]: slugify("Jayco 001"),
        [FIXED_ROW.media_type]: slugify("video"),
        [FIXED_ROW.targeting]: slugify("Affinity"),
        [FIXED_ROW.custom]: "",
        [FIXED_ROW.line_item_id]: slugify("jayco001YT1"),
      },
    },
    {
      platform: "meta",
      level: "ad_set",
      values: {
        campaign_name: "fbig-jayco-jayco001-fy26q1-awareness",
        geo: "nsw",
        targeting: "lookalike",
        line_item_id: "jayco001SM1",
      },
      refs: {
        campaign_name: FIXED_ROW.campaign_name,
        geo: FIXED_ROW.geo,
        targeting: FIXED_ROW.targeting,
        custom: FIXED_ROW.custom,
        line_item_id: FIXED_ROW.line_item_id,
      },
      cells: {
        [FIXED_ROW.campaign_name]: "fbig-jayco-jayco001-fy26q1-awareness",
        [FIXED_ROW.geo]: slugify("nsw"),
        [FIXED_ROW.targeting]: slugify("lookalike"),
        [FIXED_ROW.custom]: "",
        [FIXED_ROW.line_item_id]: slugify("jayco001SM1"),
      },
    },
    {
      platform: "search",
      level: "ad_group",
      values: {
        campaign_name: "jayco-jayco001-search-brand",
        keyword_theme: "brand_terms",
        line_item_id: "jayco001SE1",
      },
      refs: {
        campaign_name: FIXED_ROW.campaign_name,
        keyword_theme: FIXED_ROW.keyword_theme,
        line_item_id: FIXED_ROW.line_item_id,
      },
      cells: {
        [FIXED_ROW.campaign_name]: "jayco-jayco001-search-brand",
        [FIXED_ROW.keyword_theme]: slugify("brand_terms"),
        [FIXED_ROW.line_item_id]: slugify("jayco001SE1"),
      },
    },
  ]

  for (const c of cases) {
    const template = mustGet(c.platform, c.level)
    const expected = composeName(template, c.values)
    const formula = composeFormula(template, c.refs)
    const evaluated = evaluateNamingFormula(formula, c.cells)
    assert.equal(
      evaluated,
      expected,
      `${c.platform}/${c.level}: formula eval !== composeName\nformula=${formula}\neval=${evaluated}\ncompose=${expected}`,
    )
  }
})

test("composeFormula: required free match_context uses IF (no dangling separator while blank)", () => {
  const template = mustGet("search", "campaign")
  const matchEl = template.elements.find((e) => e.key === "match_context")
  assert.ok(matchEl)
  assert.equal(matchEl.source, "free")
  assert.equal(matchEl.optional, undefined)

  const formula = composeFormula(template, {
    client: FIXED_ROW.client,
    campaign: FIXED_ROW.campaign,
    match_context: FIXED_ROW.match_context,
  })
  assert.equal(
    formula,
    `=LOWER(${FIXED_ROW.client}&"-"&${FIXED_ROW.campaign}&"-"&"search"&IF(${FIXED_ROW.match_context}<>"","-"&${FIXED_ROW.match_context},""))`,
  )

  const cellsBlank = {
    [FIXED_ROW.client]: "jayco",
    [FIXED_ROW.campaign]: "jayco001",
    [FIXED_ROW.match_context]: "",
  }
  assert.equal(
    evaluateNamingFormula(formula, cellsBlank),
    "jayco-jayco001-search",
  )

  const cellsFilled = {
    ...cellsBlank,
    [FIXED_ROW.match_context]: "brand",
  }
  assert.equal(
    evaluateNamingFormula(formula, cellsFilled),
    "jayco-jayco001-search-brand",
  )
  assert.equal(
    evaluateNamingFormula(formula, cellsFilled),
    composeName(template, {
      client: "jayco",
      campaign: "jayco001",
      match_context: "brand",
    }),
  )
})

test("composeFormula: required free token on DV360/YouTube ad uses IF (no dangling separator)", () => {
  for (const platform of ["dv360", "youtube"] as const) {
    const template = mustGet(platform, "ad")
    const tokenEl = template.elements.find((e) => e.key === "token")
    assert.ok(tokenEl, `${platform}/ad missing token`)
    assert.equal(tokenEl.source, "free")
    assert.equal(tokenEl.optional, undefined)

    const ioRef = "$B10"
    const formula = composeFormula(template, {
      io_name: ioRef,
      token: FIXED_ROW.token,
    })
    assert.equal(
      formula,
      `=LOWER(${ioRef}&IF(${FIXED_ROW.token}<>"","-"&${FIXED_ROW.token},""))`,
      `${platform}/ad formula`,
    )

    const blank = {
      [ioRef]: "jayco-jayco001-video",
      [FIXED_ROW.token]: "",
    }
    assert.equal(
      evaluateNamingFormula(formula, blank),
      "jayco-jayco001-video",
      `${platform}/ad blank token`,
    )

    const filled = { ...blank, [FIXED_ROW.token]: "bumper" }
    assert.equal(
      evaluateNamingFormula(formula, filled),
      "jayco-jayco001-video-bumper",
      `${platform}/ad filled token`,
    )
    assert.equal(
      evaluateNamingFormula(formula, filled),
      composeName(template, {
        io_name: "jayco-jayco001-video",
        token: "bumper",
      }),
    )
  }
})
