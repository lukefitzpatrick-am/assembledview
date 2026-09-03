/**
 * SF-11 — receivable client-pays refusal joins the plan line, not only the blob flag.
 *
 * Probe shape: (version_id, line_item_id) matches 100% of blob entries. A media
 * receivable must never reference a plan line that is client-pays, even when the
 * persisted schedule item omitted `clientPaysForMedia` (rows-mode rebuild).
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import type { BillingMonth } from "../../billing/types.js"
import type { BillingRecord } from "../../types/financeBilling.js"
import { derivePlanReceivableBillingRecordsForMonth } from "../deriveReceivableRecords.js"

function emptyMediaCosts(): BillingMonth["mediaCosts"] {
  return {
    search: "$0.00",
    socialMedia: "$0.00",
    television: "$0.00",
    radio: "$0.00",
    newspaper: "$0.00",
    magazines: "$0.00",
    ooh: "$0.00",
    cinema: "$0.00",
    digiDisplay: "$0.00",
    digiAudio: "$0.00",
    digiVideo: "$0.00",
    bvod: "$0.00",
    integration: "$0.00",
    progDisplay: "$0.00",
    progVideo: "$0.00",
    progBvod: "$0.00",
    progAudio: "$0.00",
    progOoh: "$0.00",
    influencers: "$0.00",
    production: "$0.00",
  }
}

type ProbePlanLine = {
  version_id: number
  line_item_id: string
  client_pays_for_media: boolean
}

/** Same dual-shape join the probe / SCHEDULE_LINE_JOIN_SQL used. */
function joinPlanLine(
  scheduleLineItemId: string | null | undefined,
  planLines: ProbePlanLine[],
  versionId: number
): ProbePlanLine | null {
  const id = (scheduleLineItemId ?? "").trim()
  if (!id) return null
  for (const pl of planLines) {
    if (pl.version_id !== versionId) continue
    if (pl.line_item_id === id) return pl
    const sep = id.indexOf("::")
    if (sep > 0 && pl.line_item_id === id.slice(sep + 2)) return pl
  }
  return null
}

/** Invariant: no receivable media line may reference a client-pays plan line. */
function receivableMediaClientPaysJoinHits(
  record: BillingRecord | undefined,
  planLines: ProbePlanLine[],
  versionId: number
): string[] {
  if (!record) return []
  const hits: string[] = []
  for (const li of record.line_items) {
    if (li.line_type !== "media") continue
    const joined = joinPlanLine(li.schedule_line_item_id, planLines, versionId)
    if (joined?.client_pays_for_media === true) {
      hits.push(String(li.schedule_line_item_id))
    }
  }
  return hits
}

function monthFromParts(args: {
  mediaTotal: number
  feeTotal: number
  lineItems: NonNullable<BillingMonth["lineItems"]>
}): BillingMonth {
  const { mediaTotal, feeTotal, lineItems } = args
  return {
    monthYear: "May 2026",
    mediaTotal: `$${mediaTotal.toFixed(2)}`,
    feeTotal: `$${feeTotal.toFixed(2)}`,
    totalAmount: `$${(mediaTotal + feeTotal).toFixed(2)}`,
    adservingTechFees: "$0.00",
    production: "$0.00",
    mediaCosts: emptyMediaCosts(),
    lineItems,
  }
}

function derive(version: Record<string, unknown>) {
  return derivePlanReceivableBillingRecordsForMonth(
    [version],
    2026,
    5,
    new Map(),
    new Map(),
    [],
    { includeNonBookedCampaigns: false }
  )
}

test("SF-11: blob flag absent + plan line client-pays → media refused (join, not blob flag)", () => {
  const logs: string[] = []
  mock.method(console, "log", (...args: unknown[]) => {
    logs.push(args.map(String).join(" "))
  })

  const planLines: ProbePlanLine[] = [
    { version_id: 9111, line_item_id: "SOC1", client_pays_for_media: true },
    { version_id: 9111, line_item_id: "SEARCH1", client_pays_for_media: false },
  ]
  const billing = monthFromParts({
    mediaTotal: 9000,
    feeTotal: 250,
    lineItems: {
      socialMedia: [
        {
          id: "billing-socialMedia::SOC1",
          header1: "Meta",
          header2: "Prospecting",
          monthlyAmounts: { "May 2026": 8000 },
          totalAmount: 8000,
          mediaType: "Social Media",
          publisher: "Meta",
          // rows-mode rebuild omitted the flag
        },
      ],
      search: [
        {
          id: "billing-search::SEARCH1",
          header1: "Google Ads",
          header2: "Brand",
          monthlyAmounts: { "May 2026": 1000 },
          totalAmount: 1000,
          mediaType: "Search",
          publisher: "Google Ads",
        },
      ],
    },
  })
  const version: Record<string, unknown> = {
    id: 9111,
    clients_id: 11,
    client_name: "SF11 Client",
    mba_number: "sf11cp01",
    campaign_name: "SF11 Campaign",
    campaign_status: "booked",
    version_number: 1,
    billingSchedule: [billing],
    deliverySchedule: [billing],
    line_items: planLines,
  }

  const [record] = derive(version)
  assert.ok(record)

  const media = record.line_items.filter((li) => li.line_type === "media")
  assert.equal(media.length, 1, "agency-pays search stays; client-pays social is refused")
  assert.equal(media[0]!.schedule_line_item_id, "billing-search::SEARCH1")

  assert.deepEqual(
    receivableMediaClientPaysJoinHits(record, planLines, 9111),
    [],
    "no receivable media line may join a client-pays plan line"
  )

  const dropLog = logs.find((line) => line.includes("[finance-derive]") && line.includes("dropped"))
  assert.ok(dropLog, "expected a drop log when the plan line (not the blob) is client-pays")
  assert.match(dropLog!, /\[finance-derive\] sf11cp01 2026-05: dropped 1 client-pays media lines \(\$8000/)
})

test("SF-11: either source is enough — blob flag true still refuses even if plan line is false", () => {
  const planLines: ProbePlanLine[] = [
    { version_id: 9112, line_item_id: "SOC1", client_pays_for_media: false },
  ]
  const billing = monthFromParts({
    mediaTotal: 4000,
    feeTotal: 500,
    lineItems: {
      socialMedia: [
        {
          id: "billing-socialMedia::SOC1",
          header1: "Meta",
          header2: "Prospecting",
          monthlyAmounts: { "May 2026": 4000 },
          totalAmount: 4000,
          clientPaysForMedia: true,
          mediaType: "Social Media",
        },
      ],
    },
  })
  const version: Record<string, unknown> = {
    id: 9112,
    clients_id: 11,
    client_name: "SF11 Client",
    mba_number: "sf11either",
    campaign_name: "SF11 Campaign",
    campaign_status: "booked",
    version_number: 1,
    billingSchedule: [billing],
    deliverySchedule: [billing],
    line_items: planLines,
  }
  const [record] = derive(version)
  assert.ok(record)
  assert.equal(record.line_items.filter((li) => li.line_type === "media").length, 0)
})
