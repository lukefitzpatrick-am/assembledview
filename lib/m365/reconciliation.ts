import { siteUrlForClient } from "@/lib/m365/siteUrlForClient"

/** Skeleton Graph column copy while provisioning flag is off / credentials absent. */
export const M365_GRAPH_CHECK_PENDING = "pending — provisioning flag off"

export type ReconciliationClientInput = {
  id: number | string
  mp_client_name?: string | null
  mbaidentifier?: string | null
  slug?: string | null
  sharepoint_site_url?: string | null
  teams_group_id?: string | null
  m365_is_anchor?: boolean | null
}

export type PlanMbaInput = {
  id: number | string
  mba_number: string
  mp_client_name?: string | null
  campaign_name?: string | null
  client_id?: number | string | null
}

export type ReconciliationClientRow = {
  clientId: number
  clientName: string | null
  mbaidentifier: string | null
  /** lower(trim(mbaidentifier)); empty identifier → null (singleton group). */
  identifierGroupKey: string | null
  isAnchor: boolean
  derivedSiteUrl: string | null
  storedSharepointSiteUrl: string | null
  storedTeamsGroupId: string | null
  dashboardSlug: string | null
  /** True when group casings disagree or any stored id is not already lowercased. */
  mbaidentifierCasingAnomaly: boolean
  checkedAgainstGraph: string
  groupMemberCount: number
}

export type UnmatchedPlanRow = {
  masterId: number
  mbaNumber: string
  clientName: string | null
  campaignName: string | null
  clientId: number | null
  reason: "no_matching_client_identifier"
}

export type M365ReconciliationReport = {
  clientRows: ReconciliationClientRow[]
  /** Distinct identifier groups (ordered), for UI sectioning. */
  identifierGroups: Array<{
    key: string | null
    memberCount: number
    casingAnomaly: boolean
    derivedSiteUrl: string | null
  }>
  unmatchedPlans: UnmatchedPlanRow[]
}

export function identifierGroupKey(
  mbaidentifier: string | null | undefined
): string | null {
  const id = String(mbaidentifier ?? "").trim()
  if (!id) return null
  return id.toLowerCase()
}

/**
 * Casing anomaly for a resolveClientGroup-style set of mbaidentifier values:
 * more than one distinct trimmed casing, or any value that is not already
 * lowercased (siteUrlForClient canonicalises to lower).
 */
export function hasMbaIdentifierCasingAnomaly(
  variants: ReadonlyArray<string | null | undefined>
): boolean {
  const trimmed = variants
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0)
  if (trimmed.length === 0) return false
  const distinct = new Set(trimmed)
  if (distinct.size > 1) return true
  for (const v of trimmed) {
    if (v !== v.toLowerCase()) return true
  }
  return false
}

/**
 * Plan mba_number matches a client identifier the same way as
 * resolveClientsIdByMbaIdentifier: case-insensitive prefix (longest wins
 * there; here any match is enough for "has a client").
 */
