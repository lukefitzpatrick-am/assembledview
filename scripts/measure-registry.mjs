/**
 * S10 A: one function per measure. A screen (app/**, components/**; not
 * app/api/**) shows a measure from its one function, never its own arithmetic.
 * `MEASURES` names each one. eslint.config.mjs applies `measures/no-local-measure`
 * to screen code: a percent of two measure values, or a measure prorated over
 * days, fails lint. Existing offenders sit in scripts/measure-baseline.json
 * (count per file); a file over its count fails, and the self-test fails a count
 * that has dropped until the JSON is lowered by hand, so it only goes down.
 * Self-test: scripts/__tests__/eslint-measure-registry.test.mjs.
 * Shortcut: a measure is spotted by shape and name, so a bare ratio, a helper
 * call (`ratio(a, b)`) or a renamed operand passes; when review finds one, move
 * it onto the measure's function. Never widen the shapes or the words for it.
 * A local `next lint` cache does not see a change to this file; lint with --no-cache.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** Each user-visible measure and the one function every screen reads it from. */
export const MEASURES = [
  { measure: "Fee (a slice of gross)", module: "lib/mediaplan/burstAmounts.ts", fn: "computeBurstAmounts" }, // feeAmount
  { measure: "Net media (delivery media)", module: "lib/mediaplan/burstAmounts.ts", fn: "computeBurstAmounts" }, // deliveryMediaAmount
  { measure: "Planned spend, campaign", module: "lib/spend/resolveCampaignExpectedSpend.ts", fn: "resolveCampaignTotalPlannedSpend" },
  { measure: "Planned spend or deliverables, line", module: "lib/pacing/expectedForWindow.ts", fn: "plannedTotal" },
  { measure: "Planned deliverables from media", module: "lib/mediaplan/deliverableBudget.ts", fn: "computeDeliverableFromMedia" },
  { measure: "Expected spend to date, campaign", module: "lib/spend/resolveCampaignExpectedSpend.ts", fn: "resolveCampaignExpectedSpendToDate" },
  { measure: "Expected spend or deliverables in a window, line", module: "lib/pacing/expectedForWindow.ts", fn: "expectedForWindow" },
  { measure: "Pacing percent (delivered against expected) and its band", module: "lib/pacing/expectedForWindow.ts", fn: "paceVsExpected" },
  { measure: "Line pacing status (PacingStatus ladder)", module: "lib/pacing/maths/index.ts", fn: "computePacing" },
  { measure: "Delivered spend, campaign", module: "lib/delivery/getDeliveredTotalsForCampaign.ts", fn: "getDeliveredTotalsForCampaign" },
  { measure: "Delivered spend, client", module: "lib/delivery/getDeliveredTotalsForClient.ts", fn: "getDeliveredTotalsForClient" },
  { measure: "Direct digital estimated spend", module: "lib/delivery/estimateDirectDigitalSpend.ts", fn: "estimateDirectDigitalSpend" },
  { measure: "Assumed spend to date", module: "lib/spend/assumedSpend.ts", fn: "assumedLineToDateCents" },
  { measure: "Assumed spend pace and its band (both zero is On track)", module: "lib/spend/assumedSpend.ts", fn: "assumedDeliveryPace" },
  { measure: "Budget utilised (planned to date against planned)", module: "lib/dashboard/plannedSpendConsistency.ts", fn: "computePlannedSpendTotals" },
  // S12: the billing-month function. Its I/O wrapper is loadComposedBillingRecordsForMonth; computedCentsByInvoiceKey keys it by invoice_key.
  { measure: "Billed, per month", module: "lib/finance/composeFinanceHubRecords.ts", fn: "composeBillingRecordsForMonth" },
  // S14: the amount of a record about to go to Xero that is above plan (month and campaign).
  { measure: "Billed above plan, per record", module: "lib/finance/abovePlan.ts", fn: "centsAbovePlan" },
  { measure: "Cost per thousand impressions (CPM)", module: "lib/money/rates.ts", fn: "cpm" },
  { measure: "Cost per click (CPC)", module: "lib/money/rates.ts", fn: "cpc" },
  { measure: "Cost per view (CPV)", module: "lib/money/rates.ts", fn: "cpv" },
  { measure: "Cost per acquisition (CPA)", module: "lib/money/rates.ts", fn: "cpa" },
  { measure: "Margin percent", module: "lib/finance/sections/fixedCostMargin/compose.ts", fn: "marginPctOf" },
  { measure: "Projected spend (daily pace over the flight)", module: "lib/pacing/maths/index.ts", fn: "computeProjectedTotal" },
]

