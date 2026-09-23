import assert from "node:assert/strict"
import test from "node:test"

import { RelabelApplyError, assertApplyAllowed, buildApplyLogPayload } from "../applyGuard.js"
import { cardChannelFromPlanLine, cardChannelFromWarehouse, factRouteForChannel } from "../shared/channels.js"
import { buildResolveEntitySql, resolveEntity } from "../entity.js"
import { detectCm360DoubleCount, previewRelabel } from "../preview.js"
import { isMissingRelabelTable } from "../repoErrors.js"
import { revertPlanFromPayload } from "../revertPlan.js"
import type { RelabelPreview, RelabelPublishedLine } from "../shared/types.js"
import {
  CM360_PACING_CHANNEL,
  PACING_FACT,
  SEARCH_PACING_FACT,
  SOCIAL_PACING_FACT,
} from "../shared/types.js"

const SOCIAL_CHANNEL = "Social - Meta"
const SEARCH_CHANNEL = "Search - Google Ads"
const BICAU_7PLUS = "7plus | Pre-roll HD"
const BICAU_LINE = "bicau002dv1"

function publishedLine(partial: Partial<RelabelPublishedLine> = {}): RelabelPublishedLine {
  return {
    lineItemId: BICAU_LINE,
    mbaNumber: "bicau002",
    lineChannel: "digi_video",
    cardChannel: "ad-serving",
    published: true,
    onPublishedVersion: true,
    ...partial,
  }
}

function basePreview(overrides: Partial<RelabelPreview> = {}): RelabelPreview {
  return {
    channel: SOCIAL_CHANNEL,
    platformEntityId: "120256089860390550",
    entityName: "BICAU002 SM2",
    lineItemId: "bicau002sm2",
    mbaNumber: "bicau002",
    dateFrom: null,
    dateTo: null,
    cardChannel: "social",
    targetCardChannel: "social",
    moves: [
      {
        previousLineItemId: "bicau002sm1",
        dateFrom: "2026-08-04",
        dateTo: "2026-08-24",
        dayCount: 21,
        spend: 1200,
        impressions: 40000,
        rows: 21,
      },
    ],
    rowsMoving: 21,
    spendMoving: 1200,
    daysMoving: 21,
    warnings: [],
    blocks: [],
    state: "apply",
    duplicateOldNameDays: [],
    activeMap: null,
    publishedLine: publishedLine({
      lineItemId: "bicau002sm2",
      lineChannel: "social",
      cardChannel: "social",
    }),
    ...overrides,
  }
}

test("entity routing picks SOCIAL_PACING_FACT for Meta / TikTok / Reddit", () => {
  for (const channel of ["Social - Meta", "Social - TikTok", "Social - Reddit"]) {
    const route = factRouteForChannel(channel)
    assert.equal(route.table, SOCIAL_PACING_FACT)
    assert.equal(route.primaryKey, "platform_line_item_id")
    assert.equal(route.fallbackKey, null)
    assert.equal(route.updateLineItemName, true)
    assert.match(buildResolveEntitySql(route), /SOCIAL_PACING_FACT/)
    assert.match(buildResolveEntitySql(route), /PLATFORM_LINE_ITEM_ID/)
  }
})

test("entity routing picks SEARCH_PACING_FACT for search channels", () => {
  for (const channel of [SEARCH_CHANNEL, "Shopping - Google Ads", "PMax - Google Ads"]) {
    const route = factRouteForChannel(channel)
    assert.equal(route.table, SEARCH_PACING_FACT)
    assert.equal(route.primaryKey, "platform_line_item_id")
    assert.match(buildResolveEntitySql(route), /SEARCH_PACING_FACT/)
  }
})

