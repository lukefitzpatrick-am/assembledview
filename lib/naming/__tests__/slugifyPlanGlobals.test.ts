import assert from "node:assert/strict"
import test from "node:test"

import { composeName } from "../compose.js"
import { slugifyPlanGlobals, type PlanGlobals } from "../fromPlan.js"
import { getTemplate } from "../templates.js"

const MONTH = "jan26"
const MBA = "mba123"

function rawGlobals(): PlanGlobals {
  return {
    brand: "MoliCare – Annual Performance",
    client: "MoliCare – Annual Performance",
    campaign: "Spring Push 2026",
    mba: MBA,
    month_start: MONTH,
    campaign_start_date: "2026-01-15",
  }
}

function alreadySlugifiedGlobals(): PlanGlobals {
  return {
    brand: "molicare_annual_performance",
    client: "molicare_annual_performance",
    campaign: "spring_push_2026",
    mba: MBA,
    month_start: MONTH,
    campaign_start_date: "2026-01-15",
  }
}

test("slugifyPlanGlobals: spaces, en-dash, mixed case → stable slugs", () => {
  const got = slugifyPlanGlobals(rawGlobals())
  assert.equal(got.brand, "molicare_annual_performance")
  assert.equal(got.client, "molicare_annual_performance")
  assert.equal(got.campaign, "spring_push_2026")
  assert.equal(got.mba, MBA)
  assert.equal(got.month_start, MONTH)
  assert.equal(got.campaign_start_date, "2026-01-15")
})

test("slugifyPlanGlobals: idempotent — pre-slugified values pass through", () => {
  const pre = alreadySlugifiedGlobals()
  assert.deepEqual(slugifyPlanGlobals(pre), pre)
  assert.deepEqual(slugifyPlanGlobals(slugifyPlanGlobals(rawGlobals())), pre)
})

test("slugifyPlanGlobals: raw vs slugified globals compose identical names", () => {
  const fromRaw = slugifyPlanGlobals(rawGlobals())
  const fromSlug = slugifyPlanGlobals(alreadySlugifiedGlobals())
  assert.deepEqual(fromRaw, fromSlug)

  const campaign = getTemplate("cm360", "campaign")
  assert.ok(campaign)
  const nameFromRaw = composeName(campaign, {
    brand: fromRaw.brand,
    campaign: fromRaw.campaign,
    mba: fromRaw.mba,
    month_start: fromRaw.month_start,
  })
  const nameFromSlug = composeName(campaign, {
    brand: fromSlug.brand,
    campaign: fromSlug.campaign,
    mba: fromSlug.mba,
    month_start: fromSlug.month_start,
  })
  assert.equal(nameFromRaw, nameFromSlug)
  assert.equal(
    nameFromRaw,
    "molicare_annual_performance-spring_push_2026-mba123-jan26",
  )
})