/** Words that name a measure. An identifier names one when a word is the whole name or a camelCase or snake_case part of it (`actualSpend`, `total_budget`; not `feedback`, `immediate`). */
const WORDS = ["spend", "spent", "budget", "expected", "delivered", "planned", "projected", "actual", "billed", "fee", "fees", "media", "cost", "costs", "margin", "deliverable", "deliverables"]
const cap = (w) => w[0].toUpperCase() + w.slice(1)
const NAME = `/(^|[^A-Za-z])(${WORDS.join("|")})(?![a-z])|(${WORDS.map(cap).join("|")})(?![a-z])/`
const HAS_NAME = `:has(Identifier[name=${NAME}])`
const MESSAGE =
  "S10: a measure computed in screen code. Read it from its one function (scripts/measure-registry.mjs, docs/brain/INVARIANTS.md)"

/** The shapes: a percent of two values that name a measure, and a measure prorated over days. */
const MEASURE_SELECTORS = [
  `BinaryExpression[operator='*'][right.value=100] > BinaryExpression.left[operator='/']${HAS_NAME}`,
  `BinaryExpression[operator='*'][left.value=100] > BinaryExpression.right[operator='/']${HAS_NAME}`,
  `BinaryExpression[operator='/'][left.operator='*'][left.right.value=100]${HAS_NAME}`,
  `BinaryExpression[operator='/'][left.operator='*'][left.left.value=100]${HAS_NAME}`,
  `BinaryExpression[operator='*']${HAS_NAME} BinaryExpression[operator='/']:has(Identifier[name=/days/i])`,
]

/** Screen code: the files the rule covers. */
export const MEASURE_FILES = ["{app,components}/**/*.{js,jsx,ts,tsx}"]
export const MEASURE_IGNORES = ["app/api/**", "**/__tests__/**", "**/*.test.*", "**/*.spec.*"]
/** MEASURE_FILES less MEASURE_IGNORES, as a test on a repo path. */
export const isMeasureScreen = (file) =>
  /^(app|components)\/.+\.[jt]sx?$/.test(file) && !file.startsWith("app/api/") && !/(^|\/)__tests__\/|\.(test|spec)\./.test(file)

/**
 * `no-restricted-imports` patterns for screen code (S10fix, Q3 A): a screen bands a pace through
 * paceVsExpected (or assumedDeliveryPace), never the raw band helpers, so a band always has its pace.
 */
const BAND_MESSAGE = "S10: band a pace through paceVsExpected or assumedDeliveryPace (scripts/measure-registry.mjs), not the raw band helper."
export const MEASURE_BAND_IMPORTS = [
  { regex: "(^|/)lib/pacing/deliveryStatusFromPct(\\.ts)?$", message: BAND_MESSAGE },
  { regex: "(^|/)lib/pacing/status(\\.ts)?$", importNames: ["statusFromExpectedPct"], message: BAND_MESSAGE },
]

/** `measures/no-local-measure`: options `{ baseline }`, the allowed count per repo path. */
const noLocalMeasure = {
  meta: { type: "problem", schema: [{ type: "object", properties: { baseline: { type: "object" } }, additionalProperties: false }] },
  create(context) {
    const rel = path.relative(ROOT, context.filename).split(path.sep).join("/")
    const allowed = context.options[0]?.baseline?.[rel] ?? 0
    const hits = []
    const listeners = Object.fromEntries(MEASURE_SELECTORS.map((s) => [s, (node) => hits.push(node)]))
    listeners["Program:exit"] = () => {
      if (hits.length <= allowed) return
      for (const node of hits) context.report({ node, message: `${MESSAGE}. ${hits.length} here, baseline ${allowed}.` })
    }
    return listeners
  },
}

export const measuresPlugin = { rules: { "no-local-measure": noLocalMeasure } }

export const MEASURE_BASELINE = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/measure-baseline.json"), "utf8"))