test("entity routing picks PACING_FACT on LINE_ITEM_NAME with platform-id fallback for CM360 / DV360 / partner", () => {
  for (const channel of [CM360_PACING_CHANNEL, "Programmatic - Display", "Channel Factory", "Programmatic - OOH"]) {
    const route = factRouteForChannel(channel)
    assert.equal(route.table, PACING_FACT)
    assert.equal(route.primaryKey, "line_item_name")
    assert.equal(route.fallbackKey, "platform_line_item_id")
    const sql = buildResolveEntitySql(route)
    assert.match(sql, /PACING_FACT/)
    assert.match(sql, /LINE_ITEM_NAME/)
    assert.match(sql, /PLATFORM_LINE_ITEM_ID/)
  }
})

test("resolveEntity queries the routed table and returns attributions", async () => {
  let seen = ""
  const entity = await resolveEntity(
    { channel: SOCIAL_CHANNEL, platformEntityId: "120256089860390550" },
    async (sql) => {
      seen = sql
      return [
        {
          ENTITY_NAME: "BICAU002 SM2",
          LINE_ITEM_ID: "BICAU002SM2",
          DATE_FROM: "2026-08-04",
          DATE_TO: "2026-09-16",
          DAY_COUNT: 44,
          SPEND: 9100,
          IMPRESSIONS: 120000,
        },
      ]
    },
  )
  assert.match(seen, /SOCIAL_PACING_FACT/)
  assert.equal(entity.entityName, "BICAU002 SM2")
  assert.equal(entity.cardChannel, "social")
  assert.equal(entity.attributions[0]?.lineItemId, "bicau002sm2")
  assert.equal(entity.attributions[0]?.dayCount, 44)
  assert.equal(entity.attributions[0]?.spend, 9100)
})

test("preview blocks on channel mismatch", async () => {
  const preview = await previewRelabel(
    { channel: SOCIAL_CHANNEL, platformEntityId: "120256", lineItemId: "bicau002se1" },
    {
      resolveEntity: async () => ({
        channel: SOCIAL_CHANNEL,
        platformEntityId: "120256",
        entityName: "Meta ad set",
        cardChannel: "social",
        route: factRouteForChannel(SOCIAL_CHANNEL),
        attributions: [],
      }),
      lookupPublishedLine: async () =>
        publishedLine({
          lineItemId: "bicau002se1",
          lineChannel: "search",
          cardChannel: "search",
        }),
      lookupActiveLabelMap: async () => null,
      loadMoveRows: async () => [],
    },
  )
  assert.ok(preview.blocks.some((b) => b.code === "channel_mismatch"))
  assert.equal(cardChannelFromWarehouse(SOCIAL_CHANNEL), "social")
  assert.equal(cardChannelFromPlanLine("search"), "search")
})

test("preview blocks on unpublished MBA", async () => {
  const preview = await previewRelabel(
    { channel: SEARCH_CHANNEL, platformEntityId: "123", lineItemId: "hartm001se1" },
    {
      resolveEntity: async () => ({
        channel: SEARCH_CHANNEL,
        platformEntityId: "123",
        entityName: "Ad group",
        cardChannel: "search",
        route: factRouteForChannel(SEARCH_CHANNEL),
        attributions: [],
      }),
      lookupPublishedLine: async () =>
        publishedLine({
          lineItemId: "hartm001se1",
          mbaNumber: "hartm001",
          lineChannel: "search",
          cardChannel: "search",
          published: false,
          onPublishedVersion: false,
        }),
      lookupActiveLabelMap: async () => null,
      loadMoveRows: async () => [],
    },
  )
  assert.ok(preview.blocks.some((b) => b.code === "target_not_published"))
})