export function mbaMatchesClientIdentifier(
  mbaNumber: string,
  identifiers: Iterable<string>
): boolean {
  const needle = String(mbaNumber ?? "").trim().toLowerCase()
  if (!needle) return false
  for (const raw of identifiers) {
    const prefix = String(raw ?? "").trim().toLowerCase()
    if (!prefix) continue
    if (needle.startsWith(prefix)) return true
  }
  return false
}

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function textOrNull(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

/**
 * Every clients row → reconciliation columns, sorted by identifier group then id.
 * Graph check is skeleton-only until credentials + live check land.
 */
export function buildClientReconciliationRows(
  clients: ReadonlyArray<ReconciliationClientInput>,
  opts?: { provisioningEnabled?: boolean }
): ReconciliationClientRow[] {
  const checkedAgainstGraph = opts?.provisioningEnabled
    ? "pending — Graph check not wired"
    : M365_GRAPH_CHECK_PENDING

  const byKey = new Map<string, ReconciliationClientInput[]>()
  const emptySingles: ReconciliationClientInput[] = []

  for (const row of clients) {
    const key = identifierGroupKey(row.mbaidentifier)
    if (key == null) {
      emptySingles.push(row)
      continue
    }
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }

  const out: ReconciliationClientRow[] = []

  const keys = [...byKey.keys()].sort((a, b) => a.localeCompare(b))
  for (const key of keys) {
    const members = byKey.get(key)!
    members.sort((a, b) => (toNum(a.id) ?? 0) - (toNum(b.id) ?? 0))
    const casingAnomaly = hasMbaIdentifierCasingAnomaly(
      members.map((m) => m.mbaidentifier)
    )
    const derivedSiteUrl = siteUrlForClient(members[0]?.mbaidentifier)
    for (const m of members) {
      const clientId = toNum(m.id)
      if (clientId == null) continue
      out.push({
        clientId,
        clientName: textOrNull(m.mp_client_name),
        mbaidentifier: textOrNull(m.mbaidentifier),
        identifierGroupKey: key,
        isAnchor: m.m365_is_anchor === true,
        derivedSiteUrl,
        storedSharepointSiteUrl: textOrNull(m.sharepoint_site_url),
        storedTeamsGroupId: textOrNull(m.teams_group_id),
        dashboardSlug: textOrNull(m.slug),
        mbaidentifierCasingAnomaly: casingAnomaly,
        checkedAgainstGraph,
        groupMemberCount: members.length,
      })
    }
  }

  emptySingles.sort((a, b) => (toNum(a.id) ?? 0) - (toNum(b.id) ?? 0))
  for (const m of emptySingles) {
    const clientId = toNum(m.id)
    if (clientId == null) continue
    out.push({
      clientId,
      clientName: textOrNull(m.mp_client_name),
      mbaidentifier: null,
      identifierGroupKey: null,
      isAnchor: m.m365_is_anchor === true,
      derivedSiteUrl: null,
      storedSharepointSiteUrl: textOrNull(m.sharepoint_site_url),
      storedTeamsGroupId: textOrNull(m.teams_group_id),
      dashboardSlug: textOrNull(m.slug),
      mbaidentifierCasingAnomaly: false,
      checkedAgainstGraph,
      groupMemberCount: 1,
    })
  }

  return out
}

/** TI-1 §3a: masters whose mba_number matches no client mbaidentifier. */
export function findUnmatchedPlanMbas(
  plans: ReadonlyArray<PlanMbaInput>,
  clients: ReadonlyArray<ReconciliationClientInput>
): UnmatchedPlanRow[] {
  const identifiers = clients
    .map((c) => String(c.mbaidentifier ?? "").trim())
    .filter((s) => s.length > 0)

  const out: UnmatchedPlanRow[] = []
  for (const plan of plans) {
    const mba = String(plan.mba_number ?? "").trim()
    if (!mba) continue
    if (mbaMatchesClientIdentifier(mba, identifiers)) continue
    const masterId = toNum(plan.id)
    if (masterId == null) continue
    out.push({
      masterId,
      mbaNumber: mba,
      clientName: textOrNull(plan.mp_client_name),
      campaignName: textOrNull(plan.campaign_name),
      clientId: toNum(plan.client_id),
      reason: "no_matching_client_identifier",
    })
  }

  out.sort((a, b) => a.mbaNumber.localeCompare(b.mbaNumber))
  return out
}

export function buildM365ReconciliationReport(
  clients: ReadonlyArray<ReconciliationClientInput>,
  plans: ReadonlyArray<PlanMbaInput>,
  opts?: { provisioningEnabled?: boolean }
): M365ReconciliationReport {
  const clientRows = buildClientReconciliationRows(clients, opts)
  const seen = new Set<string>()
  const identifierGroups: M365ReconciliationReport["identifierGroups"] = []
  for (const row of clientRows) {
    const mapKey = row.identifierGroupKey ?? `__empty:${row.clientId}`
    if (seen.has(mapKey)) continue
    seen.add(mapKey)
    identifierGroups.push({
      key: row.identifierGroupKey,
      memberCount: row.groupMemberCount,
      casingAnomaly: row.mbaidentifierCasingAnomaly,
      derivedSiteUrl: row.derivedSiteUrl,
    })
  }
  return {
    clientRows,
    identifierGroups,
    unmatchedPlans: findUnmatchedPlanMbas(plans, clients),
  }
}
