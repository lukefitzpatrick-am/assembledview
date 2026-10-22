/**
 * FP-6 finance owner per client (D6). Pure helpers shared by the API, the
 * Owners tab and the To bill client cards. No I/O.
 */

export type FinanceOwnerRow = {
  clientId: number
  clientName: string
  teamMemberId: number | null
  ownerName: string | null
  updatedAt: string | null
  updatedByName: string | null
}

export type FinanceOwnerCandidate = {
  id: number
  name: string
  email: string
}

export type FinanceOwnersPayload =
  | {
      ready: true
      rows: FinanceOwnerRow[]
      candidates: FinanceOwnerCandidate[]
    }
  | {
      ready: false
      reason: "migration_not_applied"
      message: string
      rows: []
      candidates: []
    }

export const FINANCE_OWNERS_NOT_READY_MESSAGE =
  "Finance owners are not switched on yet. Migration 0105 (client_finance_owners) needs to be applied."

export type FinanceOwnerUpdate = { clientId: number; teamMemberId: number | null }

function positiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim())
    return Number.isSafeInteger(n) && n > 0 ? n : null
  }
  return null
}

/**
 * PUT body: `{ client_id, team_member_id }`. `team_member_id: null` clears the owner.
 * Returns a problem string when the body is not usable.
 */
export function parseFinanceOwnerUpdate(
  body: unknown,
): { ok: true; value: FinanceOwnerUpdate } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Send { client_id, team_member_id }." }
  }
  const row = body as Record<string, unknown>
  const clientId = positiveInt(row.client_id)
  if (clientId == null) return { ok: false, message: "client_id must be a positive whole number." }
  if (!("team_member_id" in row)) {
    return { ok: false, message: "team_member_id is required (null clears the owner)." }
  }
  if (row.team_member_id === null || row.team_member_id === "") {
    return { ok: true, value: { clientId, teamMemberId: null } }
  }
  const teamMemberId = positiveInt(row.team_member_id)
  if (teamMemberId == null) {
    return { ok: false, message: "team_member_id must be a positive whole number or null." }
  }
  return { ok: true, value: { clientId, teamMemberId } }
}

/** Client id → owner display name, for the To bill cards. Unowned clients are absent. */
export function financeOwnerNameByClient(rows: readonly FinanceOwnerRow[]): Map<number, string> {
  const out = new Map<number, string>()
  for (const row of rows) {
    const name = (row.ownerName ?? "").trim()
    if (row.teamMemberId != null && name) out.set(row.clientId, name)
  }
  return out
}

/** Every client once, sorted by name; owner fields null when no row exists. */
export function mergeFinanceOwnerRows(input: {
  clients: ReadonlyArray<{ id: number; name: string }>
  owners: ReadonlyArray<{
    clientId: number
    teamMemberId: number | null
    ownerName: string | null
    updatedAt: string | null
    updatedByName: string | null
  }>
}): FinanceOwnerRow[] {
  const byClient = new Map(input.owners.map((o) => [o.clientId, o]))
  return input.clients
    .map((client) => {
      const owner = byClient.get(client.id)
      return {
        clientId: client.id,
        clientName: client.name.trim() || `Client ${client.id}`,
        teamMemberId: owner?.teamMemberId ?? null,
        ownerName: owner?.teamMemberId != null ? (owner.ownerName ?? null) : null,
        updatedAt: owner?.updatedAt ?? null,
        updatedByName: owner?.updatedByName ?? null,
      }
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName, "en-AU", { sensitivity: "base" }))
}

/** Client-side loader for the To bill cards. Never throws; empty map on any failure. */
export async function loadFinanceOwnerNames(): Promise<Map<number, string>> {
  const empty = new Map<number, string>()
  if (typeof fetch === "undefined") return empty
  try {
    const res = await fetch("/api/finance/owners")
    if (!res.ok) return empty
    const body = (await res.json()) as FinanceOwnersPayload
    if (!body || body.ready !== true || !Array.isArray(body.rows)) return empty
    return financeOwnerNameByClient(body.rows)
  } catch {
    return empty
  }
}
