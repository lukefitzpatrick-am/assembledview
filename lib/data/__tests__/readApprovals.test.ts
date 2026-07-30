/**
 * PC0 — mba_line_approvals shadow compare + absence semantics + postgres patch.
 * DB-backed cases skip when DATABASE_URL unset or table missing (0007 not applied).
 *
 * Does not import readApprovals.ts (`server-only`) — golden compare uses shadowDiff
 * + mbaLineApprovalsClient; round-trip uses writeApprovals (no server-only, like savePlan).
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { and, eq, sql } from "drizzle-orm"

import { closeDb, getDb, schema } from "@/db"
import { compareReferenceRows } from "../shadowDiff"
import { coerceNumericStringsToNumbers, toApiRow } from "../toApiRow"
import { patchMbaLineApprovalsOnPostgres } from "../writeApprovals"
import {
  selectedLineItemIdsFromApprovalRows,
  type MbaLineApprovalRow,
} from "@/lib/finance/mbaLineApprovalsClient"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

type ApprovalApiRow = {
  id?: number
  mba_number: string
  media_plan_version: number
  line_item_id: string
  media_type: string
  approved: boolean
  approved_in_version?: number | null
}

function mapApprovalRowFromPostgres(row: Record<string, unknown>): ApprovalApiRow {
  const shaped = coerceNumericStringsToNumbers(toApiRow(row))
  return {
    id: shaped.id != null ? Number(shaped.id) : undefined,
    mba_number: String(shaped.mba_number ?? ""),
    media_plan_version: Number(shaped.media_plan_version ?? 0),
    line_item_id: String(shaped.line_item_id ?? ""),
    media_type: String(shaped.media_type ?? ""),
    approved: shaped.approved === true || shaped.approved === "true",
    approved_in_version:
      shaped.approved_in_version == null || shaped.approved_in_version === ""
        ? null
        : Number(shaped.approved_in_version),
  }
}

async function tableExists(): Promise<boolean> {
  if (!hasDb) return false
  try {
    const db = getDb()
    const result = await Promise.race([
      db.execute(
        sql.raw(
          `SELECT to_regclass('public.mba_line_approvals') IS NOT NULL AS exists`
        )
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("tableExists timeout")), 8_000)
      ),
    ])
    const rows = result as unknown as Array<{ exists: boolean }>
    return Boolean(rows[0]?.exists)
  } catch {
    return false
  }
}

describe("mba_line_approvals shadow compare golden", () => {
  it("rows equal → zero field diffs / missing", () => {
    const rows: ApprovalApiRow[] = [
      {
        id: 1,
        mba_number: "TEST001",
        media_plan_version: 2,
        line_item_id: "TEST001SEA001",
        media_type: "search",
        approved: false,
        approved_in_version: null,
      },
      {
        id: 2,
        mba_number: "TEST001",
        media_plan_version: 2,
        line_item_id: "TEST001SOC001",
        media_type: "social",
        approved: false,
        approved_in_version: null,
      },
    ]
    const event = compareReferenceRows("mba_line_approvals", rows, rows, {
      domain: "approvals",
      postgresKeysOnly: true,
    })
    assert.equal(event.xanoCount, 2)
    assert.equal(event.postgresCount, 2)
    assert.deepEqual(event.missingInPostgres, [])
    assert.deepEqual(event.missingInXano, [])
    assert.deepEqual(event.fieldDiffs, [])
  })

  it("maps drizzle camelCase → API snake_case", () => {
    const mapped = mapApprovalRowFromPostgres({
      id: 9,
      createdAt: "2026-07-30T00:00:00.000Z",
      mbaNumber: "ABC001",
      mediaPlanVersion: 3,
      lineItemId: "ABC001TV1",
      mediaType: "television",
      approved: false,
      approvedInVersion: null,
    })
    assert.equal(mapped.mba_number, "ABC001")
    assert.equal(mapped.media_plan_version, 3)
    assert.equal(mapped.line_item_id, "ABC001TV1")
    assert.equal(mapped.media_type, "television")
    assert.equal(mapped.approved, false)
    assert.equal(mapped.approved_in_version, null)
  })
})

describe("mba_line_approvals absence ⇒ approved", () => {
  it("empty rows keep all line ids selected (all-in)", () => {
    const rows: MbaLineApprovalRow[] = []
    const selected = selectedLineItemIdsFromApprovalRows({
      rows,
      allLineIdsByMedia: {
        search: ["A1", "A2"],
        social: ["B1"],
      },
    })
    assert.deepEqual(selected.search, ["A1", "A2"])
    assert.deepEqual(selected.social, ["B1"])
  })

  it("approved:false rows are exclusions only", () => {
    const rows: MbaLineApprovalRow[] = [
      { line_item_id: "A2", media_type: "search", approved: false },
    ]
    const selected = selectedLineItemIdsFromApprovalRows({
      rows,
      allLineIdsByMedia: {
        search: ["A1", "A2"],
        social: ["B1"],
      },
    })
    assert.deepEqual(selected.search, ["A1"])
    assert.deepEqual(selected.social, ["B1"])
  })
})

describe("mba_line_approvals postgres patch round-trip", () => {
  const MBA = `pc0appr${Date.now().toString(36)}`
  const VERSION = 1
  const LINE = `${MBA.toUpperCase()}SEA001`
  let ready = false

  before(async () => {
    ready = await tableExists()
  })

  after(async () => {
    if (ready) {
      const db = getDb()
      await db
        .delete(schema.mbaLineApprovals)
        .where(eq(schema.mbaLineApprovals.mbaNumber, MBA))
    }
    if (hasDb) {
      await closeDb().catch(() => undefined)
    }
  })

  it("exclude then approve restores absence (all-in)", async (t) => {
    if (!ready) {
      t.skip("mba_line_approvals missing — apply 0007 + DATABASE_URL")
      return
    }

    await patchMbaLineApprovalsOnPostgres({
      mbaNumber: MBA,
      mediaPlanVersion: VERSION,
      lines: [
        { line_item_id: LINE, media_type: "search", approved: false },
      ],
    })

    const db = getDb()
    const afterExclude = await db
      .select()
      .from(schema.mbaLineApprovals)
      .where(
        and(
          eq(schema.mbaLineApprovals.mbaNumber, MBA),
          eq(schema.mbaLineApprovals.mediaPlanVersion, VERSION)
        )
      )
    assert.equal(afterExclude.length, 1)
    assert.equal(afterExclude[0]!.approved, false)
    assert.equal(afterExclude[0]!.lineItemId, LINE)

    await patchMbaLineApprovalsOnPostgres({
      mbaNumber: MBA,
      mediaPlanVersion: VERSION,
      lines: [
        { line_item_id: LINE, media_type: "search", approved: true },
      ],
    })

    const afterApprove = await db
      .select()
      .from(schema.mbaLineApprovals)
      .where(
        and(
          eq(schema.mbaLineApprovals.mbaNumber, MBA),
          eq(schema.mbaLineApprovals.mediaPlanVersion, VERSION)
        )
      )
    assert.equal(afterApprove.length, 0)
  })
})
