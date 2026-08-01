import "server-only"

import { and, eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import {
  getXanoBaseUrl,
  parseXanoListPayload,
  xanoAuthHeaderRecord,
} from "@/lib/api/xano"
import { getDataBackendFor } from "@/lib/data/backend"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { compareReferenceRows, recordShadowDiff } from "@/lib/data/shadowDiff"

const DOMAIN = "approvals" as const
const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
const XANO_TIMEOUT_MS = 15_000

export type MbaLineApprovalApiRow = {
  id?: number
  created_at?: string | number | null
  mba_number: string
  media_plan_version: number
  line_item_id: string
  media_type: string
  approved: boolean
  approved_in_version?: number | null
}

export type ReadMbaLineApprovalsResult =
  | { ok: true; lines: MbaLineApprovalApiRow[]; available: true }
  | { ok: true; lines: []; available: false; error?: string }

function asApprovalList(body: unknown): MbaLineApprovalApiRow[] {
  const list = Array.isArray(body)
    ? body
    : (parseXanoListPayload(body) as unknown[])
  return list.filter(
    (row): row is MbaLineApprovalApiRow =>
      !!row && typeof row === "object" && !Array.isArray(row)
  ) as MbaLineApprovalApiRow[]
}

export function mapApprovalRowFromPostgres(
  row: Record<string, unknown>
): MbaLineApprovalApiRow {
  const shaped = coerceNumericStringsToNumbers(toApiRow(row))
  return {
    id: shaped.id != null ? Number(shaped.id) : undefined,
    created_at: (shaped.created_at as string | null | undefined) ?? null,
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

export async function fetchMbaLineApprovalsFromPostgres(
  mbaNumber: string,
  mediaPlanVersion: number
): Promise<MbaLineApprovalApiRow[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.mbaLineApprovals)
    .where(
      and(
        eq(schema.mbaLineApprovals.mbaNumber, mbaNumber),
        eq(schema.mbaLineApprovals.mediaPlanVersion, mediaPlanVersion)
      )
    )
  return rows.map((row) =>
    mapApprovalRowFromPostgres(row as Record<string, unknown>)
  )
}

export async function fetchMbaLineApprovalsFromXano(
  mbaNumber: string,
  mediaPlanVersion: number
): Promise<{ status: number; lines: MbaLineApprovalApiRow[] }> {
  const baseUrl = getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
  const qs = new URLSearchParams({
    mba_number: mbaNumber,
    media_plan_version: String(mediaPlanVersion),
  })
  const upstream = await fetch(`${baseUrl}/mba_line_approvals?${qs}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...xanoAuthHeaderRecord(),
    },
    signal: AbortSignal.timeout(XANO_TIMEOUT_MS),
  })
  if (upstream.status === 404) {
    return { status: 404, lines: [] }
  }
  const contentType = upstream.headers.get("content-type") || ""
  const body = contentType.includes("application/json")
    ? await upstream.json()
    : await upstream.text()
  if (upstream.status >= 400) {
    throw new Error(
      `Xano mba_line_approvals GET failed: ${upstream.status} ${typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`
    )
  }
  return { status: upstream.status, lines: asApprovalList(body) }
}

/** Xano X5.1 table has no created_at; PG defaultNow() must not flood shadow diffs. */
function stripApprovalsShadowNoise(
  rows: MbaLineApprovalApiRow[]
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const { created_at: _createdAt, ...rest } = row
    return rest as Record<string, unknown>
  })
}

function runApprovalsShadowCompare(
  xanoLines: MbaLineApprovalApiRow[],
  postgresLines: MbaLineApprovalApiRow[]
): void {
  try {
    const event = compareReferenceRows(
      "mba_line_approvals",
      stripApprovalsShadowNoise(xanoLines),
      stripApprovalsShadowNoise(postgresLines),
      {
        domain: DOMAIN,
        postgresKeysOnly: true,
      }
    )
    recordShadowDiff(event)
  } catch (err) {
    console.error("[migration-shadow-diff] compare failed", {
      domain: DOMAIN,
      table: "mba_line_approvals",
      err,
    })
  }
}

/**
 * MBA line approvals for one (mba, version) with DATA_BACKEND_APPROVALS / DATA_BACKEND.
 * Absence of rows ⇒ all approved (caller / mbaLineApprovalsClient contract).
 * Fail-soft: upstream 404 / throw ⇒ { lines: [], available: false }.
 */
export async function readMbaLineApprovals(
  mbaNumber: string,
  mediaPlanVersion: number
): Promise<ReadMbaLineApprovalsResult> {
  const backend = getDataBackendFor(DOMAIN)

  try {
    if (backend === "postgres") {
      const lines = await fetchMbaLineApprovalsFromPostgres(
        mbaNumber,
        mediaPlanVersion
      )
      return { ok: true, lines, available: true }
    }

    const xano = await fetchMbaLineApprovalsFromXano(mbaNumber, mediaPlanVersion)
    if (xano.status === 404) {
      return { ok: true, lines: [], available: false }
    }

    if (backend === "shadow") {
      void (async () => {
        try {
          const postgresLines = await fetchMbaLineApprovalsFromPostgres(
            mbaNumber,
            mediaPlanVersion
          )
          runApprovalsShadowCompare(xano.lines, postgresLines)
        } catch (err) {
          console.error("[migration-shadow-diff] compare failed", {
            domain: DOMAIN,
            table: "mba_line_approvals",
            err,
          })
        }
      })()
    }

    return { ok: true, lines: xano.lines, available: true }
  } catch (err) {
    console.error("[readMbaLineApprovals]", err)
    return {
      ok: true,
      lines: [],
      available: false,
      error: "Failed to load mba_line_approvals",
    }
  }
}
