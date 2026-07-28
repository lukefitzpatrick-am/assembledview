/**
 * Plan C S2-P5 — per-surface row readers: flag gating + parity (flag off vs on).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { derivePlanReceivableBillingRecordsForMonth } from "@/lib/finance/deriveReceivableRecords"
import { buildMbaDataFromPersistedVersion } from "@/lib/finance/buildMbaDataFromPersistedVersion"
import { buildFinanceHubWorkbook } from "@/lib/finance/excelFinanceExport"
import {
  attachPlanRowSchedulesSync,
} from "@/lib/finance/rows/attachPlanRowSchedules"
import {
  isBillingRowsMigrated,
  resolvePlanCReadRowsMode,
  shouldReadPlanRows,
} from "@/lib/finance/rows/readFlags"
import {
  billingMonthsFromPlanBillingRows,
  billingMonthsFromPlanDeliveryRows,
} from "@/lib/finance/rows/schedulesFromRows"
import type { PlanBillingRow, PlanDeliveryRow } from "@/lib/finance/rows/types"
import {
  pickClientIdFromPlanRecord,
  resolveMbaClientAddress,
} from "@/lib/finance/rows/resolveMbaClientAddress"
import { expectedSpendToDateFromDeliveryScheduleMonthly } from "@/lib/spend/monthlyPlanCalendar"
import { checksumForPlanRows } from "@/lib/finance/rows/dualWrite"

const ENV_KEYS = [
  "PLANC_READ_ROWS_FINANCE",
  "PLANC_READ_ROWS_PACING",
  "PLANC_READ_ROWS_EXPORT",
  "PLANC_READ_ROWS_DOCS",
] as const

function clearFlags() {
  for (const k of ENV_KEYS) delete process.env[k]
}

beforeEach(clearFlags)
afterEach(clearFlags)

const SAMPLE_BILLING_ROWS: PlanBillingRow[] = [
  {
    media_plan_version: 42,
    mba_number: "ACME001",
    line_uid: "uid-search-1",
    line_source: "channel",
    media_type: "search",
    month: "2026-06",
    media_amount: 10_000,
    fee_amount: 2_000,
    adserving_amount: 0,
    billable_amount: 12_000,
    client_pays_for_media: false,
    is_manual_override: false,
    source: "auto",
    override_id: null,
  },
]

const SAMPLE_DELIVERY_ROWS: PlanDeliveryRow[] = [
  {
    media_plan_version: 42,
    mba_number: "ACME001",
    line_uid: "uid-search-1",
    line_source: "channel",
    media_type: "search",
    month: "2026-06",
    delivery_amount: 12_000,
    media_amount_full: 10_000,
  },
]

function fixtureVersion(overrides?: Record<string, unknown>): Record<string, unknown> {
  const billingMonths = billingMonthsFromPlanBillingRows(SAMPLE_BILLING_ROWS)
  const deliveryMonths = billingMonthsFromPlanDeliveryRows(SAMPLE_DELIVERY_ROWS)
  return {
    id: 42,
    version_number: 1,
    mba_number: "ACME001",
    campaign_status: "booked",
    campaign_name: "Demo",
    mp_client_name: "Acme",
    clients_id: 7,
    mp_search: true,
    campaign_start_date: "2026-06-01",
    campaign_end_date: "2026-06-30",
    billing_rows_migrated: true,
    billingSchedule: billingMonths,
    deliverySchedule: deliveryMonths,
    ...overrides,
  }
}

describe("readFlags", () => {
  it("defaults off; on when set", () => {
    expect(resolvePlanCReadRowsMode("finance")).toBe("off")
    process.env.PLANC_READ_ROWS_FINANCE = "on"
    expect(resolvePlanCReadRowsMode("finance")).toBe("on")
  })

  it("unmigrated version always falls back regardless of flag", () => {
    process.env.PLANC_READ_ROWS_FINANCE = "on"
    expect(shouldReadPlanRows("finance", { billing_rows_migrated: false })).toBe(false)
    expect(isBillingRowsMigrated({ billing_rows_migrated: true })).toBe(true)
  })
})

describe("finance surface parity", () => {
  it("flag off vs on → identical receivable records for clean fixture", () => {
    const publisherMap = new Map<string, unknown>()
    const clientMap = new Map<string, unknown>([
      ["Acme", { id: 7, clientname_input: "Acme", payment_days: 30, payment_terms: "Net 30" }],
    ])
    const mbaIds = [{ mbaidentifier: "ACME", id: 7, name: "Acme" }]

    const blobVersion = fixtureVersion()
    process.env.PLANC_READ_ROWS_FINANCE = "off"
    const off = derivePlanReceivableBillingRecordsForMonth(
      [blobVersion],
      2026,
      6,
      publisherMap,
      clientMap,
      mbaIds,
      { includeNonBookedCampaigns: true }
    )

    const rowsVersion = fixtureVersion({
      // Corrupt blob so rows path is the only correct source if attach works
      billingSchedule: [],
      deliverySchedule: [],
    })
    process.env.PLANC_READ_ROWS_FINANCE = "on"
    attachPlanRowSchedulesSync(rowsVersion, "finance", {
      billingRows: SAMPLE_BILLING_ROWS,
      deliveryRows: SAMPLE_DELIVERY_ROWS,
    })
    const on = derivePlanReceivableBillingRecordsForMonth(
      [rowsVersion],
      2026,
      6,
      publisherMap,
      clientMap,
      mbaIds,
      { includeNonBookedCampaigns: true }
    )

    expect(on).toHaveLength(1)
    expect(off).toHaveLength(1)
    expect(on[0]!.total).toBe(off[0]!.total)
    expect(on[0]!.billing_month).toBe(off[0]!.billing_month)
    expect(
      on[0]!.line_items.map((l) => ({ t: l.line_type, a: l.amount, m: l.media_type }))
    ).toEqual(
      off[0]!.line_items.map((l) => ({ t: l.line_type, a: l.amount, m: l.media_type }))
    )
  })

  it("migrated=false ignores finance flag (blob only)", () => {
    process.env.PLANC_READ_ROWS_FINANCE = "on"
    const version = fixtureVersion({
      billing_rows_migrated: false,
      billingSchedule: [],
      deliverySchedule: [],
    })
    attachPlanRowSchedulesSync(version, "finance", {
      billingRows: SAMPLE_BILLING_ROWS,
      deliveryRows: SAMPLE_DELIVERY_ROWS,
    })
    // Attach must no-op when not migrated
    expect(version.__planCBillingMonths).toBeUndefined()
  })
})

describe("pacing surface parity", () => {
  it("flag off vs on → identical expected spend for clean fixture", () => {
    const blob = fixtureVersion()
    const opts = {
      campaignStartISO: "2026-06-01",
      campaignEndISO: "2026-06-30",
    }
    process.env.PLANC_READ_ROWS_PACING = "off"
    const off = expectedSpendToDateFromDeliveryScheduleMonthly(blob.deliverySchedule, opts)

    const rowsVersion = fixtureVersion({ deliverySchedule: [] })
    process.env.PLANC_READ_ROWS_PACING = "on"
    attachPlanRowSchedulesSync(rowsVersion, "pacing", {
      deliveryRows: SAMPLE_DELIVERY_ROWS,
    })
    const on = expectedSpendToDateFromDeliveryScheduleMonthly(
      rowsVersion.__planCDeliveryMonths,
      opts
    )

    expect(on).toBe(off)
    expect(off).toBeGreaterThan(0)
  })
})

describe("export surface parity", () => {
  it("flag off vs on → byte-identical workbook for clean fixture", async () => {
    const publisherMap = new Map<string, unknown>()
    const clientMap = new Map<string, unknown>([
      ["Acme", { id: 7, clientname_input: "Acme", payment_days: 30, payment_terms: "Net 30" }],
    ])
    const mbaIds = [{ mbaidentifier: "ACME", id: 7, name: "Acme" }]

    const blobVersion = fixtureVersion()
    process.env.PLANC_READ_ROWS_EXPORT = "off"
    const offRecords = derivePlanReceivableBillingRecordsForMonth(
      [blobVersion],
      2026,
      6,
      publisherMap,
      clientMap,
      mbaIds,
      { includeNonBookedCampaigns: true }
    )

    const rowsVersion = fixtureVersion({ billingSchedule: [], deliverySchedule: [] })
    process.env.PLANC_READ_ROWS_EXPORT = "on"
    attachPlanRowSchedulesSync(rowsVersion, "export", {
      billingRows: SAMPLE_BILLING_ROWS,
      deliveryRows: SAMPLE_DELIVERY_ROWS,
    })
    const onRecords = derivePlanReceivableBillingRecordsForMonth(
      [rowsVersion],
      2026,
      6,
      publisherMap,
      clientMap,
      mbaIds,
      { includeNonBookedCampaigns: true }
    )

    // Normalize volatile ids for workbook compare
    const normalize = (recs: typeof offRecords) =>
      recs.map((r, i) => ({
        ...r,
        id: i + 1,
        line_items: r.line_items.map((li, j) => ({ ...li, id: j + 1 })),
      }))

    const offBuf = Buffer.from(
      await buildFinanceHubWorkbook([
        { monthIso: "2026-06", monthLabel: "June 2026", records: normalize(offRecords) },
      ])
    )
    const onBuf = Buffer.from(
      await buildFinanceHubWorkbook([
        { monthIso: "2026-06", monthLabel: "June 2026", records: normalize(onRecords) },
      ])
    )
    expect(onBuf.equals(offBuf)).toBe(true)
  })
})

describe("docs surface parity", () => {
  it("flag on + migrated uses stored snapshot_checksum in stamp", () => {
    const rowsChecksum = checksumForPlanRows({
      billingRows: SAMPLE_BILLING_ROWS,
      deliveryRows: SAMPLE_DELIVERY_ROWS,
    })
    const version = fixtureVersion({ snapshot_checksum: rowsChecksum })
    process.env.PLANC_READ_ROWS_DOCS = "on"
    attachPlanRowSchedulesSync(version, "docs", {
      billingRows: SAMPLE_BILLING_ROWS,
      deliveryRows: SAMPLE_DELIVERY_ROWS,
      snapshotChecksum: rowsChecksum,
    })
    const built = buildMbaDataFromPersistedVersion({
      version,
      mbaNumber: "ACME001",
      asOfDate: new Date("2026-07-28T00:00:00.000Z"),
    })
    expect(built.checksum).toBe(rowsChecksum)
    expect(built.mbaData.documentStamp).toBe(`v1 · ${rowsChecksum.slice(0, 8)}`)
    expect(built.mbaData.totals.totals_ex_gst).toBe(12000)
  })

  it("flag off vs on totals match for clean fixture", () => {
    const blobVersion = fixtureVersion()
    process.env.PLANC_READ_ROWS_DOCS = "off"
    const off = buildMbaDataFromPersistedVersion({
      version: blobVersion,
      mbaNumber: "ACME001",
      asOfDate: new Date("2026-07-28T00:00:00.000Z"),
    })

    const rowsVersion = fixtureVersion({ billingSchedule: [], deliverySchedule: [] })
    process.env.PLANC_READ_ROWS_DOCS = "on"
    attachPlanRowSchedulesSync(rowsVersion, "docs", {
      billingRows: SAMPLE_BILLING_ROWS,
      deliveryRows: SAMPLE_DELIVERY_ROWS,
    })
    const on = buildMbaDataFromPersistedVersion({
      version: rowsVersion,
      mbaNumber: "ACME001",
      asOfDate: new Date("2026-07-28T00:00:00.000Z"),
    })

    expect(on.mbaData.totals).toEqual(off.mbaData.totals)
    expect(on.mbaData.gross_media).toEqual(off.mbaData.gross_media)
  })
})

describe("MBA client address by id", () => {
  it("picks clients_id / mp_clients_id / client_id from version", () => {
    expect(pickClientIdFromPlanRecord({ clients_id: 9 })).toBe(9)
    expect(pickClientIdFromPlanRecord({ mp_clients_id: 11 })).toBe(11)
    expect(pickClientIdFromPlanRecord({ client_id: 13 })).toBe(13)
  })

  it("preferId uses id path and does not fall back to name on miss", () => {
    const clients = [
      {
        id: 7,
        clientname_input: "Acme",
        streetaddress: "1 Main",
        suburb: "Sydney",
        state: "NSW",
        postcode: "2000",
      },
      {
        id: 99,
        clientname_input: "Other",
        streetaddress: "9 Other",
        suburb: "Melbourne",
        state: "VIC",
        postcode: "3000",
      },
    ]
    const hit = resolveMbaClientAddress({
      clients,
      version: { clients_id: 7, mp_client_name: "Other" },
      clientName: "Other",
      preferId: true,
    })
    expect(hit.resolvedVia).toBe("id")
    expect(hit.address?.streetaddress).toBe("1 Main")

    const miss = resolveMbaClientAddress({
      clients,
      version: { clients_id: 404, mp_client_name: "Acme" },
      clientName: "Acme",
      preferId: true,
    })
    expect(miss.resolvedVia).toBe("none")
    expect(miss.address).toBeNull()
  })

  it("falls back to master client id when version lacks it", () => {
    const clients = [
      {
        id: 7,
        clientname_input: "Acme",
        streetaddress: "1 Main",
        suburb: "Sydney",
        state: "NSW",
        postcode: "2000",
      },
    ]
    const hit = resolveMbaClientAddress({
      clients,
      version: { mp_client_name: "Acme" },
      master: { mp_clients_id: 7 },
      clientName: "Acme",
      preferId: true,
    })
    expect(hit.resolvedVia).toBe("id")
    expect(hit.clientsId).toBe(7)
  })
})
