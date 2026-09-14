/**
 * BT-1 — a media line cannot be published with no buy type.
 * Tests import the helper + schema, not the Auth0 route.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { buildSavePlanLineItemsFromSnapshots } from "@/lib/mediaplan/buildPostgresSavePayload"
import {
  MISSING_BUY_TYPE,
  formatMissingBuyTypeMessage,
  missingBuyTypeGateResult,
  missingNonProductionBuyTypeLineIds,
  normaliseBuyType,
  shouldRejectMissingBuyTypeOnSave,
} from "@/lib/mediaplan/missingBuyTypeGate"
import { plansSaveBodySchema } from "@/lib/mediaplan/plansSaveBodySchema"
import { SAVE_PUBLISHES_IMMEDIATELY } from "@/lib/mediaplan/resolvePostgresSaveMode"

const SOCIAL_ID = "GLENDA009RA2SM1"
const PROD_ID = "GLENDA009RA2PR1"

const CREATE_PAGE = join(process.cwd(), "app/mediaplans/create/page.tsx")
const EDIT_PAGE = join(
  process.cwd(),
  "app/mediaplans/mba/[mba_number]/edit/page.tsx"
)
const SAVE_ROUTE = join(process.cwd(), "app/api/plans/save/route.ts")

function lineItem(over: Record<string, unknown> = {}) {
  return {
    lineItemId: SOCIAL_ID,
    channel: "social",
    buyType: "",
    bursts: [],
    mediaType: "socialMedia",
    rate: 0,
    enteredAmount: 1000,
    ...over,
  }
}

function saveBody(over: Record<string, unknown> = {}) {
  return {
    masterId: 1,
    mbaNumber: "glenda009ra2",
    versionNumber: 1,
    mode: "publish",
    lineItems: [lineItem()],
    feeLoading: {},
    ...over,
  }
}

describe("plansSaveBodySchema buyType trim-or-null", () => {
  it('parses "  cpm " to "cpm" and "" to null', () => {
    const padded = plansSaveBodySchema.safeParse(
      saveBody({ lineItems: [lineItem({ buyType: "  cpm " })] })
    )
    assert.equal(padded.success, true)
    if (!padded.success) return
    assert.equal(padded.data.lineItems[0]?.buyType, "cpm")

    const blank = plansSaveBodySchema.safeParse(saveBody())
    assert.equal(blank.success, true)
    if (!blank.success) return
    assert.equal(blank.data.lineItems[0]?.buyType, null)

    const spaces = plansSaveBodySchema.safeParse(
      saveBody({ lineItems: [lineItem({ buyType: "  " })] })
    )
    assert.equal(spaces.success, true)
    if (!spaces.success) return
    assert.equal(spaces.data.lineItems[0]?.buyType, null)
  })
})

describe("publish / draft missing buy type gate", () => {
  it("publish with a social line buyType \"\" → 422 MISSING_BUY_TYPE, id named", () => {
    const parsed = plansSaveBodySchema.safeParse(saveBody())
    assert.equal(parsed.success, true)
    if (!parsed.success) return
    const gate = missingBuyTypeGateResult(parsed.data.mode, parsed.data.lineItems)
    assert.equal(gate.reject, true)
    if (!gate.reject) return
    assert.equal(gate.body.code, MISSING_BUY_TYPE)
    assert.deepEqual(gate.body.lineItemIds, [SOCIAL_ID])
    assert.match(gate.body.error, new RegExp(SOCIAL_ID))
  })

  it("publish with a production line buyType null → accepted", () => {
    const parsed = plansSaveBodySchema.safeParse(
      saveBody({
        lineItems: [
          lineItem({
            lineItemId: PROD_ID,
            channel: "production",
            buyType: null,
            mediaType: "production",
          }),
        ],
      })
    )
    assert.equal(parsed.success, true)
    if (!parsed.success) return
    const gate = missingBuyTypeGateResult(parsed.data.mode, parsed.data.lineItems)
    assert.equal(gate.reject, false)
    assert.deepEqual(missingNonProductionBuyTypeLineIds(parsed.data.lineItems), [])
  })

  it("draft save with a social line buyType null → accepted", () => {
    const parsed = plansSaveBodySchema.safeParse(
      saveBody({
        mode: "draft",
        lineItems: [lineItem({ buyType: null })],
      })
    )
    assert.equal(parsed.success, true)
    if (!parsed.success) return
    assert.equal(shouldRejectMissingBuyTypeOnSave(parsed.data.mode), false)
    const gate = missingBuyTypeGateResult(parsed.data.mode, parsed.data.lineItems)
    assert.equal(gate.reject, false)
  })
})

describe("client payload trim-or-null (no throw)", () => {
  it("buildSavePlanLineItemsFromSnapshots never sends \"\"", () => {
    const items = buildSavePlanLineItemsFromSnapshots({
      socialMedia: [
        {
          line_item_id: SOCIAL_ID,
          buy_type: "",
          bursts: [
            {
              budget: "1000",
              buyAmount: "10",
              startDate: "2026-07-01",
              endDate: "2026-07-31",
            },
          ],
        },
      ],
    })
    assert.equal(items[0]?.buyType, null)
    assert.equal(normaliseBuyType("  cpm "), "cpm")
    assert.equal(normaliseBuyType(""), null)
  })
})

describe("the 17 published empties fire the gate on next publish (not rewritten here)", () => {
  it("hydrate keeps \"\"; save payload nulls it; publish names the id", () => {
    const hydrateSrc = readFileSync(
      join(process.cwd(), "lib/mediaplan/containerChannelConfig.ts"),
      "utf8"
    )
    assert.match(
      hydrateSrc,
      /preserves Television buy_type → ""/
    )
    assert.match(
      hydrateSrc,
      /out\[entry.camel\] = \(raw as string \| undefined\) \|\| ""/
    )
    // mapHydrationToForm: empty string is falsy, so stored "" stays "".
    const hydrateEmpty = (raw: string | undefined) => raw || ""
    const hydratedBuyType = hydrateEmpty([""][0])
    assert.equal(hydratedBuyType, "")

    const payload = buildSavePlanLineItemsFromSnapshots({
      socialMedia: [
        {
          line_item_id: SOCIAL_ID,
          buyType: hydratedBuyType,
          bursts: [
            {
              budget: "1000",
              buyAmount: "10",
              startDate: "2026-07-01",
              endDate: "2026-07-31",
            },
          ],
        },
      ],
    })
    assert.equal(payload[0]?.buyType, null)

    const parsed = plansSaveBodySchema.safeParse(
      saveBody({
        mode: "publish",
        lineItems: [
          lineItem({
            lineItemId: payload[0]!.lineItemId,
            buyType: payload[0]!.buyType,
          }),
        ],
      })
    )
    assert.equal(parsed.success, true)
    if (!parsed.success) return
    const gate = missingBuyTypeGateResult(parsed.data.mode, parsed.data.lineItems)
    assert.equal(gate.reject, true)
    if (!gate.reject) return
    assert.deepEqual(gate.body.lineItemIds, [SOCIAL_ID])
    assert.equal(
      formatMissingBuyTypeMessage(gate.body.lineItemIds),
      `Buy type is required to publish: ${SOCIAL_ID}`
    )
  })
})

describe("server publish intent + twin-page 422 wiring", () => {
  it("route decides publish intent after parse, before savePlanVersion", () => {
    const src = readFileSync(SAVE_ROUTE, "utf8")
    const parseIdx = src.indexOf("plansSaveBodySchema.safeParse")
    const gateIdx = src.indexOf("missingBuyTypeGateResult(body.mode")
    const saveIdx = src.indexOf("savePlanVersion(")
    assert.ok(parseIdx >= 0, "route must parse plansSaveBodySchema")
    assert.ok(gateIdx > parseIdx, "BT-1 gate must run after parse")
    assert.ok(saveIdx > gateIdx, "BT-1 gate must run before savePlanVersion")
    assert.match(src, /MISSING_BUY_TYPE|missingBuyTypeGateResult/)
    assert.match(src, /body\.mode/)
    // UI Save is already a publish while this flag is on — server still keys on mode.
    assert.equal(typeof SAVE_PUBLISHES_IMMEDIATELY, "boolean")
  })

  it("create and edit surface 422 MISSING_BUY_TYPE (toast + Issues panel)", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    for (const [label, src] of [
      ["create", createSrc],
      ["edit", editSrc],
    ] as const) {
      assert.match(src, /MISSING_BUY_TYPE/, `${label} must handle MISSING_BUY_TYPE`)
      assert.match(src, /setMissingBuyTypeLineIds/, `${label} must mark Issues panel rows`)
      assert.match(src, /missingBuyTypeBuilderIssues/, `${label} must fold ids into builderIssues`)
    }
  })
})