test("preview detects the CM360 double-count pattern from BICAU002 7plus fixtures", async () => {
  const fixture = [
    { date: "2026-08-10", lineItemName: BICAU_7PLUS, lineItemId: null, spend: 0, impressions: 1200 },
    {
      date: "2026-08-10",
      lineItemName: `${BICAU_7PLUS}-${BICAU_LINE}`,
      lineItemId: BICAU_LINE,
      spend: 0,
      impressions: 800,
    },
    {
      date: "2026-08-11",
      lineItemName: `${BICAU_7PLUS}-${BICAU_LINE}`,
      lineItemId: BICAU_LINE,
      spend: 0,
      impressions: 900,
    },
  ]
  assert.deepEqual(detectCm360DoubleCount(fixture, BICAU_7PLUS, BICAU_LINE), ["2026-08-10"])

  const preview = await previewRelabel(
    { channel: CM360_PACING_CHANNEL, platformEntityId: BICAU_7PLUS, lineItemId: BICAU_LINE },
    {
      resolveEntity: async () => ({
        channel: CM360_PACING_CHANNEL,
        platformEntityId: BICAU_7PLUS,
        entityName: BICAU_7PLUS,
        cardChannel: "ad-serving",
        route: factRouteForChannel(CM360_PACING_CHANNEL),
        attributions: [],
      }),
      lookupPublishedLine: async () => publishedLine(),
      lookupActiveLabelMap: async () => null,
      loadMoveRows: async () => fixture,
    },
  )
  assert.ok(preview.blocks.some((b) => b.code === "double_count"))
  assert.deepEqual(preview.duplicateOldNameDays, ["2026-08-10"])
})

test("apply refuses when preview has blocks", () => {
  const preview = basePreview({
    blocks: [{ code: "channel_mismatch", message: "no" }],
  })
  assert.throws(() => assertApplyAllowed(preview, { acknowledgeWarnings: true }), (err: unknown) => {
    assert.ok(err instanceof RelabelApplyError)
    assert.equal(err.code, "blocked")
    return true
  })
})

test("apply requires acknowledgement when preview has warnings", () => {
  const preview = basePreview({
    warnings: [{ code: "spend_over_25000", message: "too much" }],
    spendMoving: 30_000,
  })
  assert.throws(() => assertApplyAllowed(preview), (err: unknown) => {
    assert.ok(err instanceof RelabelApplyError)
    assert.equal(err.code, "needs_ack")
    return true
  })
  assert.doesNotThrow(() => assertApplyAllowed(preview, { acknowledgeWarnings: true }))
})

test("revert payload round-trips before-state", () => {
  const preview = basePreview({
    activeMap: {
      channel: SOCIAL_CHANNEL,
      platformLineItemId: "120256089860390550",
      lineItemId: "bicau002sm1",
      lineItemName: "old",
      mbaNumber: "bicau002",
      notes: "prior",
    },
  })
  const payload = buildApplyLogPayload(preview, {
    deletedDuplicateRows: [
      {
        dateDay: "2026-08-10",
        channel: CM360_PACING_CHANNEL,
        lineItemName: BICAU_7PLUS,
        lineItemId: null,
        platformLineItemId: null,
        amountSpent: 0,
        impressions: 1200,
      },
    ],
  })
  const plan = revertPlanFromPayload(payload)
  assert.equal(plan.restoreRanges[0]?.previousLineItemId, "bicau002sm1")
  assert.equal(plan.reinsertDeletedRows[0]?.dateDay, "2026-08-10")
  assert.equal(plan.reinsertDeletedRows[0]?.impressions, 1200)
  assert.equal(plan.deactivateMap.lineItemId, "bicau002sm2")
  assert.equal(plan.reactivateMap?.lineItemId, "bicau002sm1")
  assert.deepEqual(revertPlanFromPayload(JSON.parse(JSON.stringify(payload))), plan)
})

test("missing delivery_relabels is fail-soft UNAVAILABLE", () => {
  assert.equal(isMissingRelabelTable(new Error('relation "delivery_relabels" does not exist')), true)
  assert.equal(isMissingRelabelTable(new Error("42P01")), true)
  assert.equal(isMissingRelabelTable(new Error("unrelated")), false)
})

test("describeRelabelWrites lists fact UPDATE, map insert, and all-history scope", async () => {
  const { describeRelabelWrites } = await import("../shared/describeWrites.js")
  const lines = describeRelabelWrites(basePreview())
  assert.ok(lines.some((line) => line.includes("SOCIAL_PACING_FACT")))
  assert.ok(lines.some((line) => line.includes("LINE_ITEM_LABEL_MAP")))
  assert.ok(lines.some((line) => line.includes("Scope: all history")))
})

