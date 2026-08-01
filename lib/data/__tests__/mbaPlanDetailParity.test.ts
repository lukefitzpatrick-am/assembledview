/**
 * Shape-parity for MBA GET Postgres port (C-22 / DI-9 / DI-10).
 *
 * Loads the 2026-08-01 export-snapshot fixture through:
 *   - Xano-semantics path (published watermark + 1 for nextVersionNumber,
 *     Xano master scalars present)
 *   - Postgres path (mappers + tip+1 + assembleMbaPlanDetailFromParts)
 * and diffs the full JSON. Intentional differences must be listed in
 * MBA_PLAN_DETAIL_INTENTIONAL_DIFFS — never silently shipped.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  assembleMbaPlanDetailFromParts,
  groupLineItemsByMbaGetKey,
  MBA_PLAN_DETAIL_INTENTIONAL_DIFFS,
  PLAN_DETAIL_POSTGRES_ERROR_CODE,
} from "../readMbaPlanDetail"
import {
  mapPlanMasterFromPostgres,
  mapPlanVersionFromPostgres,
} from "../readMediaPlans"
import {
  FIXTURE_MASTER_XANO,
  FIXTURE_MBA_NUMBER,
  FIXTURE_PG_LINE_SEARCH,
  FIXTURE_PG_LINE_SOCIAL,
  FIXTURE_PUBLISHED_VERSION,
  FIXTURE_TIP_WITH_STAGED,
  FIXTURE_VERSION_XANO,
  FIXTURE_VERSIONS_META,
} from "./fixtures/mbaPlanDetail.2026-08-01"

/** Paths that may differ intentionally — see MBA_PLAN_DETAIL_INTENTIONAL_DIFFS. */
const INTENTIONAL_PATH_PREFIXES = [
  "inputs_hash",
  "rebill_needed",
  "latest_version_id",
  "temp_version_number",
  "nextVersionNumber",
  // Nested copies after master∪version spread
  "versionData.inputs_hash",
  "versionData.rebill_needed",
  "versionData.latest_version_id",
  "versionData.temp_version_number",
] as const

