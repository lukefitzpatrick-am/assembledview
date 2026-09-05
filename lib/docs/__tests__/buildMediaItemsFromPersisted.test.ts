import "./fixtures/xanoEnvStub"

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { groupLineItemsByMbaGetKey } from "@/lib/data/readMbaPlanDetail"
import { mapPlanVersionFromPostgres } from "@/lib/data/readMediaPlans"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { generateMediaPlan } from "@/lib/generateMediaPlan"
import { parseMoneyInput } from "@/lib/format/money"
import { PersistedDocError } from "@/lib/docs/buildMbaFromPersisted"
import {
  buildMediaItemsFromPlanDetail,
} from "@/lib/docs/buildMediaItemsFromPersisted"

const here = dirname(fileURLToPath(import.meta.url))
const dump = JSON.parse(
  readFileSync(join(here, "fixtures/glenda008-v6.plan.json"), "utf8"),
) as {
  master: { mbaNumber: string; mpClientName: string; publishedVersionId: number }
  version: Record<string, unknown>
  feeSnapshot: Record<string, unknown>
  lineItems: Record<string, unknown>[]
}
const expected = JSON.parse(
  readFileSync(join(here, "fixtures/glenda008-v6.expected.json"), "utf8"),
) as {
  source: string
  channelLineCounts: Record<string, number>
  excelBurstRowCounts: Record<string, number>
  expectedWorkbookSheetNames: string[]
}

const LOGO = readFileSync(
  join(process.cwd(), "public/assembled-logo.png"),
).toString("base64")

function versionMapped(overrides: Record<string, unknown> = {}) {
  return mapPlanVersionFromPostgres({
    ...dump.version,
    mbaNumber: dump.master.mbaNumber,
    masterId: 260,
    ...overrides,
  })
}

function groupedLines() {
  return groupLineItemsByMbaGetKey(dump.lineItems, {
    versionId: Number(dump.version.id),
    versionNumber: Number(dump.version.versionNumber),
    mbaNumber: dump.master.mbaNumber,
    mpClientName: dump.master.mpClientName,
  })
}

function money(value: unknown): number {
  return parseMoneyInput(value as string | number) ?? 0
}

describe("buildMediaItemsFromPlanDetail", () => {
  it("throws PersistedDocError NOT_APPROVED when the version is unpublished", () => {
    assert.throws(
      () =>
        buildMediaItemsFromPlanDetail({
          versionData: versionMapped({ publishedAt: null }),
          clientName: dump.master.mpClientName,
          lineItems: groupedLines(),
          feeSnapshot: dump.feeSnapshot,
          publishers: [],
          logoBase64: LOGO,
        }),
      (err: unknown) =>
        err instanceof PersistedDocError && err.code === "NOT_APPROVED",
    )
  })

  it("maps glenda008 v6 channels, burstAmounts, and mbaData from the Postgres dump", () => {
    const result = buildMediaItemsFromPlanDetail({
      versionData: versionMapped(),
      clientName: dump.master.mpClientName,
      lineItems: groupedLines(),
      feeSnapshot: dump.feeSnapshot,
      publishers: [],
      logoBase64: LOGO,
    })

    assert.equal(result.header.mbaNumber, "glenda008")
    assert.equal(result.header.planVersion, "6")
    assert.equal(result.header.client, "Glendale Community College")
    assert.equal(result.header.campaignStart, "02/07/2026")
    assert.equal(result.header.campaignEnd, "30/09/2026")

    for (const [key, count] of Object.entries(expected.excelBurstRowCounts)) {
      const rows = result.mediaItems[key as keyof typeof result.mediaItems]
      assert.equal(rows.length, count, `${key} excel burst rows`)
    }

    for (const item of [
      ...result.mediaItems.radio,
      ...result.mediaItems.socialMedia,
      ...result.mediaItems.bvod,
    ]) {
      const amounts = computeBurstAmounts({
        rawBudget: money(item.deliverablesAmount),
        budgetIncludesFees: Boolean(item.budgetIncludesFees),
        clientPaysForMedia: Boolean(item.clientPaysForMedia),
        feePct:
          item.buyType === "cpm"
            ? Number(dump.feeSnapshot.feesocial) || 0
            : 0,
        buyType: item.buyType,
      })
      assert.equal(Number(item.grossMedia), amounts.mediaAmount)
    }

    const production = result.mediaItems.production[0]
    assert.ok(production)
    const prodAmounts = computeBurstAmounts({
      rawBudget: 12_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: Number(dump.feeSnapshot.feecontentcreator) || 0,
      buyType: "production",
    })
    assert.equal(Number(production.grossMedia), 12_000)
    assert.equal(prodAmounts.mediaAmount, 12_000)
    assert.equal(prodAmounts.feeAmount, 3_000)

    // mbaScopeTotals.grossMedia uses deliveryMediaAmount (client-pays social
    // 20000 is in). Production is excluded from gross and listed separately.
    // Snapshot has no feeradio/feebvod → those channels fee 0.
    // Production fee is always 0 in computeCampaignFinancials.
    assert.equal(result.mbaData.totals.gross_media, 75_500)
    assert.equal(result.mbaData.totals.service_fee, 5_000)
    assert.equal(result.mbaData.totals.production, 12_000)
    void expected.source
  })

  it("generateMediaPlan resolves with the same sheet names; totals cells match mbaData", async () => {
    const result = buildMediaItemsFromPlanDetail({
      versionData: versionMapped(),
      clientName: dump.master.mpClientName,
      lineItems: groupedLines(),
      feeSnapshot: dump.feeSnapshot,
      publishers: [],
      logoBase64: LOGO,
    })
    const workbook = await generateMediaPlan(
      result.header,
      result.mediaItems,
      result.mbaData,
    )
    const names = workbook.worksheets.map((ws) => ws.name)
    assert.deepEqual(names, expected.expectedWorkbookSheetNames)

    const sheet = workbook.getWorksheet("Media Plan")
    assert.ok(sheet)
    assert.ok((sheet.rowCount ?? 0) > 0)

    let foundGross = false
    sheet.eachRow((row) => {
      const label = String(row.getCell(13).value ?? "")
      if (label === "Total Gross Media:") {
        foundGross = true
        assert.equal(Number(row.getCell(14).value), result.mbaData.totals.gross_media)
      }
      if (label === "Service Fee:") {
        assert.equal(Number(row.getCell(14).value), result.mbaData.totals.service_fee)
      }
      if (label === "Production:") {
        assert.equal(Number(row.getCell(14).value), result.mbaData.totals.production)
      }
    })
    assert.equal(foundGross, true)
  })
})
