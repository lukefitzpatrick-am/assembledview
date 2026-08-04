/**
 * FINDINGS (no_adserving / BOSS011PD1) — investigation only, no behaviour change.
 *
 * STEP 1 — READ (DB → form)
 * a) Consumer of `inHydration` is `mapHydrationToForm` in containerChannelConfig.ts:
 *      out[entry.camel] = Boolean(raw) || false
 *    with raw = src[entry.snake] ?? src[entry.camel]. For PROGDISPLAY that writes
 *    form field `noadserving` from persisted `no_adserving`.
 * b) ExpertCard binds Checkbox to fieldName(itemsKey, i, flag.key). ProgDisplay
 *    uses fieldKey/itemsKey `"lineItems"` and optionFlags key `"noadserving"` →
 *    path `lineItems.N.noadserving`. Same string as hydration camel. No mismatch.
 * c) Edit load: useStableHydration(initialLineItems) runs whenever the fetched
 *    array reference is non-empty (existing version lines included). Not new-only.
 *
 * STEP 2 — WRITE (form → DB)
 * Container publish: mapFormToApi → `no_adserving`.
 * Postgres save: buildSavePlanLineItemsFromSnapshots reads
 *   Boolean(raw.no_adserving ?? raw.noAdserving ?? false) → SavePlanLineItem.noAdserving.
 * savePlanVersion insert: noAdserving: l.noAdserving ?? null.
 * Ticked true → column true. Unticked false → column false.
 * Unticked vs absent: both become false via Boolean(...); they are indistinguishable
 * at SavePlanLineItem (never null on this path). Null only if noAdserving is
 * omitted upstream of buildPostgres.
 *
 * Latent footguns (NOT the BOSS011PD1 cause — live row attrs have no adserving keys):
 * - mapLineItemFromPostgres spreads attrs AFTER typed no_adserving; attrs.no_adserving
 *   can mask the column on reassembly.
 * - buildSavePlanLineItemsFromSnapshots does not read form-camel `noadserving`; a
 *   snapshot that skips mapFormToApi loses the typed column (value may land in attrs).
 *
 * STEP 4 — VERDICT: (D) neither — canonical chain preserves true/false.
 * Live check: BOSS011PD1 v13 column true, attrs clean; fetchLineItemsFromPostgres →
 * hydrate → mapFormToApi → buildSavePlanLineItemsFromSnapshots keeps true; flip to
 * false persists false. UI/DB mismatch is not explained by this transform chain;
 * 57% true is a business/data question for Luke, not a broken flag path.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapLineItemFromPostgres } from "@/lib/data/planShapes"
import {
  buildSavePlanLineItemsFromSnapshots,
} from "@/lib/mediaplan/buildPostgresSavePayload"
import {
  mapFormToApi,
  mapHydrationToForm,
  PROGDISPLAY_CONTAINER_CONFIG,
} from "@/lib/mediaplan/containerChannelConfig"
import { getExpertOptionFlags } from "@/lib/mediaplan/expertGridChannelConfig"

const FIELD_MAP = PROGDISPLAY_CONTAINER_CONFIG.fieldMap
const ITEMS_KEY = "lineItems" // useMediaChannelContainer / MediaChannelContainer

function fieldName(itemsKey: string, lineItemIndex: number, key: string): string {
  return `${itemsKey}.${lineItemIndex}.${key}`
}

function minimalBursts() {
  return [
    {
      budget: "1000",
      buyAmount: "10",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    },
  ]
}

function roundTrip(persistedNoAdserving: boolean, formOverride?: boolean) {
  const persisted = {
    no_adserving: persistedNoAdserving,
    platform: "DV360",
    buy_type: "cpm",
    bid_strategy: "auto",
    line_item_id: "BOSS011PD1",
    bursts: minimalBursts(),
  }

  const form = mapHydrationToForm(FIELD_MAP, persisted) as Record<string, unknown>
  assert.equal(
    form.noadserving,
    persistedNoAdserving,
    "hydration must write form camel noadserving from no_adserving",
  )

  const optionFlags = getExpertOptionFlags(PROGDISPLAY_CONTAINER_CONFIG.gridConfig)
  const noAdFlag = optionFlags.find((f) => f.key === "noadserving")
  assert.ok(noAdFlag, "PROGDISPLAY optionFlags must include noadserving")
  const checkboxPath = fieldName(ITEMS_KEY, 0, noAdFlag!.key)
  assert.equal(
    checkboxPath,
    "lineItems.0.noadserving",
    "ExpertCard Checkbox path must match hydration camel field",
  )

  if (formOverride !== undefined) {
    form.noadserving = formOverride
  }

  const apiSnapshot = {
    ...mapFormToApi(FIELD_MAP, form),
    line_item_id: "BOSS011PD1",
    bursts: minimalBursts(),
  }
  const expected = formOverride ?? persistedNoAdserving
  assert.equal(apiSnapshot.no_adserving, expected)

  const saveItems = buildSavePlanLineItemsFromSnapshots({
    progDisplay: [apiSnapshot],
  })
  assert.equal(saveItems.length, 1)
  // savePlanVersion insert uses: noAdserving: l.noAdserving ?? null
  const savePlanInput = {
    noAdserving: saveItems[0]!.noAdserving ?? null,
  }
  assert.equal(savePlanInput.noAdserving, expected)
  return savePlanInput.noAdserving
}

describe("no_adserving round-trip (PROGDISPLAY)", () => {
  it("persisted true survives hydration → form → save payload → savePlan input", () => {
    assert.equal(roundTrip(true), true)
  })

  it("form flipped to false persists as false through savePlan input", () => {
    assert.equal(roundTrip(true, false), false)
  })

  it("persisted false survives and stays false", () => {
    assert.equal(roundTrip(false), false)
  })

  it("unticked and absent are indistinguishable at SavePlanLineItem (both false)", () => {
    const fromUnticked = buildSavePlanLineItemsFromSnapshots({
      progDisplay: [
        {
          no_adserving: false,
          line_item_id: "BOSS011PD1",
          bursts: minimalBursts(),
        },
      ],
    })
    const fromAbsent = buildSavePlanLineItemsFromSnapshots({
      progDisplay: [
        {
          line_item_id: "BOSS011PD2",
          bursts: minimalBursts(),
        },
      ],
    })
    assert.equal(fromUnticked[0]!.noAdserving, false)
    assert.equal(fromAbsent[0]!.noAdserving, false)
  })

  it("documents attrs overwrite footgun on mapLineItemFromPostgres (not BOSS011PD1)", () => {
    const masked = mapLineItemFromPostgres(
      {
        id: 1,
        channel: "prog_display",
        lineItemId: "BOSS011PD1",
        position: 1,
        noAdserving: true,
        attrs: { no_adserving: false },
        bursts: minimalBursts(),
        createdAt: new Date("2026-01-01"),
      },
      {
        versionId: 1,
        versionNumber: 13,
        mbaNumber: "BOSS011",
        mpClientName: "Boss",
      },
    )
    assert.equal(
      masked.no_adserving,
      false,
      "attrs.no_adserving after spread masks typed column true",
    )

    const clean = mapLineItemFromPostgres(
      {
        id: 1,
        channel: "prog_display",
        lineItemId: "BOSS011PD1",
        position: 1,
        noAdserving: true,
        attrs: {},
        bursts: minimalBursts(),
        createdAt: new Date("2026-01-01"),
      },
      {
        versionId: 1,
        versionNumber: 13,
        mbaNumber: "BOSS011",
        mpClientName: "Boss",
      },
    )
    assert.equal(clean.no_adserving, true)
  })

  it("documents form-camel-only snapshot miss in buildSavePlanLineItemsFromSnapshots", () => {
    const leaked = buildSavePlanLineItemsFromSnapshots({
      progDisplay: [
        {
          noadserving: true,
          line_item_id: "BOSS011PD1",
          bursts: minimalBursts(),
        },
      ],
    })
    assert.equal(
      leaked[0]!.noAdserving,
      false,
      "form camel noadserving alone does not set typed noAdserving",
    )
    assert.equal(
      (leaked[0]!.attrs as Record<string, unknown> | null)?.noadserving,
      true,
      "form camel leaks into attrs instead",
    )
  })
})