function isIntentionalPath(path: string): boolean {
  return INTENTIONAL_PATH_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}.`)
  )
}

function collectDiffs(
  a: unknown,
  b: unknown,
  path = ""
): Array<{ path: string; a: unknown; b: unknown }> {
  const diffs: Array<{ path: string; a: unknown; b: unknown }> = []
  if (Object.is(a, b)) return diffs

  const aIsArr = Array.isArray(a)
  const bIsArr = Array.isArray(b)
  if (aIsArr || bIsArr) {
    if (!aIsArr || !bIsArr || a.length !== b.length) {
      diffs.push({ path: path || "(root)", a, b })
      return diffs
    }
    for (let i = 0; i < a.length; i++) {
      diffs.push(...collectDiffs(a[i], b[i], `${path}[${i}]`))
    }
    return diffs
  }

  const aIsObj = a != null && typeof a === "object"
  const bIsObj = b != null && typeof b === "object"
  if (aIsObj && bIsObj) {
    const aRec = a as Record<string, unknown>
    const bRec = b as Record<string, unknown>
    const keys = new Set([...Object.keys(aRec), ...Object.keys(bRec)])
    for (const key of keys) {
      const child = path ? `${path}.${key}` : key
      if (!(key in aRec)) {
        diffs.push({ path: child, a: undefined, b: bRec[key] })
        continue
      }
      if (!(key in bRec)) {
        diffs.push({ path: child, a: aRec[key], b: undefined })
        continue
      }
      diffs.push(...collectDiffs(aRec[key], bRec[key], child))
    }
    return diffs
  }

  diffs.push({ path: path || "(root)", a, b })
  return diffs
}

function assembleXanoPath(opts?: {
  tipVersionNumber?: number
  includeXanoOnlyScalars?: boolean
}): Record<string, unknown> {
  const tip = opts?.tipVersionNumber ?? FIXTURE_PUBLISHED_VERSION
  const published = FIXTURE_PUBLISHED_VERSION
  const master = { ...FIXTURE_MASTER_XANO }
  if (opts?.includeXanoOnlyScalars === false) {
    delete master.inputs_hash
    delete master.rebill_needed
    delete master.latest_version_id
    delete master.temp_version_number
  }
  // Xano GET historically: next = published watermark + 1
  const nextVersionNumber = published + 1
  void tip // tip ignored on Xano path — intentional gap when tip > published

  const versionData = {
    ...FIXTURE_VERSION_XANO,
    mp_client_name:
      FIXTURE_VERSION_XANO.mp_client_name || master.mp_client_name || "",
  }

  // Xano path delivers already-shaped channel arrays (recorded export shape).
  const lineItemsData = groupLineItemsByMbaGetKey(
    [FIXTURE_PG_LINE_SEARCH, FIXTURE_PG_LINE_SOCIAL],
    {
      versionId: Number(versionData.id),
      versionNumber: published,
      mbaNumber: FIXTURE_MBA_NUMBER,
      mpClientName:
        typeof master.mp_client_name === "string" ? master.mp_client_name : null,
    }
  )

  return assembleMbaPlanDetailFromParts({
    mbaNumber: FIXTURE_MBA_NUMBER,
    masterData: master,
    versionData,
    lineItemsData,
    versionsMetadata: FIXTURE_VERSIONS_META,
    latestVersionNumber: published,
    nextVersionNumber,
    targetVersionNumber: published,
    billingScheduleFull: true,
    clientBrandColour: "#112233",
  })
}

function assemblePostgresPath(opts?: {
  tipVersionNumber?: number
}): Record<string, unknown> {
  const tip = opts?.tipVersionNumber ?? FIXTURE_PUBLISHED_VERSION
  const published = FIXTURE_PUBLISHED_VERSION

  // Simulate Drizzle rows → mappers (same as readMbaPlanDetail).
  const pgMasterRow = {
    id: 1108,
    mbaNumber: FIXTURE_MBA_NUMBER,
    mpClientName: "Acme Co",
    campaignName: "FY26 Brand",
    campaignStatus: "approved",
    campaignStartDate: "2025-01-01",
    campaignEndDate: "2025-03-31",
    campaignBudgetCents: "5000000",
    publishedVersionId: 2202,
    clientId: 44,
    createdAt: "2025-01-01T00:00:00.000Z",
  }
  const pgVersionRow = {
    id: 2202,
    masterId: 1108,
    mbaNumber: FIXTURE_MBA_NUMBER,
    versionNumber: published,
    campaignName: "FY26 Brand",
    campaignStatus: "approved",
    campaignStartDate: "2025-01-01",
    campaignEndDate: "2025-03-31",
    brand: "Acme",
    clientContact: "jane@acme.test",
    poNumber: "PO-0042",
    campaignBudgetCents: "5000000",
    fixedFee: null,
    legacySchedules: {
      billingSchedule: FIXTURE_VERSION_XANO.billingSchedule,
      deliverySchedule: FIXTURE_VERSION_XANO.deliverySchedule,
    },
    channelFlags: {
      search: true,
      social: true,
      television: false,
    },
    mediaPlanFile: null,
    mbaPdfFile: null,
    aaMediaPlanFile: null,
    createdAt: "2025-01-01T00:00:00.000Z",
  }

  const publishedApi = {
    version_number: published,
  }
  const master = mapPlanMasterFromPostgres(pgMasterRow, publishedApi, null)
  let versionData = mapPlanVersionFromPostgres(pgVersionRow)
  versionData = {
    ...versionData,
    mp_client_name:
      versionData.mp_client_name || master.mp_client_name || "",
  }

  const lineItemsData = groupLineItemsByMbaGetKey(
    [FIXTURE_PG_LINE_SEARCH, FIXTURE_PG_LINE_SOCIAL],
    {
      versionId: Number(versionData.id),
      versionNumber: published,
      mbaNumber: FIXTURE_MBA_NUMBER,
      mpClientName:
        typeof master.mp_client_name === "string" ? master.mp_client_name : null,
    }
  )

  // O4.6: Postgres next = tip + 1
  const nextVersionNumber = tip + 1

  return assembleMbaPlanDetailFromParts({
    mbaNumber: FIXTURE_MBA_NUMBER,
    masterData: master,
    versionData,
    lineItemsData,
    versionsMetadata: FIXTURE_VERSIONS_META,
    latestVersionNumber: published,
    nextVersionNumber,
    targetVersionNumber: published,
    billingScheduleFull: true,
    clientBrandColour: "#112233",
  })
}

describe("MBA plan detail shape parity (C-22)", () => {
  it("documents intentional Postgres-vs-Xano diffs", () => {
    assert.ok(MBA_PLAN_DETAIL_INTENTIONAL_DIFFS.length >= 2)
    const paths = MBA_PLAN_DETAIL_INTENTIONAL_DIFFS.map((d) => d.path)
    assert.ok(paths.some((p) => p.includes("nextVersionNumber")))
    assert.equal(PLAN_DETAIL_POSTGRES_ERROR_CODE, "PLAN_DETAIL_POSTGRES_FAILED")
  })

  it("DI-10: mba_number / line_item_id stay identifier strings", () => {
    const pg = assemblePostgresPath()
    assert.equal(typeof pg.mba_number, "string")
    assert.equal(pg.mba_number, FIXTURE_MBA_NUMBER)
    assert.equal(typeof pg.mbaNumber, "string")
    assert.equal(pg.mbaNumber, FIXTURE_MBA_NUMBER)
    const search = (pg.lineItems as { search: Array<Record<string, unknown>> })
      .search[0]
    assert.equal(typeof search.mba_number, "string")
    assert.equal(search.mba_number, FIXTURE_MBA_NUMBER)
    assert.equal(typeof search.line_item_id, "string")
    assert.equal(search.line_item_id, `${FIXTURE_MBA_NUMBER}SE1`)
    assert.equal(typeof search.po_number, "undefined") // on version, not line
    assert.equal(typeof pg.po_number, "string")
    assert.equal(pg.po_number, "PO-0042")
  })

  it("DI-9: master-owned mp_client_name overlays onto combined payload", () => {
    const pg = assemblePostgresPath()
    assert.equal(pg.mp_client_name, "Acme Co")
    const versionData = pg.versionData as Record<string, unknown>
    assert.equal(versionData.mp_client_name, "Acme Co")
    const search = (pg.lineItems as { search: Array<Record<string, unknown>> })
      .search[0]
    assert.equal(search.mp_client_name, "Acme Co")
  })

  it("when tip === published, full JSON matches after stripping intentional Xano-only scalars", () => {
    const xano = assembleXanoPath({ includeXanoOnlyScalars: true })
    const pg = assemblePostgresPath({ tipVersionNumber: FIXTURE_PUBLISHED_VERSION })

    // Same tip ⇒ nextVersionNumber agrees (published+1 === tip+1).
    assert.equal(xano.nextVersionNumber, pg.nextVersionNumber)
    assert.equal(pg.nextVersionNumber, FIXTURE_PUBLISHED_VERSION + 1)

    const allDiffs = collectDiffs(xano, pg)
    const unexpected = allDiffs.filter((d) => !isIntentionalPath(d.path))
    if (unexpected.length > 0) {
      const sample = unexpected
        .slice(0, 12)
        .map((d) => `${d.path}: xano=${JSON.stringify(d.a)} pg=${JSON.stringify(d.b)}`)
        .join("\n")
      assert.fail(
        `Unexpected shape diffs (${unexpected.length}):\n${sample}`
      )
    }

    // Every remaining diff must be an intentional Xano-only scalar absence.
    for (const d of allDiffs) {
      assert.ok(
        isIntentionalPath(d.path),
        `diff path not listed intentional: ${d.path}`
      )
    }
  })

  it("when tip > published, nextVersionNumber is the only numeric intentional gap", () => {
    const xano = assembleXanoPath({
      tipVersionNumber: FIXTURE_TIP_WITH_STAGED,
      includeXanoOnlyScalars: false,
    })
    const pg = assemblePostgresPath({
      tipVersionNumber: FIXTURE_TIP_WITH_STAGED,
    })

    assert.equal(xano.nextVersionNumber, FIXTURE_PUBLISHED_VERSION + 1)
    assert.equal(pg.nextVersionNumber, FIXTURE_TIP_WITH_STAGED + 1)

    const allDiffs = collectDiffs(xano, pg)
    const unexpected = allDiffs.filter((d) => !isIntentionalPath(d.path))
    assert.equal(
      unexpected.length,
      0,
      unexpected
        .slice(0, 8)
        .map((d) => d.path)
        .join(", ")
    )
    assert.ok(allDiffs.some((d) => d.path === "nextVersionNumber"))
  })

  it("response top-level contract: versions watermark, lineItems keys, metrics", () => {
    const pg = assemblePostgresPath()
    assert.ok(Array.isArray(pg.versions))
    assert.equal((pg.versions as unknown[]).length, 2)
    assert.equal(pg.latestVersionNumber, FIXTURE_PUBLISHED_VERSION)
    assert.equal(pg.media_plan_master_id, 1108)
    assert.equal(pg.version_number, FIXTURE_PUBLISHED_VERSION)
    assert.ok(pg.lineItems && typeof pg.lineItems === "object")
    const keys = Object.keys(pg.lineItems as object).sort()
    assert.ok(keys.includes("search"))
    assert.ok(keys.includes("socialMedia"))
    assert.ok(keys.includes("television"))
    assert.ok(pg.metrics && typeof pg.metrics === "object")
    assert.ok("expectedSpendToDate" in (pg.metrics as object))
    assert.ok(pg.debug && typeof pg.debug === "object")
  })
})
