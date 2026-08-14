/**
 * MBA dropdown for Codex task detail: the selected client's campaign numbers,
 * highest / most recent first. MBA identity stays a string (no numeric coerce).
 */

export const MBA_NONE_VALUE = "__none__"

export type MbaPlanRow = {
  mba_number?: unknown
  mbaNumber?: unknown
  client_id?: unknown
  clients_id?: unknown
  clientId?: unknown
}

export function sortMbaNumbersDesc(mbas: string[]): string[] {
  return mbas.toSorted((a, b) =>
    b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }),
  )
}

function planClientId(row: MbaPlanRow): number | null {
  const raw = row.client_id ?? row.clients_id ?? row.clientId
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function planMbaNumber(row: MbaPlanRow): string {
  const raw = row.mba_number ?? row.mbaNumber
  if (typeof raw === "string") return raw.trim()
  if (raw == null) return ""
  return String(raw).trim()
}

/** Unique MBA numbers for `clientId`, descending. Empty when no client. */
export function mbasForClientFromPlans(
  plans: MbaPlanRow[],
  clientId: number | null | undefined,
): string[] {
  if (clientId == null || !Number.isFinite(clientId) || clientId < 1) {
    return []
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const plan of plans) {
    if (planClientId(plan) !== clientId) continue
    const mba = planMbaNumber(plan)
    if (!mba || seen.has(mba)) continue
    seen.add(mba)
    out.push(mba)
  }
  return sortMbaNumbersDesc(out)
}

/** Keep a legacy free-text MBA visible if it is not in the client's list. */
export function mbaSelectOptions(
  clientMbas: string[],
  currentMba: string | null | undefined,
): string[] {
  const cur = (currentMba ?? "").trim()
  if (!cur || clientMbas.includes(cur)) return clientMbas
  return sortMbaNumbersDesc([...clientMbas, cur])
}