test("describeRelabelWrites formats spend to 2 currency decimals", async () => {
  const { describeRelabelWrites } = await import("../shared/describeWrites.js")
  const lines = describeRelabelWrites(basePreview({ spendMoving: 1200.5 }))
  const update = lines.find((line) => line.startsWith("UPDATE"))
  assert.ok(update)
  assert.match(update, /spend \$1,200\.50\b/)
  assert.doesNotMatch(update, /spend 1200\.5\b/)
})

test("no-op preview returns no_change when every in-scope row is already the target line", async () => {
  const target = "bicau002sm2"
  const deps = (rows: Array<{ date: string; lineItemId: string | null; spend: number }>) => ({
    resolveEntity: async () => ({
      channel: SOCIAL_CHANNEL,
      platformEntityId: "120256",
      entityName: "Meta ad set",
      cardChannel: "social" as const,
      route: factRouteForChannel(SOCIAL_CHANNEL),
      attributions: [],
    }),
    lookupPublishedLine: async () =>
      publishedLine({
        lineItemId: target,
        lineChannel: "social",
        cardChannel: "social",
      }),
    lookupActiveLabelMap: async () => ({
      channel: SOCIAL_CHANNEL,
      platformLineItemId: "120256",
      lineItemId: target,
      lineItemName: "SM2",
      mbaNumber: "bicau002",
      notes: null,
    }),
    loadMoveRows: async () =>
      rows.map((row) => ({
        date: row.date,
        lineItemId: row.lineItemId,
        lineItemName: "BICAU002 SM2",
        spend: row.spend,
        impressions: 10,
      })),
  })

  const noop = await previewRelabel(
    { channel: SOCIAL_CHANNEL, platformEntityId: "120256", lineItemId: target },
    deps([
      { date: "2026-08-04", lineItemId: target, spend: 10 },
      { date: "2026-08-05", lineItemId: "BICAU002SM2", spend: 12.5 },
    ]),
  )
  assert.equal(noop.state, "no_change")
  assert.equal(noop.blocks.length, 0)
  assert.throws(() => assertApplyAllowed(noop), (err: unknown) => {
    assert.ok(err instanceof RelabelApplyError)
    assert.equal(err.code, "no_change")
    return true
  })

  const partial = await previewRelabel(
    { channel: SOCIAL_CHANNEL, platformEntityId: "120256", lineItemId: target },
    deps([
      { date: "2026-08-04", lineItemId: target, spend: 10 },
      { date: "2026-08-05", lineItemId: "bicau002sm1", spend: 4 },
    ]),
  )
  assert.equal(partial.state, "apply")

  const empty = await previewRelabel(
    { channel: SOCIAL_CHANNEL, platformEntityId: "120256", lineItemId: target },
    deps([]),
  )
  assert.equal(empty.state, "apply")
})

test("relabelsHref and mbaStem encode the admin page entry points", async () => {
  const { mbaStem, relabelsHref, canRevertRelabel } = await import("../shared/relabelPageUrl.js")
  assert.equal(mbaStem("BICAU002"), "BICAU")
  assert.equal(
    relabelsHref({ tab: "unmapped", mba: "BICAU" }),
    "/pacing/admin/relabels?tab=unmapped&mba=BICAU",
  )
  assert.equal(
    relabelsHref({ tab: "new", mba: "BICAU002", line: "bicau002sm2", channel: "Social - Meta" }),
    "/pacing/admin/relabels?mba=BICAU002&line=bicau002sm2&channel=Social+-+Meta",
  )
  assert.equal(canRevertRelabel("2026-09-01T00:00:00.000Z", new Date("2026-09-21T00:00:00.000Z")), true)
  assert.equal(canRevertRelabel("2026-08-01T00:00:00.000Z", new Date("2026-09-21T00:00:00.000Z")), false)
})

